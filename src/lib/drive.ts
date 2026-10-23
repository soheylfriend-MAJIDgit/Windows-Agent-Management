import { envVar } from "./db";
import { base64ToText, bytesToBase64Url, pemToBytes } from "./crypto";
import { AppError } from "./errors";
import { detectFileKind, parseErrorFile, parseResultFile } from "./parse";
import {
  getDriveCache,
  getSyncState,
  saveDriveCache,
  saveErrorLogs,
  saveRun,
  setSyncState,
} from "./store";
import type { SyncResult } from "./types";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

export interface DriveStatus {
  configured: boolean;
  hasServiceAccount: boolean;
  hasFolder: boolean;
  accountsEmail: string | null;
  logsFolderId: string | null;
  errorsFolderId: string | null;
}

interface DriveFileMeta {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
}

interface DriveContext {
  token: string;
  logsFolderId: string;
  errorsFolderId: string | null;
  accountEmail: string;
}

let tokenCache: { token: string; exp: number } | null = null;
let folderCache: { logs: string; errors: string | null; at: number } | null = null;

export async function getServiceAccount(): Promise<ServiceAccount | null> {
  let raw = await envVar("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!raw) {
    const b64 = await envVar("GOOGLE_SERVICE_ACCOUNT_JSON_B64");
    if (b64) {
      try {
        raw = base64ToText(b64);
      } catch {
        return null;
      }
    }
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ServiceAccount;
    if (!parsed.client_email || !parsed.private_key) return null;
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    return parsed;
  } catch {
    return null;
  }
}

export async function driveStatus(): Promise<DriveStatus> {
  const sa = await getServiceAccount();
  const logsFolderId = (await envVar("GOOGLE_DRIVE_LOGS_FOLDER_ID")) ?? null;
  const rootFolderId = (await envVar("GOOGLE_DRIVE_ROOT_FOLDER_ID")) ?? null;
  const errorsFolderId = (await envVar("GOOGLE_DRIVE_ERRORS_FOLDER_ID")) ?? null;
  return {
    configured: Boolean(sa && (logsFolderId || rootFolderId)),
    hasServiceAccount: Boolean(sa),
    hasFolder: Boolean(logsFolderId || rootFolderId),
    accountsEmail: sa?.client_email ?? null,
    logsFolderId,
    errorsFolderId,
  };
}

function notConfiguredError(status: DriveStatus): AppError {
  if (!status.hasServiceAccount && !status.hasFolder) {
    return new AppError("همگام‌سازی گوگل درایو پیکربندی نشده است.", {
      status: 503,
      code: "drive_not_configured",
      hint:
        "secret های GOOGLE_SERVICE_ACCOUNT_JSON و GOOGLE_DRIVE_LOGS_FOLDER_ID را تنظیم کنید، یا فایل نتیجه را دستی در صفحه‌ی گزارش‌ها وارد کنید.",
    });
  }
  if (!status.hasServiceAccount) {
    return new AppError("حساب سرویس گوگل تنظیم نشده است.", {
      status: 503,
      code: "drive_no_account",
      hint: "محتوای JSON حساب سرویس را در secret با نام GOOGLE_SERVICE_ACCOUNT_JSON بگذارید.",
    });
  }
  return new AppError("شناسه‌ی پوشه‌ی logs درایو تنظیم نشده است.", {
    status: 503,
    code: "drive_no_folder",
    hint: "GOOGLE_DRIVE_LOGS_FOLDER_ID یا GOOGLE_DRIVE_ROOT_FOLDER_ID را تنظیم کنید.",
  });
}

async function createJwt(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: account.client_email,
    scope: DRIVE_SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };
  const input = `${bytesToBase64Url(new TextEncoder().encode(JSON.stringify(header)))}.${bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify(claims)),
  )}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(account.private_key) as unknown as BufferSource,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(input) as unknown as BufferSource,
  );
  return `${input}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

async function getAccessToken(account: ServiceAccount): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  const assertion = await createJwt(account);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    throw new AppError("ارتباط با سرویس احراز هویت گوگل برقرار نشد.", {
      status: 502,
      code: "drive_unreachable",
      hint: "دسترسی سرور به oauth2.googleapis.com را بررسی کنید.",
    });
  }
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new AppError("گرفتن توکن گوگل درایو ممکن نشد.", {
      status: 502,
      code: "drive_auth_failed",
      hint:
        "کلید حساب سرویس معتبر نیست یا API درایو در پروژه فعال نشده است. «Google Drive API» را در Google Cloud فعال کنید.",
      details: json.error_description ?? json.error,
    });
  }
  tokenCache = { token: json.access_token, exp: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return json.access_token;
}

async function driveFetch(token: string, path: string, params: Record<string, string>): Promise<Response> {
  const url = new URL(`${DRIVE_API}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
}

async function listFolder(token: string, folderId: string): Promise<DriveFileMeta[]> {
  const files: DriveFileMeta[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 5; page += 1) {
    const params: Record<string, string> = {
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, modifiedTime, size)",
      pageSize: "1000",
      orderBy: "modifiedTime desc",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    };
    if (pageToken) params.pageToken = pageToken;
    const res = await driveFetch(token, "/files", params);
    if (res.status === 404) {
      throw new AppError("پوشه‌ی گوگل درایو پیدا نشد یا با حساب سرویس به اشتراک گذاشته نشده است.", {
        status: 404,
        code: "drive_folder_not_found",
        hint: "پوشه‌ی logs را با ایمیل حساب سرویس (viewer) به اشتراک بگذارید و شناسه را بررسی کنید.",
      });
    }
    if (res.status === 403) {
      throw new AppError("گوگل درایو دسترسی را رد کرد.", {
        status: 502,
        code: "drive_forbidden",
        hint: "پوشه را با ایمیل حساب سرویس به اشتراک بگذارید؛ دسترسی «بیننده» کافی است.",
      });
    }
    if (!res.ok) {
      throw new AppError(`گوگل درایو پاسخ ${res.status} داد.`, {
        status: 502,
        code: "drive_error",
        hint: "وضعیت API و اشتراک‌گذاری پوشه را بررسی کنید.",
      });
    }
    const data = (await res.json()) as { files?: DriveFileMeta[]; nextPageToken?: string };
    files.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return files;
}

async function findSubfolder(token: string, parentId: string, name: string): Promise<string | null> {
  const res = await driveFetch(token, "/files", {
    q: `'${parentId}' in parents and name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, name)",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { files?: Array<{ id: string }> };
  return data.files?.[0]?.id ?? null;
}

async function resolveFolders(token: string): Promise<{ logs: string; errors: string | null }> {
  if (folderCache && Date.now() - folderCache.at < 10 * 60_000) {
    return { logs: folderCache.logs, errors: folderCache.errors };
  }
  const status = await driveStatus();
  let logs = status.logsFolderId;
  if (!logs) {
    const root = await envVar("GOOGLE_DRIVE_ROOT_FOLDER_ID");
    if (!root) throw notConfiguredError(status);
    logs = await findSubfolder(token, root, "logs");
    if (!logs) {
      throw new AppError("پوشه‌ی logs داخل پوشه‌ی Windows-Agent-DB پیدا نشد.", {
        status: 404,
        code: "drive_logs_folder_missing",
        hint: "ساختار پوشه‌ها باید Windows-Agent-DB/logs باشد.",
      });
    }
  }
  const errors = status.errorsFolderId ?? (await findSubfolder(token, logs, "errors"));
  folderCache = { logs, errors, at: Date.now() };
  return { logs, errors };
}

async function downloadText(token: string, fileId: string): Promise<string> {
  const res = await driveFetch(token, `/files/${encodeURIComponent(fileId)}`, {
    alt: "media",
    supportsAllDrives: "true",
  });
  if (!res.ok) {
    throw new AppError(`دریافت فایل از درایو ممکن نشد (${res.status}).`, {
      status: 502,
      code: "drive_download_failed",
    });
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(await res.arrayBuffer());
}

async function buildContext(): Promise<DriveContext> {
  const status = await driveStatus();
  const account = await getServiceAccount();
  if (!account || !status.configured) throw notConfiguredError(status);
  const token = await getAccessToken(account);
  const folders = await resolveFolders(token);
  return { token, logsFolderId: folders.logs, errorsFolderId: folders.errors, accountEmail: account.client_email };
}

export async function syncDrive(options: { force?: boolean; limit?: number } = {}): Promise<SyncResult> {
  const status = await driveStatus();
  const empty: SyncResult = {
    ok: false,
    configured: status.configured,
    downloaded: 0,
    results: 0,
    errors: 0,
    skipped: 0,
    warnings: [],
    syncedAt: new Date().toISOString(),
  };
  if (!status.configured) {
    return { ...empty, message: "گوگل درایو پیکربندی نشده است." };
  }

  const syncedAt = new Date().toISOString();
  try {
    const ctx = await buildContext();
    const logsFiles = await listFolder(ctx.token, ctx.logsFolderId);
    const errorFiles = ctx.errorsFolderId ? await listFolder(ctx.token, ctx.errorsFolderId) : [];

    const candidates: Array<{ meta: DriveFileMeta; kind: "result" | "error" }> = [];
    for (const meta of logsFiles) {
      if (meta.mimeType.includes("folder")) continue;
      if (/_result\.txt$/i.test(meta.name)) {
        candidates.push({ meta, kind: "result" });
      } else if (!ctx.errorsFolderId && /^errors?_.*\.txt$/i.test(meta.name)) {
        // اگر پوشه‌ی errors جدا تنظیم نشده باشد، فایل‌های خطای کنار logs هم خوانده می‌شوند.
        candidates.push({ meta, kind: "error" });
      }
    }
    for (const meta of errorFiles) {
      if (meta.mimeType.includes("folder")) continue;
      if (/^errors?_.*\.txt$/i.test(meta.name)) candidates.push({ meta, kind: "error" });
    }
    candidates.sort((a, b) => (b.meta.modifiedTime ?? "").localeCompare(a.meta.modifiedTime ?? ""));

    const limit = Math.min(Math.max(options.limit ?? 20, 1), 40);
    let downloaded = 0;
    let results = 0;
    let errors = 0;
    let skipped = 0;
    const warnings: string[] = [];

    for (const { meta, kind } of candidates) {
      if (downloaded >= limit) {
        skipped += 1;
        continue;
      }
      const cached = await getDriveCache(meta.id);
      if (!options.force && cached && cached.modifiedAt === (meta.modifiedTime ?? null)) {
        skipped += 1;
        continue;
      }
      try {
        const text = await downloadText(ctx.token, meta.id);
        if (kind === "result") {
          const parsed = parseResultFile(meta.name, text, meta.modifiedTime);
          await saveRun({
            jobName: parsed.jobName,
            status: parsed.status,
            exitCode: parsed.exitCode,
            startedAt: parsed.startedAt,
            startedJalali: parsed.startedJalali,
            durationSeconds: parsed.durationSeconds,
            output: parsed.output,
            errors: parsed.errors,
            source: "drive",
            sourceFile: meta.name,
            sourceId: meta.id,
            raw: parsed.raw,
          });
          results += 1;
        } else {
          const blocks = await parseErrorFile(meta.name, text);
          await saveErrorLogs(blocks);
          errors += blocks.length;
        }
        await saveDriveCache({
          id: meta.id,
          name: meta.name,
          kind,
          modifiedAt: meta.modifiedTime ?? null,
          size: meta.size ? Number(meta.size) : null,
        });
        downloaded += 1;
      } catch (err) {
        warnings.push(`${meta.name}: ${err instanceof Error ? err.message : "خطای ناشناخته"}`);
        if (warnings.length >= 5) break;
      }
    }

    await setSyncState("drive.lastSync", syncedAt);
    await setSyncState("drive.lastError", warnings.length ? warnings.join(" | ").slice(0, 800) : "");
    return {
      ok: true,
      configured: true,
      downloaded,
      results,
      errors,
      skipped,
      warnings,
      syncedAt,
      message:
        downloaded === 0
          ? "فایل تازه‌ای در درایو نبود."
          : `${downloaded} فایل تازه خوانده شد (${results} نتیجه، ${errors} خطا).`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطای ناشناخته";
    await setSyncState("drive.lastError", message.slice(0, 500)).catch(() => undefined);
    if (err instanceof AppError) throw err;
    throw new AppError("همگام‌سازی گوگل درایو ناموفق بود.", {
      status: 502,
      code: "drive_sync_failed",
      details: message,
    });
  }
}

export async function ingestManualFile(data: {
  fileName: string;
  content: string;
  kind?: "result" | "error";
  modifiedAt?: string | null;
}): Promise<{ kind: "result" | "error"; results: number; errors: number; jobName?: string }> {
  const fileName = data.fileName.trim() || (data.kind === "error" ? "errors_manual.txt" : "manual_result.txt");
  const kind = data.kind ?? detectFileKind(fileName, data.content);
  if (!data.content.trim()) {
    throw new AppError("محتوای فایل خالی است.", { status: 400, code: "empty_content" });
  }
  if (data.content.length > 1_000_000) {
    throw new AppError("متن فایل بیش از ۱ مگابایت است.", {
      status: 413,
      code: "content_too_large",
      hint: "فقط متن فایل نتیجه یا خطا را وارد کنید، نه فایل‌های دیگر.",
    });
  }
  if (kind === "error") {
    const blocks = await parseErrorFile(fileName, data.content);
    if (!blocks.length) {
      throw new AppError("هیچ بلوک خطایی در متن پیدا نشد.", {
        status: 422,
        code: "no_error_blocks",
        hint: "فایل باید شامل «موضوع:» و بلوک‌های جدا شده با علامت = باشد.",
      });
    }
    await saveErrorLogs(blocks);
    return { kind, results: 0, errors: blocks.length };
  }
  const parsed = parseResultFile(fileName, data.content, data.modifiedAt ?? null);
  await saveRun({
    jobName: parsed.jobName,
    status: parsed.status,
    exitCode: parsed.exitCode,
    startedAt: parsed.startedAt,
    startedJalali: parsed.startedJalali,
    durationSeconds: parsed.durationSeconds,
    output: parsed.output,
    errors: parsed.errors,
    source: "manual",
    sourceFile: fileName,
    sourceId: `manual:${fileName}`,
    raw: parsed.raw,
  });
  return { kind, results: 1, errors: 0, jobName: parsed.jobName };
}

export async function testDrive(): Promise<{ ok: boolean; message: string; hint?: string }> {
  const status = await driveStatus();
  if (!status.configured) {
    return {
      ok: false,
      message: "حساب سرویس یا شناسه‌ی پوشه تنظیم نشده است.",
      hint: "GOOGLE_SERVICE_ACCOUNT_JSON و GOOGLE_DRIVE_LOGS_FOLDER_ID را تنظیم کنید.",
    };
  }
  try {
    const ctx = await buildContext();
    const files = await listFolder(ctx.token, ctx.logsFolderId);
    return { ok: true, message: `اتصال برقرار است (${files.length} فایل در پوشه logs).` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "اتصال برقرار نشد.",
      hint: err instanceof AppError ? err.hint : undefined,
    };
  }
}

export async function getDriveState(): Promise<{ lastSyncAt: string | null; lastError: string | null }> {
  try {
    const [lastSyncAt, lastError] = await Promise.all([getSyncState("drive.lastSync"), getSyncState("drive.lastError")]);
    return { lastSyncAt, lastError: lastError || null };
  } catch {
    return { lastSyncAt: null, lastError: null };
  }
}
