import { bytesToBase64Url } from "./crypto";
import { dbAll, dbBatch, dbFirst, dbRun } from "./db";
import { AppError } from "./errors";
import type { AuthenticatedAgentKey } from "./agent-keys";

export const CONNECTION_TEST_REQUEST = "سلام ایجنت ویندوز؛ لطفاً پیام تست را به ایجنت مدیریت برگردان.";
export const CONNECTION_TEST_REPLY = "سلام ایجنت مدیریت.";
const TEST_TTL_MS = 5 * 60 * 1000;
const ONLINE_WINDOW_MS = 90 * 1000;

interface ManagedAgentRow {
  id: string;
  agent_key_id: string;
  name: string;
  platform: string;
  version: string | null;
  commit_sha: string | null;
  status: string;
  capabilities: string;
  state: string;
  message: string | null;
  first_seen_at: string;
  last_seen_at: string;
  updated_at: string;
}

interface ConnectionTestRow {
  id: string;
  agent_key_id: string;
  key_name?: string;
  key_prefix?: string;
  status: "pending" | "delivered" | "succeeded" | "failed" | "cancelled";
  request_message: string;
  expected_reply: string;
  reply_message: string | null;
  created_at: string;
  delivered_at: string | null;
  responded_at: string | null;
  expires_at: string;
}

export interface ManagedAgentView {
  id: string;
  keyId: string;
  name: string;
  platform: string;
  version: string | null;
  commitSha: string | null;
  status: "online" | "offline";
  reportedStatus: string;
  capabilities: Record<string, unknown>;
  state: Record<string, unknown>;
  message: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface ConnectionTestView {
  id: string;
  keyId: string;
  keyName: string | null;
  keyPrefix: string | null;
  status: "pending" | "delivered" | "succeeded" | "failed" | "cancelled" | "expired";
  requestMessage: string;
  expectedReply: string;
  replyMessage: string | null;
  createdAt: string;
  deliveredAt: string | null;
  respondedAt: string | null;
  expiresAt: string;
}

function randomId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `act_${bytesToBase64Url(bytes)}`;
}

function parseObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function safeObject(value: unknown, name: string, maxBytes: number): string {
  const actual = value === undefined || value === null ? {} : value;
  if (typeof actual !== "object" || Array.isArray(actual)) {
    throw new AppError(`${name} باید یک object باشد.`, { status: 400, code: "agent_payload_invalid" });
  }
  const json = JSON.stringify(actual);
  if (new TextEncoder().encode(json).length > maxBytes) {
    throw new AppError(`${name} بیش از حد بزرگ است.`, { status: 413, code: "agent_payload_too_large" });
  }
  return json;
}

function safeText(value: unknown, name: string, max: number, required = false): string | null {
  if (value === undefined || value === null) {
    if (required) throw new AppError(`${name} لازم است.`, { status: 400, code: "agent_field_required" });
    return null;
  }
  if (typeof value !== "string") {
    throw new AppError(`${name} معتبر نیست.`, { status: 400, code: "agent_field_invalid" });
  }
  const text = value.trim();
  if ((required && !text) || text.length > max) {
    throw new AppError(`${name} معتبر نیست یا بیش از ${max} نویسه دارد.`, {
      status: 400,
      code: "agent_field_invalid",
    });
  }
  return text || null;
}

function testView(row: ConnectionTestRow, now = Date.now()): ConnectionTestView {
  const expired = (row.status === "pending" || row.status === "delivered") && Date.parse(row.expires_at) <= now;
  return {
    id: row.id,
    keyId: row.agent_key_id,
    keyName: row.key_name ?? null,
    keyPrefix: row.key_prefix ?? null,
    status: expired ? "expired" : row.status,
    requestMessage: row.request_message,
    expectedReply: row.expected_reply,
    replyMessage: row.reply_message,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at,
    respondedAt: row.responded_at,
    expiresAt: row.expires_at,
  };
}

function agentView(row: ManagedAgentRow, now = Date.now()): ManagedAgentView {
  return {
    id: row.id,
    keyId: row.agent_key_id,
    name: row.name,
    platform: row.platform,
    version: row.version,
    commitSha: row.commit_sha,
    status: now - Date.parse(row.last_seen_at) <= ONLINE_WINDOW_MS ? "online" : "offline",
    reportedStatus: row.status,
    capabilities: parseObject(row.capabilities),
    state: parseObject(row.state),
    message: row.message,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
  };
}

export async function recordHeartbeat(
  key: AuthenticatedAgentKey,
  input: {
    agentId?: unknown;
    name?: unknown;
    platform?: unknown;
    version?: unknown;
    commit?: unknown;
    status?: unknown;
    capabilities?: unknown;
    state?: unknown;
    message?: unknown;
  },
) {
  const agentId = safeText(input.agentId, "شناسه ایجنت", 100, true)!;
  if (!/^[A-Za-z0-9._-]+$/.test(agentId)) {
    throw new AppError("شناسه ایجنت فقط می‌تواند شامل حروف لاتین، عدد، نقطه، خط تیره و زیرخط باشد.", {
      status: 400,
      code: "agent_id_invalid",
    });
  }
  const name = safeText(input.name, "نام ایجنت", 100, true)!;
  const platform = safeText(input.platform, "پلتفرم", 40) ?? "windows";
  const version = safeText(input.version, "نسخه", 80);
  const commit = safeText(input.commit, "شناسه کامیت", 80);
  const status = safeText(input.status, "وضعیت", 40) ?? "online";
  const message = safeText(input.message, "پیام", 500);
  const capabilities = safeObject(input.capabilities, "قابلیت‌ها", 12_000);
  const state = safeObject(input.state, "وضعیت تفصیلی", 24_000);
  const now = new Date().toISOString();
  const existing = await dbFirst<{ agent_key_id: string }>("SELECT agent_key_id FROM managed_agents WHERE id = ?", [agentId]);
  if (existing && existing.agent_key_id !== key.id) {
    throw new AppError("این شناسه ایجنت قبلاً به کلید دیگری متصل شده است.", {
      status: 409,
      code: "agent_id_key_conflict",
      hint: "برای دستگاه شناسه‌ی یکتا انتخاب کنید یا از کلید قبلی همان دستگاه استفاده کنید.",
    });
  }

  await dbRun(
    `INSERT INTO managed_agents
      (id, agent_key_id, name, platform, version, commit_sha, status, capabilities, state, message,
       first_seen_at, last_seen_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       agent_key_id = excluded.agent_key_id,
       name = excluded.name,
       platform = excluded.platform,
       version = excluded.version,
       commit_sha = excluded.commit_sha,
       status = excluded.status,
       capabilities = excluded.capabilities,
       state = excluded.state,
       message = excluded.message,
       last_seen_at = excluded.last_seen_at,
       updated_at = excluded.updated_at`,
    [agentId, key.id, name, platform, version, commit, status, capabilities, state, message, now, now, now],
  );

  const pending = await dbFirst<{ count: number }>(
    `SELECT COUNT(*) AS count FROM agent_connection_tests
     WHERE agent_key_id = ? AND status = 'pending' AND expires_at > ?`,
    [key.id, now],
  );
  return {
    ok: true,
    agentId,
    serverTime: now,
    heartbeatIntervalSeconds: 30,
    pendingConnectionTests: Number(pending?.count ?? 0),
  };
}

export async function adminAgentConnectionBundle() {
  const now = new Date().toISOString();
  const [keyRows, agentRows, testRows] = await Promise.all([
    dbAll<{ id: string; name: string; key_prefix: string; scopes: string; expires_at: string | null }>(
      `SELECT id, name, key_prefix, scopes, expires_at FROM agent_keys
       WHERE status = 'active' AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY created_at DESC`,
      [now],
    ),
    dbAll<ManagedAgentRow>(
      `SELECT id, agent_key_id, name, platform, version, commit_sha, status, capabilities, state,
              message, first_seen_at, last_seen_at, updated_at
       FROM managed_agents ORDER BY last_seen_at DESC LIMIT 20`,
    ),
    dbAll<ConnectionTestRow>(
      `SELECT t.*, k.name AS key_name, k.key_prefix AS key_prefix
       FROM agent_connection_tests t
       LEFT JOIN agent_keys k ON k.id = t.agent_key_id
       ORDER BY t.created_at DESC LIMIT 12`,
    ),
  ]);

  const keys = keyRows
    .map((row) => {
      let scopes: string[] = [];
      try { scopes = JSON.parse(row.scopes) as string[]; } catch { scopes = []; }
      return { id: row.id, name: row.name, keyPrefix: row.key_prefix, scopes, expiresAt: row.expires_at };
    })
    .filter((key) => key.scopes.includes("commands:read") && key.scopes.includes("events:write"));

  return {
    expectedReply: CONNECTION_TEST_REPLY,
    keys,
    agents: agentRows.map((row) => agentView(row)),
    tests: testRows.map((row) => testView(row)),
    checkedAt: new Date().toISOString(),
  };
}

export async function startAgentConnectionTest(keyId: unknown) {
  if (typeof keyId !== "string" || !/^ak_[A-Za-z0-9_-]{8,40}$/.test(keyId)) {
    throw new AppError("یک کلید فعال برای تست انتخاب کنید.", { status: 400, code: "agent_test_key_invalid" });
  }
  const key = await dbFirst<{ id: string; name: string; scopes: string; status: string; expires_at: string | null }>(
    "SELECT id, name, scopes, status, expires_at FROM agent_keys WHERE id = ?",
    [keyId],
  );
  if (!key || key.status !== "active" || (key.expires_at && Date.parse(key.expires_at) <= Date.now())) {
    throw new AppError("کلید انتخاب‌شده فعال نیست.", { status: 409, code: "agent_test_key_inactive" });
  }
  let scopes: string[] = [];
  try { scopes = JSON.parse(key.scopes) as string[]; } catch { scopes = []; }
  if (!scopes.includes("commands:read") || !scopes.includes("events:write")) {
    throw new AppError("کلید تست باید دسترسی commands:read و events:write داشته باشد.", {
      status: 409,
      code: "agent_test_scope_missing",
    });
  }

  const id = randomId();
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + TEST_TTL_MS).toISOString();
  await dbBatch([
    {
      sql: `UPDATE agent_connection_tests SET status = 'cancelled'
            WHERE agent_key_id = ? AND status IN ('pending', 'delivered')`,
      params: [keyId],
    },
    {
      sql: `INSERT INTO agent_connection_tests
        (id, agent_key_id, status, request_message, expected_reply, created_at, expires_at)
        VALUES (?, ?, 'pending', ?, ?, ?, ?)`,
      params: [id, keyId, CONNECTION_TEST_REQUEST, CONNECTION_TEST_REPLY, createdAt, expiresAt],
    },
    {
      sql: `INSERT INTO events (kind, title, detail, created_at)
            VALUES ('agent_connection_test_started', 'تست اتصال ایجنت آغاز شد', ?, ?)`,
      params: [`${key.name} · ${id}`, createdAt],
    },
  ]);
  return adminAgentConnectionBundle();
}

export async function claimConnectionTest(key: AuthenticatedAgentKey) {
  const now = new Date().toISOString();
  const row = await dbFirst<ConnectionTestRow>(
    `SELECT * FROM agent_connection_tests
     WHERE agent_key_id = ? AND status IN ('pending', 'delivered') AND expires_at > ?
     ORDER BY created_at ASC LIMIT 1`,
    [key.id, now],
  );
  if (!row) return { test: null, retryAfterSeconds: 5, serverTime: now };
  if (row.status === "pending") {
    await dbRun(
      `UPDATE agent_connection_tests SET status = 'delivered', delivered_at = ?
       WHERE id = ? AND status = 'pending'`,
      [now, row.id],
    );
    row.status = "delivered";
    row.delivered_at = now;
  }
  return {
    test: {
      id: row.id,
      type: "connection_test",
      message: row.request_message,
      expectedReply: row.expected_reply,
      expiresAt: row.expires_at,
    },
    retryAfterSeconds: 5,
    serverTime: now,
  };
}

export async function answerConnectionTest(
  key: AuthenticatedAgentKey,
  input: { testId?: unknown; message?: unknown },
) {
  const testId = safeText(input.testId, "شناسه تست", 80, true)!;
  const message = safeText(input.message, "پیام پاسخ", 200, true)!;
  const row = await dbFirst<ConnectionTestRow>(
    `SELECT * FROM agent_connection_tests WHERE id = ? AND agent_key_id = ?`,
    [testId, key.id],
  );
  if (!row) throw new AppError("تست اتصال پیدا نشد.", { status: 404, code: "agent_test_not_found" });
  if (!['pending', 'delivered'].includes(row.status)) {
    throw new AppError("این تست قبلاً بسته شده است.", { status: 409, code: "agent_test_closed" });
  }
  if (Date.parse(row.expires_at) <= Date.now()) {
    throw new AppError("مهلت تست اتصال تمام شده است.", { status: 410, code: "agent_test_expired" });
  }

  const succeeded = message === row.expected_reply;
  const now = new Date().toISOString();
  await dbBatch([
    {
      sql: `UPDATE agent_connection_tests
            SET status = ?, reply_message = ?, responded_at = ?,
                delivered_at = COALESCE(delivered_at, ?)
            WHERE id = ?`,
      params: [succeeded ? "succeeded" : "failed", message, now, now, testId],
    },
    {
      sql: `INSERT INTO events (kind, title, detail, created_at)
            VALUES (?, ?, ?, ?)`,
      params: [
        succeeded ? "agent_connection_test_succeeded" : "agent_connection_test_failed",
        succeeded ? "اتصال ایجنت ویندوز تأیید شد" : "پاسخ تست اتصال نادرست بود",
        `${key.name} · ${message}`,
        now,
      ],
    },
  ]);
  return {
    ok: succeeded,
    status: succeeded ? "succeeded" : "failed",
    expectedReply: row.expected_reply,
    receivedMessage: message,
    serverTime: now,
  };
}
