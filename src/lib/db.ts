import { getCloudflareContext } from "@opennextjs/cloudflare";
import { AppError } from "./errors";

/** شکل حداقلی D1 تا بدون وابستگی به تایپ‌های Workers کامپایل شود. */
export interface D1Result<T = unknown> {
  success: boolean;
  results?: T[];
  meta?: { changes?: number; duration?: number; rows_read?: number; rows_written?: number };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run<T = unknown>(): Promise<D1Result<T>>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<{ count: number; duration?: number }>;
}

export interface AppEnv {
  DB?: D1Database;
  GITHUB_TOKEN?: string;
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
  GOOGLE_SERVICE_ACCOUNT_JSON_B64?: string;
  GOOGLE_DRIVE_LOGS_FOLDER_ID?: string;
  GOOGLE_DRIVE_ERRORS_FOLDER_ID?: string;
  GOOGLE_DRIVE_ROOT_FOLDER_ID?: string;
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

let cachedEnv: AppEnv | null = null;

export async function getEnv(): Promise<AppEnv> {
  if (cachedEnv) return cachedEnv;
  try {
    const ctx = await getCloudflareContext({ async: true });
    const env = (ctx?.env ?? {}) as AppEnv;
    // فقط محیط واقعی را کش می‌کنیم؛ یک نتیجه‌ی خالی/خطا نباید برای همیشه بماند
    // (مثلاً اولین فراخوانی پیش از آماده شدن bindingها).
    if (Object.keys(env).length > 0) cachedEnv = env;
    return env;
  } catch {
    return {};
  }
}

/** ابتدا binding کلادفلر، بعد process.env (برای اجرای محلی بدون wrangler). */
export async function envVar(name: keyof AppEnv | string): Promise<string | undefined> {
  const env = await getEnv();
  const fromBinding = env[name];
  if (typeof fromBinding === "string" && fromBinding.trim()) return fromBinding.trim();
  const fromProcess = typeof process !== "undefined" ? process.env?.[name] : undefined;
  if (fromProcess && fromProcess.trim()) return fromProcess.trim();
  return undefined;
}

export async function hasEnv(name: string): Promise<boolean> {
  return Boolean(await envVar(name));
}

/** D1؛ در صورت نبودن binding، خطای فارسی قابل‌فهم با راهنما. */
export async function getDb(): Promise<D1Database> {
  const env = await getEnv();
  if (!env.DB) {
    throw new AppError("پایگاه داده D1 به Worker وصل نیست.", {
      status: 503,
      code: "db_binding_missing",
      hint:
        "در wrangler.jsonc بخش d1_databases با binding=DB وجود دارد. با «npm run deploy» اولین deploy دیتابیس را خودکار می‌سازد. برای اجرای محلی، npm run dev (با initOpenNextCloudflareForDev) D1 محلی می‌سازد.",
    });
  }
  return env.DB;
}

let schemaPromise: Promise<void> | null = null;

/** ساخت خودکار جدول‌ها؛ در اولین درخواست هر isolate یک بار اجرا می‌شود. */
export async function ensureSchema(): Promise<void> {
  if (schemaPromise) {
    await schemaPromise;
    return;
  }
  schemaPromise = (async () => {
    const db = await getDb();
    const statements = SCHEMA_SQL.map((sql) => db.prepare(sql));
    try {
      await db.batch(statements);
    } catch (err) {
      schemaPromise = null;
      throw new AppError("ساخت خودکار جدول‌های D1 ممکن نشد.", {
        status: 503,
        code: "db_schema_failed",
        hint: "سطح دسترسی دیتابیس یا صحت binding را بررسی کنید.",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  })();
  await schemaPromise;
}

export async function dbAll<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const db = await getDb();
  await ensureSchema();
  const stmt = params.length ? db.prepare(sql).bind(...params) : db.prepare(sql);
  const res = await stmt.all<T>();
  return res.results ?? [];
}

export async function dbFirst<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
  const db = await getDb();
  await ensureSchema();
  const stmt = params.length ? db.prepare(sql).bind(...params) : db.prepare(sql);
  return (await stmt.first<T>()) ?? null;
}

export async function dbRun(sql: string, params: unknown[] = []): Promise<D1Result> {
  const db = await getDb();
  await ensureSchema();
  const stmt = params.length ? db.prepare(sql).bind(...params) : db.prepare(sql);
  return stmt.run();
}

export async function dbBatch(queries: Array<{ sql: string; params?: unknown[] }>): Promise<void> {
  if (!queries.length) return;
  const db = await getDb();
  await ensureSchema();
  const statements = queries.map((q) => (q.params?.length ? db.prepare(q.sql).bind(...q.params) : db.prepare(q.sql)));
  for (let i = 0; i < statements.length; i += 40) {
    await db.batch(statements.slice(i, i + 40));
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
  const row = await dbFirst<Record<string, number>>(`
    SELECT
      (SELECT COUNT(*) FROM jobs) AS jobs,
      (SELECT COUNT(*) FROM runs) AS runs,
      (SELECT COUNT(*) FROM error_logs) AS errors,
      (SELECT COUNT(*) FROM prompts) AS prompts,
      (SELECT COUNT(*) FROM events) AS events
  `);
  return {
    jobs: Number(row?.jobs ?? 0),
    runs: Number(row?.runs ?? 0),
    errors: Number(row?.errors ?? 0),
    prompts: Number(row?.prompts ?? 0),
    events: Number(row?.events ?? 0),
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
