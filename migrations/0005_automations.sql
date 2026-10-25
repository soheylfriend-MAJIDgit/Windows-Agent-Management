-- کاتالوگ نسخه‌بندی‌شده کدهای اتوماسیون؛ D1 منبع اصلی این کدها است.
CREATE TABLE IF NOT EXISTS automations (
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
);
CREATE INDEX IF NOT EXISTS idx_automations_updated ON automations(updated_at DESC);

CREATE TABLE IF NOT EXISTS automation_versions (
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
);
CREATE INDEX IF NOT EXISTS idx_automation_versions_automation ON automation_versions(automation_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_automation_versions_sha ON automation_versions(source_sha256);

CREATE TABLE IF NOT EXISTS automation_runs (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  command_id TEXT NOT NULL UNIQUE,
  requested_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_automation_runs_automation ON automation_runs(automation_id, created_at DESC);
