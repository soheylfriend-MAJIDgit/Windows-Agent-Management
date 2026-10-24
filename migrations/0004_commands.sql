-- صف فرمان و رصد مرحله‌ای Windows Agent
-- اجرای دستی اختیاری؛ ensureSchema همین ساختار را خودکار ایجاد می‌کند.

CREATE TABLE IF NOT EXISTS commands (
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
);

CREATE INDEX IF NOT EXISTS idx_commands_agent_status ON commands(agent_key_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_commands_created ON commands(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commands_prompt ON commands(prompt_id);

CREATE TABLE IF NOT EXISTS command_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  command_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  stage TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  UNIQUE (command_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_command_events_command ON command_events(command_id, seq);

CREATE TABLE IF NOT EXISTS command_artifacts (
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
);

CREATE INDEX IF NOT EXISTS idx_command_artifacts_command ON command_artifacts(command_id, created_at);
