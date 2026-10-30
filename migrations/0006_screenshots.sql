-- فایل تصویر در R2؛ متادیتا، مالکیت، مصرف و لینک اشتراک در D1.
CREATE TABLE IF NOT EXISTS screenshots (
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
);
CREATE INDEX IF NOT EXISTS idx_screenshots_created ON screenshots(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_screenshots_command ON screenshots(command_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_screenshots_agent ON screenshots(agent_key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_screenshots_share ON screenshots(share_token);
