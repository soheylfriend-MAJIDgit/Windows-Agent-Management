import { bytesToBase64Url } from "./crypto";
import { dbAll, dbBatch, dbFirst, dbRun } from "./db";
import { AppError } from "./errors";
import type { AuthenticatedAgentKey } from "./agent-keys";

export type AgentControlStatus = "pending" | "delivered" | "succeeded" | "failed" | "expired" | "cancelled";

interface AgentControlRow {
  id: string;
  agent_key_id: string;
  agent_id: string;
  action: "stop_all_executions";
  status: AgentControlStatus;
  reason: string;
  requested_by: string;
  result: string;
  created_at: string;
  delivered_at: string | null;
  completed_at: string | null;
  expires_at: string;
}

export interface AgentControlView {
  id: string;
  agentId: string;
  action: "stop_all_executions";
  status: AgentControlStatus;
  reason: string;
  requestedBy: string;
  result: Record<string, unknown>;
  createdAt: string;
  deliveredAt: string | null;
  completedAt: string | null;
  expiresAt: string;
}

function randomControlId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `ctl_${bytesToBase64Url(bytes)}`;
}

function parseObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function view(row: AgentControlRow): AgentControlView {
  const expired = (row.status === "pending" || row.status === "delivered") && Date.parse(row.expires_at) <= Date.now();
  return {
    id: row.id,
    agentId: row.agent_id,
    action: row.action,
    status: expired ? "expired" : row.status,
    reason: row.reason,
    requestedBy: row.requested_by,
    result: parseObject(row.result),
    createdAt: row.created_at,
    deliveredAt: row.delivered_at,
    completedAt: row.completed_at,
    expiresAt: row.expires_at,
  };
}

export async function latestEmergencyControl(): Promise<AgentControlView | null> {
  const row = await dbFirst<AgentControlRow>("SELECT * FROM agent_control_requests ORDER BY created_at DESC LIMIT 1");
  return row ? view(row) : null;
}

export async function selectEmergencyControlTarget(): Promise<{ keyId: string; agentId: string; agentName: string; version: string | null; online: boolean }> {
  const row = await dbFirst<{ agent_key_id: string; agent_id: string; agent_name: string; version: string | null; last_seen_at: string; capabilities: string; scopes: string }>(
    `SELECT a.agent_key_id, a.id AS agent_id, a.name AS agent_name, a.version, a.last_seen_at, a.capabilities, k.scopes
     FROM managed_agents a JOIN agent_keys k ON k.id = a.agent_key_id
     WHERE k.status = 'active' AND (k.expires_at IS NULL OR k.expires_at > ?)
     ORDER BY a.last_seen_at DESC LIMIT 20`,
    [new Date().toISOString()],
  );
  if (!row) {
    throw new AppError("هیچ Windows Agent ثبت‌شده‌ای برای دریافت توقف اضطراری وجود ندارد.", {
      status: 409,
      code: "agent_control_target_missing",
      hint: "Windows Agent را اجرا و اتصال مدیریت را برقرار کنید.",
    });
  }
  const capabilities = parseObject(row.capabilities);
  let scopes: unknown = [];
  try { scopes = JSON.parse(row.scopes); } catch { scopes = []; }
  if (capabilities.command_plane !== true || capabilities.emergency_stop_all !== true || !Array.isArray(scopes) || !scopes.includes("commands:read") || !scopes.includes("results:write")) {
    throw new AppError("نسخه فعلی Windows Agent مسیر توقف اضطراری از سایت را اعلام نکرده است.", {
      status: 409,
      code: "agent_emergency_stop_unsupported",
      hint: "در Heartbeat قابلیت emergency_stop_all=true را ارسال و emergencyControl پاسخ Heartbeat را در manager_client.py مصرف کنید.",
    });
  }
  return {
    keyId: row.agent_key_id,
    agentId: row.agent_id,
    agentName: row.agent_name,
    version: row.version,
    online: Date.parse(row.last_seen_at) >= Date.now() - 90_000,
  };
}

export async function createStopAllControl(target: { keyId: string; agentId: string }, requestedBy: string, reason: string): Promise<{ control: AgentControlView; reused: boolean }> {
  const now = new Date().toISOString();
  const existing = await dbFirst<AgentControlRow>(
    `SELECT * FROM agent_control_requests
     WHERE agent_id = ? AND action = 'stop_all_executions' AND status IN ('pending', 'delivered') AND expires_at > ?
     ORDER BY created_at DESC LIMIT 1`,
    [target.agentId, now],
  );
  if (existing) return { control: view(existing), reused: true };
  const id = randomControlId();
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  await dbRun(
    `INSERT INTO agent_control_requests
      (id, agent_key_id, agent_id, action, status, reason, requested_by, result, created_at, delivered_at, completed_at, expires_at)
     VALUES (?, ?, ?, 'stop_all_executions', 'pending', ?, ?, '{}', ?, NULL, NULL, ?)`,
    [id, target.keyId, target.agentId, reason.slice(0, 500), requestedBy.slice(0, 120), now, expiresAt],
  );
  return { control: view((await dbFirst<AgentControlRow>("SELECT * FROM agent_control_requests WHERE id = ?", [id]))!), reused: false };
}

export async function claimEmergencyControl(key: AuthenticatedAgentKey, agentId: string): Promise<null | {
  id: string;
  action: "stop_all_executions";
  reason: string;
  requestedAt: string;
  resultEndpoint: string;
}> {
  const now = new Date().toISOString();
  await dbRun(
    "UPDATE agent_control_requests SET status = 'expired', completed_at = ? WHERE status IN ('pending', 'delivered') AND expires_at <= ?",
    [now, now],
  );
  const row = await dbFirst<AgentControlRow>(
    `SELECT * FROM agent_control_requests
     WHERE agent_key_id = ? AND agent_id = ? AND status IN ('pending', 'delivered') AND expires_at > ?
     ORDER BY created_at ASC LIMIT 1`,
    [key.id, agentId, now],
  );
  if (!row) return null;
  if (row.status === "pending") {
    await dbRun(
      "UPDATE agent_control_requests SET status = 'delivered', delivered_at = ? WHERE id = ? AND status = 'pending'",
      [now, row.id],
    );
  }
  return {
    id: row.id,
    action: row.action,
    reason: row.reason,
    requestedAt: row.created_at,
    resultEndpoint: `/api/agent/controls/${row.id}`,
  };
}

export async function completeEmergencyControl(key: AuthenticatedAgentKey, id: string, input: unknown): Promise<AgentControlView> {
  if (!/^ctl_[A-Za-z0-9_-]{12,40}$/.test(id)) throw new AppError("شناسه کنترل اضطراری معتبر نیست.", { status: 400, code: "agent_control_id_invalid" });
  const row = await dbFirst<AgentControlRow>("SELECT * FROM agent_control_requests WHERE id = ? AND agent_key_id = ?", [id, key.id]);
  if (!row) throw new AppError("درخواست کنترل اضطراری پیدا نشد.", { status: 404, code: "agent_control_not_found" });
  const body = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const status = body.status === "succeeded" ? "succeeded" : body.status === "failed" ? "failed" : null;
  if (!status) throw new AppError("نتیجه کنترل باید succeeded یا failed باشد.", { status: 422, code: "agent_control_status_invalid" });
  const resultValue = body.result && typeof body.result === "object" && !Array.isArray(body.result) ? body.result as Record<string, unknown> : {};
  const remainingPids = Array.isArray(resultValue.remainingPids)
    ? resultValue.remainingPids.map(Number).filter((value) => Number.isInteger(value) && value > 0)
    : [];
  if (status === "succeeded" && (resultValue.verified !== true || remainingPids.length > 0)) {
    throw new AppError("تأیید توقف همه بدون راستی‌آزمایی registry یا با PID باقی‌مانده پذیرفته نمی‌شود.", {
      status: 422,
      code: "agent_control_verification_required",
      hint: "result.verified=true و remainingPids=[] را فقط پس از بررسی واقعی Processهای متعلق ارسال کنید.",
    });
  }
  const result = JSON.stringify({ ...resultValue, remainingPids });
  if (new TextEncoder().encode(result).length > 24_000) throw new AppError("گزارش توقف اضطراری بیش از حد بزرگ است.", { status: 413, code: "agent_control_result_too_large" });
  const now = new Date().toISOString();
  const queries: Array<{ sql: string; params?: unknown[] }> = [
    { sql: "UPDATE agent_control_requests SET status = ?, result = ?, completed_at = ? WHERE id = ?", params: [status, result, now, id] },
    { sql: "INSERT INTO events (kind, title, detail, created_at) VALUES ('agent_emergency_control_completed', ?, ?, ?)", params: [status === "succeeded" ? "توقف فوری همه اجراها تأیید شد" : "توقف فوری همه اجراها کامل نشد", `${row.agent_id} · ${id}`, now] },
  ];
  if (status === "succeeded") {
    const staleCommands = await dbAll<{ id: string }>(
      `SELECT id FROM commands
       WHERE agent_id = ? AND cancel_requested_at IS NOT NULL
         AND status IN ('pending', 'claimed', 'waiting_confirmation', 'running')`,
      [row.agent_id],
    );
    for (const command of staleCommands) {
      queries.push(
        {
          sql: `UPDATE commands SET status = 'cancelled', completed_at = ?, last_event_at = ?,
                  error = COALESCE(error, 'توقف همه اجراها توسط Windows Agent تأیید شد.')
                WHERE id = ? AND cancel_requested_at IS NOT NULL
                  AND status IN ('pending', 'claimed', 'waiting_confirmation', 'running')`,
          params: [now, now, command.id],
        },
        {
          sql: `INSERT INTO command_events (command_id, seq, stage, level, message, data, created_at)
                VALUES (?, (SELECT COALESCE(MAX(seq), 1000000) + 1 FROM command_events WHERE command_id = ?),
                        'emergency_stop_verified', 'warning', ?, ?, ?)`,
          params: [command.id, command.id, "Windows Agent خالی‌بودن registry و نبود PID متعلق باقی‌مانده را تأیید کرد؛ فرمان متوقف شد.", JSON.stringify({ controlId: id, verified: true, remainingPids: [] }), now],
        },
      );
    }
  }
  await dbBatch(queries);
  return view((await dbFirst<AgentControlRow>("SELECT * FROM agent_control_requests WHERE id = ?", [id]))!);
}
