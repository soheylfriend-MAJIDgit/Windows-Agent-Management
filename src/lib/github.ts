import { unzipSync } from "fflate";
import { ARCHIVE_CACHE_MS, MAX_JOB_FILE_BYTES, repoApiUrl, zipUrl } from "./config";
import { base64ToBytes, textToBase64 } from "./crypto";
import { AppError, githubFailure } from "./errors";
import { countLines, extractDocstring, lintPython } from "./lint";
import type { Issue, RepoConfig } from "./types";

export interface ArchiveFile {
  name: string;
  content: string;
  size: number;
  lines: number;
  docstring: string;
  sha: string;
  archiveUpdatedAt: string | null;
  issues: Issue[];
  tooLarge: boolean;
}

export interface ArchiveSnapshot {
  files: ArchiveFile[];
  updatedAt: string | null;
  fetchedAt: string;
  etag: string | null;
  fromCache: boolean;
}

interface CacheEntry {
  at: number;
  snapshot: ArchiveSnapshot;
}

const cache = new Map<string, CacheEntry>();
const lastGood = new Map<string, ArchiveSnapshot>();
const lintCache = new Map<string, Issue[]>();

const cacheKey = (config: RepoConfig) => `${config.owner}/${config.repo}@${config.branch}`;

export function invalidateArchiveCache(config?: RepoConfig): void {
  if (!config) {
    cache.clear();
    return;
  }
  cache.delete(cacheKey(config));
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

/** خواندن زمان تغییر هر فایل از Central Directory فایل ZIP */
export function readZipTimes(bytes: Uint8Array): Map<string, string> {
  const result = new Map<string, string>();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const min = Math.max(0, bytes.byteLength - 65_558);
  let eocd = -1;
  for (let i = bytes.byteLength - 22; i >= min; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return result;
  const count = view.getUint16(eocd + 10, true);
  const offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let p = offset;
  for (let i = 0; i < count; i += 1) {
    if (p + 46 > bytes.byteLength || view.getUint32(p, true) !== 0x02014b50) break;
    const time = view.getUint16(p + 12, true);
    const date = view.getUint16(p + 14, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    if (date) {
      const year = 1980 + ((date >> 9) & 0x7f);
      const month = (date >> 5) & 0x0f;
      const day = date & 0x1f;
      const hour = (time >> 11) & 0x1f;
      const minute = (time >> 5) & 0x3f;
      const second = (time & 0x1f) * 2;
      if (month >= 1 && month <= 12 && day >= 1) {
        result.set(name, new Date(Date.UTC(year, month - 1, day, hour, minute, second)).toISOString());
      }
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return result;
}

function isRootJob(path: string): boolean {
  const parts = path.split("/");
  if (parts.length !== 2) return false;
  const name = parts[1];
  return /^job_[A-Za-z0-9_]+\.py$/.test(name) && !name.startsWith(".");
}

export async function fetchArchive(config: RepoConfig, options: { force?: boolean } = {}): Promise<ArchiveSnapshot> {
  const key = cacheKey(config);
  const hit = cache.get(key);
  if (!options.force && hit && Date.now() - hit.at < ARCHIVE_CACHE_MS) {
    return { ...hit.snapshot, fromCache: true };
  }

  const url = zipUrl(config);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": "windows-agent-management",
        Accept: "application/zip",
        "Cache-Control": "no-cache",
      },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(35_000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new AppError("دریافت بسته‌ی مخزن از گیت‌هاب ممکن نشد.", {
      status: 502,
      code: "github_unreachable",
      hint: "اینترنت/فیلترشکن، صحت نام مالک و مخزن، و دسترس‌پذیری codeload.github.com را بررسی کنید.",
      details: message,
    });
  }

  if (!res.ok) {
    throw githubFailure(res.status);
  }
  const declaredSize = Number(res.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredSize) && declaredSize > 25 * 1024 * 1024) {
    throw new AppError("حجم بسته‌ی مخزن بیش از ۲۵ مگابایت است.", {
      status: 502,
      code: "github_zip_too_large",
      hint: "فقط فایل‌های job_*.py ریشه لازم‌اند؛ اگر مخزن فایل سنگین دارد، آن را از ریشه‌ی شاخه‌ی ایجنت همکار بردارید.",
    });
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch {
    throw new AppError("خواندن بسته‌ی مخزن ممکن نشد.", { status: 502, code: "github_bad_zip" });
  }
  if (bytes.byteLength > 25 * 1024 * 1024) {
    throw new AppError("حجم بسته‌ی مخزن بیش از ۲۵ مگابایت است.", {
      status: 502,
      code: "github_zip_too_large",
    });
  }

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new AppError("بسته‌ی دریافتی معتبر نیست (ZIP خراب).", {
      status: 502,
      code: "github_bad_zip",
      hint: "چند لحظه بعد دوباره تلاش کنید؛ اگر ادامه داشت، نام شاخه را بررسی کنید.",
    });
  }

  const times = readZipTimes(bytes);
  const files: ArchiveFile[] = [];
  let updatedAt: string | null = null;

  for (const [path, data] of Object.entries(entries)) {
    if (!isRootJob(path)) continue;
    const name = path.split("/")[1];
    const content = decodeUtf8(data);
    const size = data.byteLength;
    const sha = await sha256(content);
    let issues = lintCache.get(sha);
    if (!issues) {
      const lint = lintPython(content, { name, checkSize: false });
      issues = [...lint.errors, ...lint.warnings];
      if (size > MAX_JOB_FILE_BYTES) {
        issues.unshift({
          code: "file_too_large",
          message: "حجم فایل بیش از ۵۱۲ کیلوبایت است.",
          severity: "error",
        });
      }
      lintCache.set(sha, issues);
      if (lintCache.size > 300) lintCache.clear();
    }
    const fileTime = times.get(path) ?? null;
    if (fileTime && (!updatedAt || fileTime > updatedAt)) updatedAt = fileTime;
    files.push({
      name,
      content,
      size,
      lines: countLines(content),
      docstring: extractDocstring(content),
      sha,
      archiveUpdatedAt: fileTime,
      issues,
      tooLarge: size > MAX_JOB_FILE_BYTES,
    });
  }

  files.sort((a, b) => a.name.localeCompare(b.name));
  const snapshot: ArchiveSnapshot = {
    files,
    updatedAt,
    fetchedAt: new Date().toISOString(),
    etag: res.headers.get("etag"),
    fromCache: false,
  };
  try {
    cache.set(key, { at: Date.now(), snapshot });
    lastGood.set(key, snapshot);
  } catch {
    // نادیده بگیر
  }
  return snapshot;
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function getLastGoodArchive(config: RepoConfig): ArchiveSnapshot | null {
  return lastGood.get(cacheKey(config)) ?? null;
}

// ------------------------------------------------------ GitHub REST API ---

const GH_HEADERS: Record<string, string> = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "windows-agent-management",
};

async function ghFetch(url: string, token: string | null, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Accept", GH_HEADERS.Accept);
  headers.set("X-GitHub-Api-Version", GH_HEADERS["X-GitHub-Api-Version"]);
  headers.set("User-Agent", GH_HEADERS["User-Agent"]);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...init, headers, cache: "no-store", signal: AbortSignal.timeout(30_000) });
}

export async function requireGithubToken(token: string | undefined): Promise<string> {
  if (!token) {
    throw new AppError("توکن گیت‌هاب تنظیم نشده است.", {
      status: 503,
      code: "github_token_missing",
      hint:
        "برای نوشتن در مخزن، GITHUB_TOKEN را در Vercel Environment Variables یا فایل محلی .env.local تنظیم کنید.",
    });
  }
  return token;
}

interface ContentsResponse {
  sha: string;
  size?: number;
  content?: string;
  encoding?: string;
  html_url?: string;
  download_url?: string | null;
  type?: string;
}

export interface RepoFile {
  content: string;
  sha: string;
  htmlUrl: string | null;
}

export async function readRepoFile(config: RepoConfig, path: string, token: string | null): Promise<RepoFile | null> {
  const url = `${repoApiUrl(config)}/contents/${encodePath(path)}?ref=${encodeURIComponent(config.branch)}`;
  const res = await ghFetch(url, token);
  if (res.status === 404) return null;
  if (!res.ok) throw githubFailure(res.status, await safeText(res));
  const data = (await res.json()) as ContentsResponse | ContentsResponse[];
  if (Array.isArray(data)) {
    throw new AppError("مسیر داده‌شده یک پوشه است، نه فایل.", { status: 400, code: "github_is_directory" });
  }
  let content = "";
  if (data.content && data.encoding === "base64") {
    content = new TextDecoder("utf-8", { fatal: false }).decode(base64ToBytes(data.content));
  } else if (data.download_url) {
    const raw = await fetch(data.download_url, {
      headers: { "User-Agent": GH_HEADERS["User-Agent"] },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (!raw.ok) throw githubFailure(raw.status);
    content = await raw.text();
  }
  return { content, sha: data.sha, htmlUrl: data.html_url ?? null };
}

export interface CommitInfo {
  date: string | null;
  sha: string;
  message: string;
  url: string;
}

export async function fetchLatestCommit(
  config: RepoConfig,
  path: string,
  token: string,
): Promise<CommitInfo | null> {
  const url = `${repoApiUrl(config)}/commits?path=${encodeURIComponent(path)}&sha=${encodeURIComponent(
    config.branch,
  )}&per_page=1`;
  const res = await ghFetch(url, token);
  if (res.status === 404) return null;
  if (!res.ok) {
    if (res.status === 403 || res.status === 429) return null;
    throw githubFailure(res.status, await safeText(res));
  }
  const data = (await res.json()) as Array<{
    sha: string;
    html_url?: string;
    commit?: { message?: string; committer?: { date?: string }; author?: { date?: string } };
  }>;
  const first = data?.[0];
  if (!first) return null;
  return {
    date: first.commit?.committer?.date ?? first.commit?.author?.date ?? null,
    sha: first.sha,
    message: (first.commit?.message ?? "").split("\n")[0].slice(0, 200),
    url: first.html_url ?? "",
  };
}

export interface WriteResult {
  commitSha: string;
  commitUrl: string;
  fileSha: string | null;
  fileUrl: string | null;
}

export async function commitFile(
  config: RepoConfig,
  data: { path: string; content: string; message: string; sha?: string | null; token: string },
): Promise<WriteResult> {
  const url = `${repoApiUrl(config)}/contents/${encodePath(data.path)}`;
  const body: Record<string, unknown> = {
    message: data.message,
    content: textToBase64(data.content),
    branch: config.branch,
  };
  if (data.sha) body.sha = data.sha;

  const res = await ghFetch(url, data.token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await safeText(res);
    throw githubFailure(res.status, text);
  }
  const json = (await res.json()) as {
    content?: { sha?: string; html_url?: string };
    commit?: { sha?: string; html_url?: string };
  };
  return {
    commitSha: json.commit?.sha ?? "",
    commitUrl: json.commit?.html_url ?? "",
    fileSha: json.content?.sha ?? null,
    fileUrl: json.content?.html_url ?? null,
  };
}

export async function fetchRateLimit(token: string): Promise<{ remaining: number; limit: number } | null> {
  try {
    const res = await ghFetch("https://api.github.com/rate_limit", token);
    if (!res.ok) return null;
    const data = (await res.json()) as { rate?: { remaining?: number; limit?: number } };
    return { remaining: data.rate?.remaining ?? 0, limit: data.rate?.limit ?? 0 };
  } catch {
    return null;
  }
}

function encodePath(path: string): string {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
