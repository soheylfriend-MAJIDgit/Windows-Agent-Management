-- ساختار پایگاه داده‌ی «ایجنت مدیریت» (Cloudflare D1 / SQLite)
-- اجرای خودکار: تابع ensureSchema همین دستورها را در اولین درخواست اجرا می‌کند.
-- این فایل برای مستندسازی و اجرای دستی اختیاری است:
--   wrangler d1 execute windows-agent-management-db --remote --file=migrations/0001_init.sql

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

CREATE TABLE IF NOT EXISTS jobs (
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
  );

CREATE INDEX IF NOT EXISTS idx_jobs_present ON jobs(present);

CREATE TABLE IF NOT EXISTS runs (
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
  );

CREATE INDEX IF NOT EXISTS idx_runs_job ON runs(job_name, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at DESC);

CREATE TABLE IF NOT EXISTS error_logs (
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
  );

CREATE INDEX IF NOT EXISTS idx_errors_occurred ON error_logs(occurred_at DESC);

CREATE TABLE IF NOT EXISTS prompts (
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
  );

CREATE INDEX IF NOT EXISTS idx_prompts_created ON prompts(created_at DESC);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT,
    job_name TEXT,
    url TEXT,
    created_at TEXT NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at DESC);

CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT NOT NULL
  );

CREATE TABLE IF NOT EXISTS drive_files (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    modified_at TEXT,
    size INTEGER,
    synced_at TEXT NOT NULL
  );

CREATE TABLE IF NOT EXISTS agent_keys (
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
  );

CREATE INDEX IF NOT EXISTS idx_agent_keys_status ON agent_keys(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_keys_hash ON agent_keys(secret_hash);
