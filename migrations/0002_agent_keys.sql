-- مدیریت کلیدهای اختصاصی Windows Agent
-- اجرای دستی اختیاری؛ ensureSchema همین ساختار را خودکار ایجاد می‌کند.

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
