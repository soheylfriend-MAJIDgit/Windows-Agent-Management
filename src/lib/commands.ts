import { bytesToBase64Url } from "./crypto";
import { dbAll, dbBatch, dbFirst, dbRun } from "./db";
import { AppError } from "./errors";
import type { AuthenticatedAgentKey } from "./agent-keys";

export const COMMAND_ACTIVE_STATUSES = ["pending", "claimed", "waiting_confirmation", "running"] as const;
export const COMMAND_FINAL_STATUSES = ["succeeded", "failed", "cancelled", "timed_out", "rejected"] as const;
export type CommandStatus = (typeof COMMAND_ACTIVE_STATUSES)[number] | (typeof COMMAND_FINAL_STATUSES)[number];
export type CommandLevel = "debug" | "info" | "warning" | "error" | "fatal";

interface CommandRow {
  id: string;
  agent_key_id: string;
  agent_id: string | null;
  type: string;
  title: string;
  payload: string;
  status: CommandStatus;
  source: string;
  prompt_id: number | null;
  job_name: string | null;
  requires_confirmation: number;
  auto_stop_on_anomaly: number;
  timeout_seconds: number;
  no_progress_seconds: number;
  created_at: string;
  claimed_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  last_event_at: string | null;
  cancel_requested_at: string | null;
  cancel_reason: string | null;
  error: string | null;
  result: string | null;
}

interface CommandEventRow {
  id: number;
  command_id: string;
  seq: number;
  stage: string;
  level: CommandLevel;
  message: string;
  data: string;
  created_at: string;
}

interface CommandArtifactRow {
  id: string;
  command_id: string;
  kind: string;
  stage: string | null;
  name: string;
  local_path: string | null;
  drive_file_id: string | null;
  drive_url: string | null;
  mime_type: string | null;
  size: number | null;
  created_at: string;
}

export interface CommandView {
  id: string;
  agentKeyId: string;
  agentId: string | null;
  type: string;
  title: string;
  payload: Record<string, unknown>;
  status: CommandStatus;
  source: string;
  promptId: number | null;
  jobName: string | null;
  requiresConfirmation: boolean;
  autoStopOnAnomaly: boolean;
  timeoutSeconds: number;
  noProgressSeconds: number;
  createdAt: string;
  claimedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  lastEventAt: string | null;
  cancelRequestedAt: string | null;
  cancelReason: string | null;
  error: string | null;
  result: Record<string, unknown> | null;
}

export interface CommandEventView {
  id: number;
  commandId: string;
  seq: number;
  stage: string;
  level: CommandLevel;
  message: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface CommandArtifactView {
  id: string;
  commandId: string;
  kind: string;
  stage: string | null;
  name: string;
  localPath: string | null;
  driveFileId: string | null;
  driveUrl: string | null;
  mimeType: string | null;
  size: number | null;
  createdAt: string;
}

export interface CommandDetail {
  command: CommandView;
  events: CommandEventView[];
  artifacts: CommandArtifactView[];
  anomaly: {
    detected: boolean;
    shouldStop: boolean;
    reasons: string[];
    staleSeconds: number | null;
  };
  serverTime: string;
}

function randomId(prefix: string, bytes = 12): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return `${prefix}_${bytesToBase64Url(data)}`;
}

function objectJson(value: unknown, label: string, maxBytes = 32_000): string {
  const actual = value === undefined || value === null ? {} : value;
  if (typeof actual !== "object" || Array.isArray(actual)) {
    throw new AppError(`${label} باید یک object باشد.`, { status: 400, code: "command_payload_invalid" });
  }
  const text = JSON.stringify(actual);
  if (new TextEncoder().encode(text).length > maxBytes) {
    throw new AppError(`${label} بیش از حد بزرگ است.`, { status: 413, code: "command_payload_too_large" });
  }
  return text;
}

function parseObject(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function serviceArtifactMarker(message: string): {
  artifactId: string;
  kind: string;
  stage: string | null;
  name: string;
  localPath: string;
  mimeType: string | null;
} | null {
  const prefix = "SERVICE_ARTIFACT:";
  if (!message.startsWith(prefix)) return null;
  try {
    const value = JSON.parse(message.slice(prefix.length).trim()) as Record<string, unknown>;
    const artifactId = typeof value.artifactId === "string" ? value.artifactId : "";
    const kind = typeof value.kind === "string" ? value.kind.trim().slice(0, 40) : "";
    const stage = typeof value.stage === "string" ? value.stage.trim().slice(0, 80) || null : null;
    const name = typeof value.name === "string" ? value.name.trim().slice(0, 260) : "";
    const localPath = typeof value.localPath === "string" ? value.localPath.trim().slice(0, 1000) : "";
    const mimeType = typeof value.mimeType === "string" ? value.mimeType.trim().slice(0, 120) || null : null;
    if (!/^art_[A-Za-z0-9_-]{8,50}$/.test(artifactId) || !kind || !name || !localPath) return null;
    return { artifactId, kind, stage, name, localPath, mimeType };
  } catch {
    return null;
  }
}

function text(value: unknown, label: string, max: number, required = true): string | null {
  if (value === undefined || value === null) {
    if (required) throw new AppError(`${label} لازم است.`, { status: 400, code: "command_field_required" });
    return null;
  }
  if (typeof value !== "string") throw new AppError(`${label} معتبر نیست.`, { status: 400, code: "command_field_invalid" });
  const cleaned = value.trim();
  if ((required && !cleaned) || cleaned.length > max) {
    throw new AppError(`${label} معتبر نیست یا بیش از ${max} نویسه دارد.`, { status: 400, code: "command_field_invalid" });
  }
  return cleaned || null;
}

function mapCommand(row: CommandRow): CommandView {
  return {
    id: row.id,
    agentKeyId: row.agent_key_id,
    agentId: row.agent_id,
    type: row.type,
    title: row.title,
    payload: parseObject(row.payload),
    status: row.status,
    source: row.source,
    promptId: row.prompt_id,
    jobName: row.job_name,
    requiresConfirmation: row.requires_confirmation === 1,
    autoStopOnAnomaly: row.auto_stop_on_anomaly === 1,
    timeoutSeconds: row.timeout_seconds,
    noProgressSeconds: row.no_progress_seconds,
    createdAt: row.created_at,
    claimedAt: row.claimed_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    lastEventAt: row.last_event_at,
    cancelRequestedAt: row.cancel_requested_at,
    cancelReason: row.cancel_reason,
    error: row.error,
    result: row.result ? parseObject(row.result) : null,
  };
}

function displayEventMessage(row: CommandEventRow): string {
  if (row.stage === "network_paused") {
    return "دسترسی Windows Agent به API مدیریت موقتاً ناموفق بود. این رخداد به‌تنهایی به معنی قطع اینترنت یا قطع Arena نیست؛ تایمر بی‌پیشرفتی تا پاسخ بعدی API متوقف می‌ماند.";
  }
  if (row.stage === "network_resumed") {
    return "ارتباط Windows Agent با API مدیریت دوباره پاسخ داد. این پیام بازیابی مسیر Agent→API است، نه اثبات قطع و وصل اینترنت عمومی.";
  }
  return row.message;
}

function mapEvent(row: CommandEventRow): CommandEventView {
  return {
    id: row.id,
    commandId: row.command_id,
    seq: row.seq,
    stage: row.stage,
    level: row.level,
    message: displayEventMessage(row),
    data: parseObject(row.data),
    createdAt: row.created_at,
  };
}

function mapArtifact(row: CommandArtifactRow): CommandArtifactView {
  return {
    id: row.id,
    commandId: row.command_id,
    kind: row.kind,
    stage: row.stage,
    name: row.name,
    localPath: row.local_path,
    driveFileId: row.drive_file_id,
    driveUrl: row.drive_url,
    mimeType: row.mime_type,
    size: row.size,
    createdAt: row.created_at,
  };
}

async function commandRow(id: string): Promise<CommandRow | null> {
  return dbFirst<CommandRow>("SELECT * FROM commands WHERE id = ?", [id]);
}

function occurredAt(value: unknown): string {
  if (value === undefined || value === null) return new Date().toISOString();
  if (typeof value !== "string") throw new AppError("زمان رخداد معتبر نیست.", { status: 400, code: "command_timestamp_invalid" });
  const time = Date.parse(value);
  if (!Number.isFinite(time) || time > Date.now() + 300_000 || time < Date.now() - 7 * 86_400_000) {
    throw new AppError("زمان رخداد باید UTC/ISO و در بازه معتبر باشد.", { status: 400, code: "command_timestamp_invalid" });
  }
  return new Date(time).toISOString();
}

function validCommandId(value: unknown): string {
  if (typeof value !== "string" || !/^cmd_[A-Za-z0-9_-]{12,40}$/.test(value)) {
    throw new AppError("شناسه فرمان معتبر نیست.", { status: 400, code: "command_id_invalid" });
  }
  return value;
}

function isActive(status: CommandStatus): boolean {
  return (COMMAND_ACTIVE_STATUSES as readonly string[]).includes(status);
}

function parseScopes(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export async function findOnlineCommandAgent(requiredCapability: string | string[] = "command_plane"): Promise<{ keyId: string; agentId: string; agentName: string }> {
  const requiredCapabilities = Array.isArray(requiredCapability) ? requiredCapability : [requiredCapability];
  const cutoff = new Date(Date.now() - 90_000).toISOString();
  const rows = await dbAll<{ agent_key_id: string; agent_id: string; agent_name: string; scopes: string; capabilities: string }>(
    `SELECT a.agent_key_id, a.id AS agent_id, a.name AS agent_name, a.capabilities, k.scopes
     FROM managed_agents a
     JOIN agent_keys k ON k.id = a.agent_key_id
     WHERE a.last_seen_at >= ? AND k.status = 'active'
       AND (k.expires_at IS NULL OR k.expires_at > ?)
     ORDER BY a.last_seen_at DESC`,
    [cutoff, new Date().toISOString()],
  );
  const match = rows.find((row) => {
    const scopes = parseScopes(row.scopes);
    const capabilities = parseObject(row.capabilities);
    return capabilities.command_plane === true
      && requiredCapabilities.every((capability) => capability === "command_plane" || capabilities[capability] === true)
      && scopes.includes("commands:read")
      && scopes.includes("events:write")
      && scopes.includes("results:write")
      && scopes.includes("artifacts:write");
  });
  if (!match) {
    if (rows.length) {
      const candidate = rows[0];
      const capabilities = parseObject(candidate.capabilities);
      const scopes = parseScopes(candidate.scopes);
      const missingCapabilities = ["command_plane", ...requiredCapabilities]
        .filter((capability, index, all) => all.indexOf(capability) === index)
        .filter((capability) => capabilities[capability] !== true);
      const missingScopes = ["commands:read", "events:write", "results:write", "artifacts:write"]
        .filter((scope) => !scopes.includes(scope));
      const reasons = [
        missingCapabilities.length ? `قابلیت غیرفعال: ${missingCapabilities.join("، ")}` : "",
        missingScopes.length ? `دسترسی کلید ناقص: ${missingScopes.join("، ")}` : "",
      ].filter(Boolean).join("؛ ");
      throw new AppError("Windows Agent آنلاین است، اما شرایط لازم این اجرا را ندارد.", {
        status: 409,
        code: "command_agent_incompatible",
        hint: reasons || "وضعیت capabilityها و scopeهای کلید را در تب کلید ایجنت بررسی کنید.",
      });
    }
    throw new AppError("Windows Agent آنلاین و آماده‌ی دریافت فرمان پیدا نشد.", {
      status: 409,
      code: "command_agent_offline",
      hint: "Windows Agent را اجرا کنید و پس از ثبت Heartbeat دوباره تلاش کنید.",
    });
  }
  return { keyId: match.agent_key_id, agentId: match.agent_id, agentName: match.agent_name };
}

export async function createManagedCommand(input: {
  type: string;
  title: string;
  payload: Record<string, unknown>;
  source?: string;
  promptId?: number | null;
  jobName?: string | null;
  requiresConfirmation?: boolean;
  autoStopOnAnomaly?: boolean;
  timeoutSeconds?: number;
  noProgressSeconds?: number;
  target?: { keyId: string; agentId: string; agentName?: string };
}): Promise<CommandView> {
  const target = input.target ?? (await findOnlineCommandAgent());
  const id = randomId("cmd");
  const type = text(input.type, "نوع فرمان", 80)!;
  const title = text(input.title, "عنوان فرمان", 160)!;
  const payload = objectJson({
    ...input.payload,
    monitoring: {
      textEvents: true,
      screenshots: "every_stage",
      screenshotStorage: "google_drive",
      reportArtifactMetadata: true,
    },
  }, "payload");
  const timeoutSeconds = Math.min(3600, Math.max(30, Number(input.timeoutSeconds ?? 600)));
  const noProgressSeconds = Math.min(timeoutSeconds, Math.max(30, Number(input.noProgressSeconds ?? 120)));
  const now = new Date().toISOString();
  await dbBatch([
    {
      sql: `INSERT INTO commands
        (id, agent_key_id, agent_id, type, title, payload, status, source, prompt_id, job_name,
         requires_confirmation, auto_stop_on_anomaly, timeout_seconds, no_progress_seconds,
         created_at, last_event_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        id,
        target.keyId,
        target.agentId,
        type,
        title,
        payload,
        input.source ?? "manager",
        input.promptId ?? null,
        input.jobName ?? null,
        input.requiresConfirmation === false ? 0 : 1,
        input.autoStopOnAnomaly === false ? 0 : 1,
        timeoutSeconds,
        noProgressSeconds,
        now,
        now,
      ],
    },
    {
      sql: `INSERT INTO command_events (command_id, seq, stage, level, message, data, created_at)
            VALUES (?, 0, 'queued', 'info', ?, '{}', ?)`,
      params: [id, `فرمان برای ${target.agentName ?? target.agentId} در D1 ثبت شد.`, now],
    },
    {
      sql: `INSERT INTO events (kind, title, detail, job_name, created_at)
            VALUES ('command_created', 'فرمان Windows Agent ساخته شد', ?, ?, ?)`,
      params: [`${title} · ${id}`, input.jobName ?? null, now],
    },
  ]);
  return mapCommand((await commandRow(id))!);
}

async function applyAutomaticStop(row: CommandRow): Promise<CommandRow> {
  if (!isActive(row.status) || row.auto_stop_on_anomaly !== 1 || row.cancel_requested_at) return row;
  const nowMs = Date.now();
  const startMs = Date.parse(row.started_at ?? row.claimed_at ?? row.created_at);
  const progressMs = Date.parse(row.last_event_at ?? row.created_at);
  let reason: string | null = null;
  if (row.status === "running" && nowMs - startMs > row.timeout_seconds * 1000) {
    reason = `توقف خودکار: زمان اجرا از ${row.timeout_seconds} ثانیه گذشت.`;
  } else if ((row.status === "claimed" || row.status === "waiting_confirmation" || row.status === "running") && nowMs - progressMs > row.no_progress_seconds * 1000) {
    reason = `توقف خودکار: ${row.no_progress_seconds} ثانیه هیچ پیشرفتی گزارش نشد.`;
  }
  if (!reason) return row;
  const now = new Date().toISOString();
  await dbBatch([
    { sql: "UPDATE commands SET cancel_requested_at = ?, cancel_reason = ? WHERE id = ? AND cancel_requested_at IS NULL", params: [now, reason, row.id] },
    {
      sql: `INSERT OR IGNORE INTO command_events (command_id, seq, stage, level, message, data, created_at)
            VALUES (?, (SELECT COALESCE(MAX(seq), 1000000) + 1 FROM command_events WHERE command_id = ? AND seq >= 1000000), 'auto_stop', 'fatal', ?, '{}', ?)`, 
      params: [row.id, row.id, reason, now],
    },
  ]);
  return (await commandRow(row.id))!;
}

export async function getCommandDetail(idValue: unknown, enforceOwnerKeyId?: string): Promise<CommandDetail> {
  const id = validCommandId(idValue);
  let row = await commandRow(id);
  if (!row || (enforceOwnerKeyId && row.agent_key_id !== enforceOwnerKeyId)) {
    throw new AppError("فرمان پیدا نشد.", { status: 404, code: "command_not_found" });
  }
  row = await applyAutomaticStop(row);
  const [eventRows, artifactRows] = await Promise.all([
    dbAll<CommandEventRow>("SELECT * FROM command_events WHERE command_id = ? ORDER BY created_at ASC, id ASC", [id]),
    dbAll<CommandArtifactRow>("SELECT * FROM command_artifacts WHERE command_id = ? ORDER BY created_at ASC", [id]),
  ]);
  const now = Date.now();
  const staleSeconds = isActive(row.status)
    ? Math.max(0, Math.floor((now - Date.parse(row.last_event_at ?? row.created_at)) / 1000))
    : null;
  const reasons: string[] = [];
  const interventionRequired = eventRows
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.message.startsWith("SERVICE_HUMAN_INTERVENTION_REQUIRED:"))
    .at(-1);
  const interventionCleared = eventRows
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.message.startsWith("SERVICE_HUMAN_INTERVENTION_CLEARED:"))
    .at(-1);
  if (interventionRequired && (!interventionCleared || interventionCleared.index < interventionRequired.index)) {
    reasons.push("اتوماسیون Arena برای مداخله انسانی در checkpoint امن متوقف شده است.");
  }
  if (eventRows.some((event) => event.level === "fatal")) reasons.push("رخداد بحرانی از Windows Agent گزارش شده است.");
  const managementApiPauses = eventRows.filter((event) => event.stage === "network_paused");
  if (managementApiPauses.length >= 3) {
    reasons.push(`مسیر ارتباط Windows Agent با API مدیریت در این اجرا ناپایدار بوده است (${managementApiPauses.length} وقفه کوتاه)؛ این وضعیت لزوماً قطع اینترنت عمومی نیست.`);
  }
  const operationalStages = new Set(["network_paused", "network_resumed", "cancel_requested"]);
  const unexpectedEvents = eventRows.filter(
    (event) => (event.level === "warning" || event.level === "error") && !operationalStages.has(event.stage),
  );
  if (unexpectedEvents.length) {
    for (const event of unexpectedEvents.slice(-3)) reasons.push(`${event.stage}: ${event.message}`);
  }
  if (row.cancel_requested_at) reasons.push(row.cancel_reason ?? "درخواست توقف ثبت شده است.");
  if (staleSeconds !== null && staleSeconds > row.no_progress_seconds) reasons.push("گزارش پیشرفت متوقف شده است.");
  return {
    command: mapCommand(row),
    events: eventRows.map(mapEvent),
    artifacts: artifactRows.map(mapArtifact),
    anomaly: {
      detected: reasons.length > 0,
      shouldStop: Boolean(row.cancel_requested_at),
      reasons,
      staleSeconds,
    },
    serverTime: new Date().toISOString(),
  };
}

export async function listCommands(limit = 30): Promise<CommandView[]> {
  const rows = await dbAll<CommandRow>("SELECT * FROM commands ORDER BY created_at DESC LIMIT ?", [Math.min(100, Math.max(1, limit))]);
  return rows.map(mapCommand);
}

export async function requestCommandCancellation(idValue: unknown, reasonValue?: unknown): Promise<CommandDetail> {
  const id = validCommandId(idValue);
  const row = await commandRow(id);
  if (!row) throw new AppError("فرمان پیدا نشد.", { status: 404, code: "command_not_found" });
  if (!isActive(row.status)) return getCommandDetail(id);
  const reason = text(reasonValue, "علت توقف", 300, false) ?? "توقف دستی از سایت ایجنت مدیریت";
  const now = new Date().toISOString();
  if (row.status === "pending") {
    const stopped = await dbRun(
      "UPDATE commands SET status = 'cancelled', cancel_requested_at = ?, cancel_reason = ?, completed_at = ?, last_event_at = ? WHERE id = ? AND status = 'pending'",
      [now, reason, now, now, id],
    );
    if (stopped.meta?.changes !== 0) {
      await dbRun(
        `INSERT OR IGNORE INTO command_events (command_id, seq, stage, level, message, data, created_at)
         VALUES (?, 1000001, 'cancelled', 'warning', ?, '{}', ?)`,
        [id, reason, now],
      );
      if (row.prompt_id) await dbRun("UPDATE prompts SET status = 'cancelled', error = ? WHERE id = ?", [reason, row.prompt_id]);
      return getCommandDetail(id);
    }
  }
  await dbBatch([
    { sql: "UPDATE commands SET cancel_requested_at = ?, cancel_reason = ?, last_event_at = ? WHERE id = ?", params: [now, reason, now, id] },
    {
      sql: `INSERT INTO command_events (command_id, seq, stage, level, message, data, created_at)
            VALUES (?, (SELECT COALESCE(MAX(seq), 1000000) + 1 FROM command_events WHERE command_id = ? AND seq >= 1000000), 'cancel_requested', 'warning', ?, '{}', ?)`, 
      params: [id, id, reason, now],
    },
  ]);
  return getCommandDetail(id);
}

export async function setCommandAutoStop(idValue: unknown, enabled: unknown): Promise<CommandDetail> {
  const id = validCommandId(idValue);
  if (typeof enabled !== "boolean") throw new AppError("وضعیت توقف خودکار معتبر نیست.", { status: 400, code: "auto_stop_invalid" });
  await dbRun("UPDATE commands SET auto_stop_on_anomaly = ? WHERE id = ?", [enabled ? 1 : 0, id]);
  return getCommandDetail(id);
}

export async function claimNextCommand(key: AuthenticatedAgentKey): Promise<{ command: CommandView | null; serverTime: string; pollAfterSeconds: number }> {
  const row = await dbFirst<CommandRow>(
    `SELECT * FROM commands WHERE agent_key_id = ? AND status = 'pending' AND cancel_requested_at IS NULL
     ORDER BY created_at ASC LIMIT 1`,
    [key.id],
  );
  const now = new Date().toISOString();
  if (!row) return { command: null, serverTime: now, pollAfterSeconds: 3 };
  const claimed = await dbRun(
    "UPDATE commands SET status = 'claimed', claimed_at = ?, last_event_at = ? WHERE id = ? AND status = 'pending' AND cancel_requested_at IS NULL",
    [now, now, row.id],
  );
  if (claimed.meta?.changes === 0) return claimNextCommand(key);
  await dbRun(
    `INSERT OR IGNORE INTO command_events (command_id, seq, stage, level, message, data, created_at)
     VALUES (?, 1, 'claimed', 'info', 'فرمان توسط Windows Agent دریافت شد.', '{}', ?)`,
    [row.id, now],
  );
  return { command: mapCommand((await commandRow(row.id))!), serverTime: now, pollAfterSeconds: 3 };
}

const TRANSITIONS: Record<CommandStatus, CommandStatus[]> = {
  pending: ["claimed", "cancelled"],
  claimed: ["waiting_confirmation", "running", "failed", "cancelled", "rejected"],
  waiting_confirmation: ["running", "failed", "cancelled", "rejected"],
  running: ["succeeded", "failed", "cancelled", "timed_out"],
  succeeded: [],
  failed: [],
  cancelled: [],
  timed_out: [],
  rejected: [],
};

export async function updateCommandState(
  key: AuthenticatedAgentKey,
  idValue: unknown,
  input: { status?: unknown; error?: unknown; result?: unknown; message?: unknown; stage?: unknown; seq?: unknown },
): Promise<CommandDetail> {
  const id = validCommandId(idValue);
  const row = await commandRow(id);
  if (!row || row.agent_key_id !== key.id) throw new AppError("فرمان پیدا نشد.", { status: 404, code: "command_not_found" });
  const status = text(input.status, "وضعیت فرمان", 40)! as CommandStatus;
  if (!Object.prototype.hasOwnProperty.call(TRANSITIONS, status) || !TRANSITIONS[row.status].includes(status)) {
    if (status === row.status) return getCommandDetail(id, key.id);
    throw new AppError(`گذار وضعیت ${row.status} → ${status} مجاز نیست.`, { status: 409, code: "command_transition_invalid" });
  }
  const error = text(input.error, "خطای فرمان", 4000, false);
  const result = input.result === undefined ? null : objectJson(input.result, "نتیجه فرمان", 64_000);
  const message = text(input.message, "پیام وضعیت", 1000, false) ?? `وضعیت فرمان به ${status} تغییر کرد.`;
  const stage = text(input.stage, "مرحله", 80, false) ?? status;
  const now = new Date().toISOString();
  const final = (COMMAND_FINAL_STATUSES as readonly string[]).includes(status);
  const startedAt = status === "running" && !row.started_at ? now : row.started_at;
  const completedAt = final ? now : null;
  const seq = Number.isInteger(input.seq) && Number(input.seq) >= 0 ? Number(input.seq) : null;
  await dbBatch([
    {
      sql: `UPDATE commands SET status = ?, started_at = ?, completed_at = ?, last_event_at = ?, error = ?, result = ? WHERE id = ?`,
      params: [status, startedAt, completedAt, now, error, result, id],
    },
    {
      sql: `INSERT OR IGNORE INTO command_events (command_id, seq, stage, level, message, data, created_at)
            VALUES (?, COALESCE(?, (SELECT COALESCE(MAX(seq), 1) + 1 FROM command_events WHERE command_id = ? AND seq < 1000000)), ?, ?, ?, '{}', ?)`,
      params: [id, seq, id, stage, status === "failed" || status === "timed_out" ? "error" : "info", message, now],
    },
  ]);
  if (row.prompt_id) {
    await dbRun("UPDATE prompts SET status = ?, error = ? WHERE id = ?", [status, error, row.prompt_id]);
  }
  return getCommandDetail(id, key.id);
}

export async function appendCommandEvent(
  key: AuthenticatedAgentKey,
  idValue: unknown,
  input: { seq?: unknown; stage?: unknown; level?: unknown; message?: unknown; data?: unknown; occurredAt?: unknown },
): Promise<{ ok: true; cancelRequested: boolean; autoStopTriggered: boolean }> {
  const id = validCommandId(idValue);
  const row = await commandRow(id);
  if (!row || row.agent_key_id !== key.id) throw new AppError("فرمان پیدا نشد.", { status: 404, code: "command_not_found" });
  if (!isActive(row.status)) return { ok: true, cancelRequested: Boolean(row.cancel_requested_at), autoStopTriggered: false };
  const seq = Number(input.seq);
  if (!Number.isInteger(seq) || seq < 0 || seq > 1_000_000) throw new AppError("شماره ترتیب رخداد معتبر نیست.", { status: 400, code: "command_event_seq_invalid" });
  const stage = text(input.stage, "مرحله", 80)!;
  const message = text(input.message, "پیام رخداد", 2000)!;
  const levelValue = text(input.level, "سطح رخداد", 20, false) ?? "info";
  if (!["debug", "info", "warning", "error", "fatal"].includes(levelValue)) {
    throw new AppError("سطح رخداد معتبر نیست.", { status: 400, code: "command_event_level_invalid" });
  }
  const parsed = parseObject(objectJson(input.data, "داده رخداد", 24_000));
  const reportedOccurredAt = input.occurredAt === undefined || input.occurredAt === null
    ? null
    : occurredAt(input.occurredAt);
  const data = objectJson(
    reportedOccurredAt ? { ...parsed, reportedOccurredAt } : parsed,
    "داده رخداد",
    24_000,
  );
  const autoTrigger = row.auto_stop_on_anomaly === 1 && (levelValue === "fatal" || parsed.autoStop === true);
  // ترتیب و زمان timeline بر اساس ساعت قابل‌اعتماد Cloudflare ثبت می‌شود؛
  // زمان گزارش‌شده‌ی ویندوز برای عیب‌یابی داخل data باقی می‌ماند.
  const now = new Date().toISOString();
  const queries = [
    {
      sql: `INSERT INTO command_events (command_id, seq, stage, level, message, data, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(command_id, seq) DO UPDATE SET
              stage = excluded.stage, level = excluded.level, message = excluded.message,
              data = excluded.data, created_at = excluded.created_at`,
      params: [id, seq, stage, levelValue, message, data, now],
    },
    { sql: "UPDATE commands SET last_event_at = ? WHERE id = ?", params: [now, id] },
  ];
  const artifactMarker = serviceArtifactMarker(message);
  if (artifactMarker) {
    queries.push({
      sql: `INSERT INTO command_artifacts
        (id, command_id, kind, stage, name, local_path, drive_file_id, drive_url, mime_type, size, created_at)
        VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL, ?)
        ON CONFLICT(id) DO UPDATE SET
          kind = excluded.kind, stage = excluded.stage, name = excluded.name,
          local_path = excluded.local_path, mime_type = excluded.mime_type`,
      params: [
        artifactMarker.artifactId,
        id,
        artifactMarker.kind,
        artifactMarker.stage ?? "arena-step",
        artifactMarker.name,
        artifactMarker.localPath,
        artifactMarker.mimeType ?? "application/octet-stream",
        now,
      ],
    });
  }
  if (autoTrigger && !row.cancel_requested_at) {
    queries.push({
      sql: "UPDATE commands SET cancel_requested_at = ?, cancel_reason = ? WHERE id = ?",
      params: [now, `توقف خودکار پس از رخداد بحرانی: ${message}`, id],
    });
  }
  await dbBatch(queries);
  return { ok: true, cancelRequested: Boolean(row.cancel_requested_at) || autoTrigger, autoStopTriggered: autoTrigger };
}

export async function appendCommandArtifact(
  key: AuthenticatedAgentKey,
  idValue: unknown,
  input: {
    artifactId?: unknown;
    kind?: unknown;
    stage?: unknown;
    name?: unknown;
    localPath?: unknown;
    driveFileId?: unknown;
    driveUrl?: unknown;
    mimeType?: unknown;
    size?: unknown;
    occurredAt?: unknown;
  },
): Promise<{ artifact: CommandArtifactView; cancelRequested: boolean }> {
  const id = validCommandId(idValue);
  const row = await commandRow(id);
  if (!row || row.agent_key_id !== key.id) throw new AppError("فرمان پیدا نشد.", { status: 404, code: "command_not_found" });
  const artifactId = typeof input.artifactId === "string" && /^art_[A-Za-z0-9_-]{8,50}$/.test(input.artifactId)
    ? input.artifactId
    : randomId("art", 10);
  const kind = text(input.kind, "نوع artifact", 40)!;
  const name = text(input.name, "نام فایل", 260)!;
  const stage = text(input.stage, "مرحله artifact", 80, false);
  const localPath = text(input.localPath, "مسیر محلی", 1000, false);
  const driveFileId = text(input.driveFileId, "شناسه Drive", 200, false);
  let driveUrl = text(input.driveUrl, "آدرس Drive", 1000, false);
  if (driveUrl && !/^https:\/\/drive\.google\.com\//i.test(driveUrl)) {
    throw new AppError("آدرس artifact باید متعلق به drive.google.com باشد.", { status: 400, code: "artifact_url_invalid" });
  }
  if (!driveUrl && driveFileId) driveUrl = `https://drive.google.com/open?id=${encodeURIComponent(driveFileId)}`;
  const mimeType = text(input.mimeType, "نوع MIME", 120, false);
  const size = input.size === undefined || input.size === null ? null : Number(input.size);
  if (size !== null && (!Number.isFinite(size) || size < 0 || size > 2_000_000_000)) {
    throw new AppError("اندازه artifact معتبر نیست.", { status: 400, code: "artifact_size_invalid" });
  }
  if (input.occurredAt !== undefined && input.occurredAt !== null) occurredAt(input.occurredAt);
  // زمان سرور برای ترتیب قطعی artifactها؛ timestamp ویندوز در نام فایل حفظ می‌شود.
  const now = new Date().toISOString();
  await dbBatch([
    {
      sql: `INSERT INTO command_artifacts
        (id, command_id, kind, stage, name, local_path, drive_file_id, drive_url, mime_type, size, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          stage = excluded.stage, name = excluded.name, local_path = excluded.local_path,
          drive_file_id = excluded.drive_file_id, drive_url = excluded.drive_url,
          mime_type = excluded.mime_type, size = excluded.size`,
      params: [artifactId, id, kind, stage, name, localPath, driveFileId, driveUrl, mimeType, size, now],
    },
    { sql: "UPDATE commands SET last_event_at = ? WHERE id = ?", params: [now, id] },
  ]);
  const artifact = await dbFirst<CommandArtifactRow>("SELECT * FROM command_artifacts WHERE id = ?", [artifactId]);
  return { artifact: mapArtifact(artifact!), cancelRequested: Boolean(row.cancel_requested_at) };
}

export async function agentCommandControl(key: AuthenticatedAgentKey, idValue: unknown) {
  const detail = await getCommandDetail(idValue, key.id);
  return {
    commandId: detail.command.id,
    status: detail.command.status,
    cancelRequested: Boolean(detail.command.cancelRequestedAt),
    cancelReason: detail.command.cancelReason,
    autoStopOnAnomaly: detail.command.autoStopOnAnomaly,
    timeoutSeconds: detail.command.timeoutSeconds,
    noProgressSeconds: detail.command.noProgressSeconds,
    serverTime: detail.serverTime,
  };
}
