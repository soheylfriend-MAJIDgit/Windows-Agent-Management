import type { RepoConfig } from "./types";
import { envVar } from "./db";
import { dbRun, dbAll } from "./db";

export const APP_VERSION = "1.0.0";
export const APP_NAME = "ایجنت مدیریت";
export const APP_SUBTITLE = "پنل ویندوز";

/** حداکثر زمان اجرا روی پنل ویندوز (ثانیه) */
export const MAX_JOB_RUNTIME_SECONDS = 600;
export const MAX_JOB_FILE_BYTES = 512 * 1024;
export const MAX_STORED_OUTPUT = 120_000;
export const ARCHIVE_CACHE_MS = 45_000;
export const REPO_SETTINGS_CACHE_MS = 8_000;

export type RepoKind = "collab" | "mother";

const FALLBACK: Record<RepoKind, RepoConfig> = {
  collab: {
    owner: "soheylfriend-MAJIDgit",
    repo: "Windows-Agent-hamkar",
    branch: "arena/beecb74c-windows-agent-hamkar",
  },
  mother: {
    owner: "soheylfriend-MAJIDgit",
    repo: "Windows-Agent",
    branch: "arena/025c788f-windows-agent",
  },
};

export async function getRepoDefaults(): Promise<Record<RepoKind, RepoConfig>> {
  const read = async (kind: RepoKind, suffix: string) =>
    (await envVar(`${kind.toUpperCase()}_${suffix}`)) ?? FALLBACK[kind][suffix.toLowerCase() as keyof RepoConfig];
  return {
    collab: {
      owner: await read("collab", "OWNER"),
      repo: await read("collab", "REPO"),
      branch: await read("collab", "BRANCH"),
    },
    mother: {
      owner: await read("mother", "OWNER"),
      repo: await read("mother", "REPO"),
      branch: await read("mother", "BRANCH"),
    },
  };
}

const cache = new Map<RepoKind, { value: RepoConfig; at: number }>();

export function clearRepoConfigCache(): void {
  cache.clear();
}

export async function getRepoConfig(kind: RepoKind = "collab", useCache = true): Promise<RepoConfig> {
  const hit = cache.get(kind);
  if (useCache && hit && Date.now() - hit.at < REPO_SETTINGS_CACHE_MS) return hit.value;

  const defaults = (await getRepoDefaults())[kind];
  let config = defaults;
  try {
    const rows = await dbAll<{ key: string; value: string }>(
      "SELECT key, value FROM settings WHERE key IN (?, ?, ?)",
      [`${kind}.owner`, `${kind}.repo`, `${kind}.branch`],
    );
    const map = new Map(rows.map((r) => [r.key, r.value]));
    config = {
      owner: map.get(`${kind}.owner`) || defaults.owner,
      repo: map.get(`${kind}.repo`) || defaults.repo,
      branch: map.get(`${kind}.branch`) || defaults.branch,
    };
  } catch {
    // D1 آماده نیست؛ از پیش‌فرض محیطی استفاده می‌کنیم تا صفحه‌ها باز شوند.
    config = defaults;
  }
  cache.set(kind, { value: config, at: Date.now() });
  return config;
}

export async function saveRepoConfig(kind: RepoKind, config: RepoConfig): Promise<void> {
  const now = new Date().toISOString();
  for (const key of ["owner", "repo", "branch"] as const) {
    await dbRun(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [`${kind}.${key}`, config[key], now],
    );
  }
  clearRepoConfigCache();
}

export function validateRepoConfig(config: RepoConfig): string | null {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(config.owner)) {
    return "نام مالک باید فقط حروف لاتین، عدد و خط تیره باشد.";
  }
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(config.repo)) {
    return "نام مخزن باید فقط حروف لاتین، عدد، نقطه، خط تیره و زیرخط باشد.";
  }
  if (!/^[A-Za-z0-9._/-]{1,200}$/.test(config.branch) || config.branch.includes("..")) {
    return "نام شاخه معتبر نیست. اسلش مجاز است (مثل arena/xxxx).";
  }
  return null;
}

export function zipUrl(config: RepoConfig): string {
  return `https://codeload.github.com/${config.owner}/${config.repo}/zip/refs/heads/${config.branch}`;
}

export function repoApiUrl(config: RepoConfig): string {
  return `https://api.github.com/repos/${config.owner}/${config.repo}`;
}

export function repoHtmlUrl(config: RepoConfig): string {
  return `https://github.com/${config.owner}/${config.repo}`;
}

export function fileHtmlUrl(config: RepoConfig, path: string): string {
  return `${repoHtmlUrl(config)}/blob/${config.branch}/${path}`;
}

export function commitHtmlUrl(config: RepoConfig, sha: string): string {
  return `${repoHtmlUrl(config)}/commit/${sha}`;
}

export function isJobFileName(name: string): boolean {
  return /^job_[A-Za-z0-9_]+\.py$/.test(name) && name.length <= 80;
}

export function isPythonFileName(name: string): boolean {
  return /^[A-Za-z0-9_][A-Za-z0-9_.-]*\.py$/.test(name) && !name.startsWith(".") && name.length <= 100;
}

export function slugToJobName(slug: string): string {
  const cleaned = slug
    .trim()
    .replace(/\.py$/i, "")
    .replace(/^job_/i, "")
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
    .slice(0, 70);
  return `job_${cleaned || "task"}.py`;
}
