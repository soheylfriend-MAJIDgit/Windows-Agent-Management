import { AppError } from "./errors";
import { bytesToBase64Url, sha256Hex } from "./crypto";
import { dbAll, dbBatch, dbFirst, dbRun } from "./db";

export const AGENT_KEY_SCOPES = [
  "heartbeat:write",
  "events:write",
  "commands:read",
  "results:write",
  "artifacts:write",
  "reports:read",
  "automations:read",
  "automations:write",
  "automations:run",
] as const;

export type AgentKeyScope = (typeof AGENT_KEY_SCOPES)[number];

export const AGENT_SCOPE_LABELS: Record<AgentKeyScope, string> = {
  "heartbeat:write": "ارسال وضعیت و Heartbeat",
  "events:write": "ثبت رخداد و لاگ مرحله‌ای",
  "commands:read": "دریافت فرمان‌های سایت",
  "results:write": "ثبت نتیجه‌ی اجرای فرمان",
  "artifacts:write": "ثبت مشخصات فایل و اسکرین‌شات",
  "reports:read": "خواندن گزارش‌های مدیریتی",
  "automations:read": "خواندن کدهای اتوماسیون",
  "automations:write": "ساخت و نسخه‌بندی کدهای اتوماسیون",
  "automations:run": "درخواست اجرای کدهای اتوماسیون",
};

interface AgentKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  secret_hash: string;
  scopes: string;
  note: string | null;
  status: "active" | "revoked";
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
}

export interface AgentKeyView {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: AgentKeyScope[];
  note: string | null;
  status: "active" | "revoked" | "expired";
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface AgentKeyBundle {
  keys: AgentKeyView[];
  availableScopes: Array<{ id: AgentKeyScope; label: string }>;
  stats: { total: number; active: number; revoked: number; expired: number };
  generatedKey?: string;
  generatedKeyId?: string;
}

function parseScopes(value: string): AgentKeyScope[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is AgentKeyScope =>
      typeof item === "string" && AGENT_KEY_SCOPES.includes(item as AgentKeyScope),
    );
  } catch {
    return [];
  }
}

function view(row: AgentKeyRow, now = Date.now()): AgentKeyView {
  const expired = row.status === "active" && Boolean(row.expires_at) && Date.parse(row.expires_at!) <= now;
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix,
    scopes: parseScopes(row.scopes),
    note: row.note,
    status: expired ? "expired" : row.status,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

function normalizeName(value: unknown): string {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 80) {
    throw new AppError("نام کلید باید بین ۲ تا ۸۰ نویسه باشد.", {
      status: 400,
      code: "agent_key_name_invalid",
    });
  }
  return name;
}

function normalizeNote(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new AppError("یادداشت کلید معتبر نیست.", { status: 400, code: "agent_key_note_invalid" });
  }
  const note = value.trim();
  if (note.length > 300) {
    throw new AppError("یادداشت کلید حداکثر ۳۰۰ نویسه است.", {
      status: 400,
      code: "agent_key_note_too_long",
    });
  }
  return note || null;
}

function normalizeScopes(value: unknown): AgentKeyScope[] {
  if (!Array.isArray(value)) {
    throw new AppError("حداقل یک دسترسی برای کلید انتخاب کنید.", {
      status: 400,
      code: "agent_key_scopes_required",
    });
  }
  const unique = [...new Set(value)];
  if (!unique.length || unique.some((item) => typeof item !== "string" || !AGENT_KEY_SCOPES.includes(item as AgentKeyScope))) {
    throw new AppError("فهرست دسترسی‌های کلید معتبر نیست.", {
      status: 400,
      code: "agent_key_scopes_invalid",
    });
  }
  return unique as AgentKeyScope[];
}

function expiryFromDays(value: unknown): string | null {
  if (value === null || value === undefined || value === "never" || value === 0) return null;
  const days = Number(value);
  if (![30, 90, 365].includes(days)) {
    throw new AppError("مدت اعتبار کلید معتبر نیست.", {
      status: 400,
      code: "agent_key_expiry_invalid",
    });
  }
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function randomPart(bytes: number): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return bytesToBase64Url(data);
}

async function makeSecret(): Promise<{ id: string; token: string; prefix: string; hash: string }> {
  const id = `ak_${randomPart(9)}`;
  const token = `wam_agent_${id}.${randomPart(32)}`;
  return {
    id,
    token,
    prefix: `${token.slice(0, 24)}…`,
    hash: await sha256Hex(token),
  };
}

async function rows(): Promise<AgentKeyRow[]> {
  return dbAll<AgentKeyRow>(`
    SELECT id, name, key_prefix, secret_hash, scopes, note, status,
           created_at, last_used_at, expires_at, revoked_at
    FROM agent_keys
    ORDER BY created_at DESC
  `);
}

async function bundle(generated?: { token: string; id: string }): Promise<AgentKeyBundle> {
  const keys = (await rows()).map((row) => view(row));
  return {
    keys,
    availableScopes: AGENT_KEY_SCOPES.map((id) => ({ id, label: AGENT_SCOPE_LABELS[id] })),
    stats: {
      total: keys.length,
      active: keys.filter((key) => key.status === "active").length,
      revoked: keys.filter((key) => key.status === "revoked").length,
      expired: keys.filter((key) => key.status === "expired").length,
    },
    ...(generated ? { generatedKey: generated.token, generatedKeyId: generated.id } : {}),
  };
}

export async function listAgentKeys(): Promise<AgentKeyBundle> {
  return bundle();
}

export async function createAgentKey(input: {
  name?: unknown;
  note?: unknown;
  scopes?: unknown;
  expiresInDays?: unknown;
}): Promise<AgentKeyBundle> {
  const name = normalizeName(input.name);
  const note = normalizeNote(input.note);
  const scopes = normalizeScopes(input.scopes);
  const expiresAt = expiryFromDays(input.expiresInDays);
  const active = await dbFirst<{ count: number }>(
    "SELECT COUNT(*) AS count FROM agent_keys WHERE status = 'active' AND (expires_at IS NULL OR expires_at > ?)",
    [new Date().toISOString()],
  );
  if (Number(active?.count ?? 0) >= 20) {
    throw new AppError("حداکثر ۲۰ کلید فعال مجاز است.", {
      status: 409,
      code: "agent_key_limit",
      hint: "یکی از کلیدهای قدیمی را غیرفعال کنید.",
    });
  }

  const secret = await makeSecret();
  const now = new Date().toISOString();
  await dbBatch([
    {
      sql: `INSERT INTO agent_keys
        (id, name, key_prefix, secret_hash, scopes, note, status, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      params: [secret.id, name, secret.prefix, secret.hash, JSON.stringify(scopes), note, now, expiresAt],
    },
    {
      sql: `INSERT INTO events (kind, title, detail, created_at)
            VALUES ('agent_key_created', 'کلید ایجنت ساخته شد', ?, ?)`,
      params: [`${name} · ${secret.prefix}`, now],
    },
  ]);
  return bundle({ token: secret.token, id: secret.id });
}

export async function revokeAgentKey(id: unknown): Promise<AgentKeyBundle> {
  if (typeof id !== "string" || !/^ak_[A-Za-z0-9_-]{8,40}$/.test(id)) {
    throw new AppError("شناسه‌ی کلید معتبر نیست.", { status: 400, code: "agent_key_id_invalid" });
  }
  const key = await dbFirst<Pick<AgentKeyRow, "id" | "name" | "status" | "key_prefix">>(
    "SELECT id, name, status, key_prefix FROM agent_keys WHERE id = ?",
    [id],
  );
  if (!key) throw new AppError("کلید ایجنت پیدا نشد.", { status: 404, code: "agent_key_not_found" });
  if (key.status === "revoked") return bundle();

  const now = new Date().toISOString();
  await dbBatch([
    {
      sql: "UPDATE agent_keys SET status = 'revoked', revoked_at = ? WHERE id = ?",
      params: [now, id],
    },
    {
      sql: `INSERT INTO events (kind, title, detail, created_at)
            VALUES ('agent_key_revoked', 'کلید ایجنت غیرفعال شد', ?, ?)`,
      params: [`${key.name} · ${key.key_prefix}`, now],
    },
  ]);
  return bundle();
}

export async function rotateAgentKey(id: unknown): Promise<AgentKeyBundle> {
  if (typeof id !== "string" || !/^ak_[A-Za-z0-9_-]{8,40}$/.test(id)) {
    throw new AppError("شناسه‌ی کلید معتبر نیست.", { status: 400, code: "agent_key_id_invalid" });
  }
  const current = await dbFirst<AgentKeyRow>(
    `SELECT id, name, key_prefix, secret_hash, scopes, note, status,
            created_at, last_used_at, expires_at, revoked_at
     FROM agent_keys WHERE id = ?`,
    [id],
  );
  if (!current) throw new AppError("کلید ایجنت پیدا نشد.", { status: 404, code: "agent_key_not_found" });
  if (current.status !== "active") {
    throw new AppError("فقط کلید فعال قابل تعویض است.", {
      status: 409,
      code: "agent_key_not_active",
    });
  }

  const secret = await makeSecret();
  const now = new Date().toISOString();
  await dbBatch([
    {
      sql: "UPDATE agent_keys SET status = 'revoked', revoked_at = ? WHERE id = ? AND status = 'active'",
      params: [now, id],
    },
    {
      sql: `INSERT INTO agent_keys
        (id, name, key_prefix, secret_hash, scopes, note, status, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      params: [
        secret.id,
        current.name,
        secret.prefix,
        secret.hash,
        current.scopes,
        current.note,
        now,
        current.expires_at,
      ],
    },
    {
      sql: `INSERT INTO events (kind, title, detail, created_at)
            VALUES ('agent_key_rotated', 'کلید ایجنت تعویض شد', ?, ?)`,
      params: [`${current.name} · ${current.key_prefix} ← ${secret.prefix}`, now],
    },
  ]);
  return bundle({ token: secret.token, id: secret.id });
}

export interface AuthenticatedAgentKey extends AgentKeyView {
  secretHash: string;
}

export async function authenticateAgentRequest(req: Request, requiredScope?: AgentKeyScope): Promise<AuthenticatedAgentKey> {
  const authorization = req.headers.get("authorization")?.trim() ?? "";
  const headerKey = req.headers.get("x-agent-key")?.trim() ?? "";
  const token = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : headerKey;
  if (!token) {
    throw new AppError("کلید ایجنت ارسال نشده است.", {
      status: 401,
      code: "agent_key_missing",
      hint: "هدر Authorization: Bearer <key> یا X-Agent-Key را ارسال کنید.",
    });
  }

  const hash = await sha256Hex(token);
  const row = await dbFirst<AgentKeyRow>(
    `SELECT id, name, key_prefix, secret_hash, scopes, note, status,
            created_at, last_used_at, expires_at, revoked_at
     FROM agent_keys WHERE secret_hash = ?`,
    [hash],
  );
  if (!row || row.status !== "active") {
    throw new AppError("کلید ایجنت معتبر یا فعال نیست.", { status: 401, code: "agent_key_invalid" });
  }
  const key = view(row);
  if (key.status === "expired") {
    throw new AppError("اعتبار کلید ایجنت تمام شده است.", {
      status: 401,
      code: "agent_key_expired",
      hint: "در تب «کلید ایجنت» یک کلید تازه بسازید.",
    });
  }
  if (requiredScope && !key.scopes.includes(requiredScope)) {
    throw new AppError("این کلید اجازه‌ی انجام این عملیات را ندارد.", {
      status: 403,
      code: "agent_key_scope_denied",
      hint: `دسترسی لازم: ${requiredScope}`,
    });
  }

  await dbRun("UPDATE agent_keys SET last_used_at = ? WHERE id = ?", [new Date().toISOString(), row.id]);
  return { ...key, lastUsedAt: new Date().toISOString(), secretHash: row.secret_hash };
}
