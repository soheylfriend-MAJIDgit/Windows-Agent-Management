import { PrismaClient } from "@prisma/client";
import { AppError } from "./errors";

export interface AppEnv {
  DATABASE_URL?: string;
  DIRECT_URL?: string;
  BLOB_READ_WRITE_TOKEN?: string;
  GITHUB_TOKEN?: string;
  MANAGER_PASSCODE?: string;
  AUTH_SECRET?: string;
  COLLAB_OWNER?: string;
  COLLAB_REPO?: string;
  COLLAB_BRANCH?: string;
  MOTHER_OWNER?: string;
  MOTHER_REPO?: string;
  MOTHER_BRANCH?: string;
  [key: string]: unknown;
}

export interface DbResult {
  success: boolean;
  meta?: { changes?: number; duration?: number; rows_read?: number; rows_written?: number };
}

type PrismaGlobal = typeof globalThis & { managementPrisma?: PrismaClient };
const prismaGlobal = globalThis as PrismaGlobal;
let schemaPromise: Promise<void> | null = null;

/** متغیرهای Vercel و اجرای محلی فقط از محیط سرور خوانده می‌شوند. */
export async function envVar(name: keyof AppEnv | string): Promise<string | undefined> {
  const value = typeof process !== "undefined" ? process.env?.[name] : undefined;
  return value?.trim() || undefined;
}

export async function hasEnv(name: string): Promise<boolean> {
  return Boolean(await envVar(name));
}

/** یک PrismaClient مشترک؛ در توسعه از اتصال‌های اضافی Hot Reload جلوگیری می‌کند. */
export async function getDb(): Promise<PrismaClient> {
  if (!(await envVar("DATABASE_URL"))) {
    throw new AppError("نشانی اتصال PostgreSQL تنظیم نشده است.", {
      status: 503,
      code: "database_url_missing",
      hint: "در Vercel یک Prisma Postgres یا Neon database متصل کنید تا DATABASE_URL ساخته شود؛ برای اجرای محلی آن را در .env.local قرار دهید.",
    });
  }
  if (!prismaGlobal.managementPrisma) {
    prismaGlobal.managementPrisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
  }
  return prismaGlobal.managementPrisma;
}

/** تبدیل SQL سازگار با PostgreSQL به PostgreSQL بدون تغییر قرارداد helperهای موجود. */
function postgresQuery(sql: string): string {
  let index = 0;
  let result = sql.replace(/\?/g, () => `$${++index}`);
  if (/^\s*INSERT\s+OR\s+IGNORE\s+/i.test(result)) {
    result = result.replace(/INSERT\s+OR\s+IGNORE/i, "INSERT").replace(/;?\s*$/, " ON CONFLICT DO NOTHING");
  }
  return result;
}

function postgresDdl(sql: string): string {
  return sql
    .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, "SERIAL PRIMARY KEY")
    .replace(/\bREAL\b/gi, "DOUBLE PRECISION")
    .replace(/\bBLOB\b/gi, "BYTEA");
}

/** bootstrap idempotent؛ migration اصلی نیز همین ساختار را پیش از deploy ایجاد می‌کند. */
export async function ensureSchema(): Promise<void> {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    const db = await getDb();
    try {
      for (const statement of SCHEMA_SQL) await db.$executeRawUnsafe(postgresDdl(statement));
    } catch (error) {
      schemaPromise = null;
      throw new AppError("آماده‌سازی جدول‌های PostgreSQL ممکن نشد.", {
        status: 503,
        code: "db_schema_failed",
        hint: "DATABASE_URL، دسترسی ساخت جدول و وضعیت Prisma Postgres/Neon را بررسی کنید.",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  })();
  return schemaPromise;
}

export async function dbAll<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const db = await getDb();
  await ensureSchema();
  return db.$queryRawUnsafe<T[]>(postgresQuery(sql), ...params);
}

export async function dbFirst<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await dbAll<T>(sql, params);
  return rows[0] ?? null;
}

export async function dbRun(sql: string, params: unknown[] = []): Promise<DbResult> {
  const db = await getDb();
  await ensureSchema();
  const started = Date.now();
  const changes = await db.$executeRawUnsafe(postgresQuery(sql), ...params);
  return { success: true, meta: { changes, duration: Date.now() - started } };
}

export async function dbBatch(queries: Array<{ sql: string; params?: unknown[] }>): Promise<void> {
  if (!queries.length) return;
  const db = await getDb();
  await ensureSchema();
  for (let i = 0; i < queries.length; i += 40) {
    const chunk = queries.slice(i, i + 40);
    await db.$transaction(chunk.map((query) => db.$executeRawUnsafe(postgresQuery(query.sql), ...(query.params ?? []))));
  }
}

export async function dbHealthy(): Promise<boolean> {
  try {
    await dbFirst<{ ok: number }>("SELECT 1 AS ok");
    return true;
  } catch {
    return false;
  }
}

export async function dbCounts(): Promise<{ jobs: number; runs: number; errors: number; prompts: number; events: number }> {
  const row = await dbFirst<Record<string, number | bigint>>(`
    SELECT
      (SELECT COUNT(*) FROM jobs) AS jobs,
      (SELECT COUNT(*) FROM runs) AS runs,
      (SELECT COUNT(*) FROM error_logs) AS errors,
      (SELECT COUNT(*) FROM prompts) AS prompts,
      (SELECT COUNT(*) FROM events) AS events
  `);
  return {
    jobs: Number(row?.jobs ?? 0), runs: Number(row?.runs ?? 0), errors: Number(row?.errors ?? 0),
    prompts: Number(row?.prompts ?? 0), events: Number(row?.events ?? 0),
  };
}

const SCHEMA_SQL: string[] = [
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS jobs (
    name TEXT PRIMARY KEY,
    size INTEGER NOT NULL DEFAULT 0,
    lines INTEGER NOT NULL DEFAULT 0,
    docstring TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    content_sha TEXT NOT NULL DEFAULT '',
    commit_date TEXT,
    commit_sha TEXT,
    commit_message TEXT,
    commit_checked_at TEXT,
    archive_updated_at TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    changed_at TEXT,
    present INTEGER NOT NULL DEFAULT 1,
    issues TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_present ON jobs(present)`,
  `CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_name TEXT NOT NULL,
    status TEXT NOT NULL,
    exit_code TEXT,
    started_at TEXT NOT NULL,
    started_jalali TEXT,
    duration_s REAL,
    output TEXT NOT NULL DEFAULT '',
    errors TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'drive',
    source_file TEXT,
    source_id TEXT,
    content_sha TEXT,
    raw TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (job_name, started_at)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_runs_job ON runs(job_name, started_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at DESC)`,
  `CREATE TABLE IF NOT EXISTS error_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_name TEXT NOT NULL,
    occurred_at TEXT,
    occurred_jalali TEXT,
    subject TEXT NOT NULL,
    app_version TEXT,
    detail TEXT NOT NULL DEFAULT '',
    raw TEXT,
    fingerprint TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_errors_occurred ON error_logs(occurred_at DESC)`,
  `CREATE TABLE IF NOT EXISTS prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_name TEXT NOT NULL,
    mode TEXT NOT NULL,
    prompt TEXT NOT NULL,
    code TEXT,
    commit_sha TEXT,
    commit_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    issues TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_prompts_created ON prompts(created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT,
    job_name TEXT,
    url TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS drive_files (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    modified_at TEXT,
    size INTEGER,
    synced_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS agent_keys (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    secret_hash TEXT NOT NULL UNIQUE,
    scopes TEXT NOT NULL DEFAULT '[]',
    note TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    created_at TEXT NOT NULL,
    last_used_at TEXT,
    expires_at TEXT,
    revoked_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_agent_keys_status ON agent_keys(status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_keys_hash ON agent_keys(secret_hash)`,
  `CREATE TABLE IF NOT EXISTS managed_agents (
    id TEXT PRIMARY KEY,
    agent_key_id TEXT NOT NULL,
    name TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'windows',
    version TEXT,
    commit_sha TEXT,
    status TEXT NOT NULL DEFAULT 'online',
    capabilities TEXT NOT NULL DEFAULT '{}',
    state TEXT NOT NULL DEFAULT '{}',
    message TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_managed_agents_seen ON managed_agents(last_seen_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_managed_agents_key ON managed_agents(agent_key_id)`,
  `CREATE TABLE IF NOT EXISTS agent_control_requests (
    id TEXT PRIMARY KEY,
    agent_key_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('stop_all_executions')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'succeeded', 'failed', 'expired', 'cancelled')),
    reason TEXT NOT NULL,
    requested_by TEXT NOT NULL,
    result TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    delivered_at TEXT,
    completed_at TEXT,
    expires_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_agent_controls_agent_status ON agent_control_requests(agent_id, status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_controls_created ON agent_control_requests(created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS agent_connection_tests (
    id TEXT PRIMARY KEY,
    agent_key_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'succeeded', 'failed', 'cancelled')),
    request_message TEXT NOT NULL,
    expected_reply TEXT NOT NULL,
    reply_message TEXT,
    created_at TEXT NOT NULL,
    delivered_at TEXT,
    responded_at TEXT,
    expires_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_agent_tests_key ON agent_connection_tests(agent_key_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_tests_status ON agent_connection_tests(status, expires_at)`,
  `CREATE TABLE IF NOT EXISTS commands (
    id TEXT PRIMARY KEY,
    agent_key_id TEXT NOT NULL,
    agent_id TEXT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'waiting_confirmation', 'running', 'succeeded', 'failed', 'cancelled', 'timed_out', 'rejected')),
    source TEXT NOT NULL DEFAULT 'manager',
    prompt_id INTEGER,
    job_name TEXT,
    requires_confirmation INTEGER NOT NULL DEFAULT 1,
    auto_stop_on_anomaly INTEGER NOT NULL DEFAULT 1,
    timeout_seconds INTEGER NOT NULL DEFAULT 600,
    no_progress_seconds INTEGER NOT NULL DEFAULT 120,
    created_at TEXT NOT NULL,
    claimed_at TEXT,
    started_at TEXT,
    completed_at TEXT,
    last_event_at TEXT,
    cancel_requested_at TEXT,
    cancel_reason TEXT,
    error TEXT,
    result TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_commands_agent_status ON commands(agent_key_id, status, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_commands_created ON commands(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_commands_prompt ON commands(prompt_id)`,
  `CREATE TABLE IF NOT EXISTS command_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    command_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    stage TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT 'info',
    message TEXT NOT NULL,
    data TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    UNIQUE (command_id, seq)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_command_events_command ON command_events(command_id, seq)`,
  `CREATE TABLE IF NOT EXISTS command_artifacts (
    id TEXT PRIMARY KEY,
    command_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    stage TEXT,
    name TEXT NOT NULL,
    local_path TEXT,
    drive_file_id TEXT,
    drive_url TEXT,
    mime_type TEXT,
    size INTEGER,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_command_artifacts_command ON command_artifacts(command_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS screenshots (
    id TEXT PRIMARY KEY,
    object_key TEXT NOT NULL UNIQUE,
    command_id TEXT,
    execution_id TEXT,
    agent_key_id TEXT NOT NULL,
    agent_id TEXT,
    stage TEXT,
    name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    width INTEGER,
    height INTEGER,
    occurred_at TEXT,
    visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
    share_token TEXT UNIQUE,
    created_at TEXT NOT NULL,
    deleted_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_screenshots_created ON screenshots(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_screenshots_command ON screenshots(command_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_screenshots_agent ON screenshots(agent_key_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_screenshots_share ON screenshots(share_token)`,
  `CREATE TABLE IF NOT EXISTS automations (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    target TEXT NOT NULL DEFAULT 'windows' CHECK (target IN ('windows', 'management', 'both')),
    active_version_id TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_automations_updated ON automations(updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS automation_versions (
    id TEXT PRIMARY KEY,
    automation_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    source_code TEXT NOT NULL,
    source_sha256 TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'review', 'approved', 'active', 'rejected', 'retired')),
    change_summary TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    approved_by TEXT,
    approved_at TEXT,
    UNIQUE (automation_id, version)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_automation_versions_automation ON automation_versions(automation_id, version DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_automation_versions_sha ON automation_versions(source_sha256)`,
  `CREATE TABLE IF NOT EXISTS automation_runs (
    id TEXT PRIMARY KEY,
    automation_id TEXT NOT NULL,
    version_id TEXT NOT NULL,
    command_id TEXT NOT NULL UNIQUE,
    requested_by TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_automation_runs_automation ON automation_runs(automation_id, created_at DESC)`,
];
