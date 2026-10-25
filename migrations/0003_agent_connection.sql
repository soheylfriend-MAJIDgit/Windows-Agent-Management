-- پل ارتباطی ایجنت مدیریت و Windows Agent
-- اجرای دستی اختیاری؛ ensureSchema همین ساختار را خودکار ایجاد می‌کند.

CREATE TABLE IF NOT EXISTS managed_agents (
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
);

CREATE INDEX IF NOT EXISTS idx_managed_agents_seen ON managed_agents(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_managed_agents_key ON managed_agents(agent_key_id);

CREATE TABLE IF NOT EXISTS agent_connection_tests (
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
);

CREATE INDEX IF NOT EXISTS idx_agent_tests_key ON agent_connection_tests(agent_key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tests_status ON agent_connection_tests(status, expires_at);
