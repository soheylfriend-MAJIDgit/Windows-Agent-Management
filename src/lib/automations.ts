import { bytesToBase64Url, sha256Hex } from "./crypto";
import { dbAll, dbBatch, dbFirst, dbRun } from "./db";
import { AppError } from "./errors";
import { lintPython } from "./lint";
import { createManagedCommand, findOnlineCommandAgent } from "./commands";

interface AutomationRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  target: "windows" | "management" | "both";
  active_version_id: string | null;
  enabled: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  version_id: string | null;
  version: number | null;
  source_sha256: string | null;
  version_status: string | null;
  change_summary: string | null;
  version_created_at: string | null;
}

interface VersionRow {
  id: string;
  automation_id: string;
  version: number;
  source_code: string;
  source_sha256: string;
  status: "draft" | "review" | "approved" | "active" | "rejected" | "retired";
  change_summary: string | null;
  created_by: string;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
}

export interface AutomationView {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  target: "windows" | "management" | "both";
  enabled: boolean;
  activeVersionId: string | null;
  activeVersion: number | null;
  sourceSha256: string | null;
  versionStatus: string | null;
  changeSummary: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  versionCreatedAt: string | null;
}

export interface AutomationVersionView {
  id: string;
  automationId: string;
  version: number;
  sourceCode?: string;
  sourceSha256: string;
  status: VersionRow["status"];
  changeSummary: string | null;
  createdBy: string;
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
}

function id(prefix: string): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `${prefix}_${bytesToBase64Url(bytes)}`;
}

function cleanText(value: unknown, label: string, max: number, required = true): string | null {
  if (typeof value !== "string") {
    if (!required && (value === undefined || value === null)) return null;
    throw new AppError(`${label} معتبر نیست.`, { status: 400, code: "automation_field_invalid" });
  }
  const cleaned = value.trim();
  if ((required && !cleaned) || cleaned.length > max) {
    throw new AppError(`${label} معتبر نیست یا بیش از ${max} نویسه دارد.`, { status: 400, code: "automation_field_invalid" });
  }
  return cleaned || null;
}

export function normalizeAutomationSlug(value: unknown): string {
  const raw = cleanText(value, "شناسه اتوماسیون", 100)!;
  const slug = raw.toLowerCase().replace(/\.py$/i, "").replace(/^job_/, "").replace(/[^a-z0-9_]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  if (!slug || slug.length > 72) throw new AppError("شناسه اتوماسیون باید با حروف لاتین، عدد و زیرخط باشد.", { status: 400, code: "automation_slug_invalid" });
  return slug;
}

export function automationJobName(slug: string): string {
  return `job_${slug}.py`;
}

function validateSource(value: unknown, jobName: string): string {
  if (typeof value !== "string") throw new AppError("متن کد Python لازم است.", { status: 400, code: "automation_source_required" });
  const source = value.replace(/\r\n/g, "\n");
  const bytes = new TextEncoder().encode(source).length;
  if (bytes < 20 || bytes > 256_000) {
    throw new AppError("اندازه کد اتوماسیون باید بین ۲۰ بایت و ۲۵۶ کیلوبایت باشد.", { status: 413, code: "automation_source_size" });
  }
  const lint = lintPython(source, { name: jobName, strict: false });
  if (!lint.ok) {
    throw new AppError("کد Python از بررسی اولیه عبور نکرد.", {
      status: 422,
      code: "automation_lint_failed",
      hint: "خطاهای syntax و قواعد پایه را اصلاح کنید.",
      details: lint.errors,
    });
  }
  return source;
}

function mapAutomation(row: AutomationRow): AutomationView {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    target: row.target,
    enabled: row.enabled === 1,
    activeVersionId: row.active_version_id,
    activeVersion: row.version,
    sourceSha256: row.source_sha256,
    versionStatus: row.version_status,
    changeSummary: row.change_summary,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    versionCreatedAt: row.version_created_at,
  };
}

function mapVersion(row: VersionRow, includeSource = false): AutomationVersionView {
  return {
    id: row.id,
    automationId: row.automation_id,
    version: row.version,
    ...(includeSource ? { sourceCode: row.source_code } : {}),
    sourceSha256: row.source_sha256,
    status: row.status,
    changeSummary: row.change_summary,
    createdBy: row.created_by,
    createdAt: row.created_at,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
  };
}

const SELECT_AUTOMATIONS = `
  SELECT a.*, v.id AS version_id, v.version, v.source_sha256,
         v.status AS version_status, v.change_summary, v.created_at AS version_created_at
  FROM automations a
  LEFT JOIN automation_versions v ON v.id = a.active_version_id
`;

export async function listAutomations(): Promise<AutomationView[]> {
  const rows = await dbAll<AutomationRow>(`${SELECT_AUTOMATIONS} ORDER BY a.updated_at DESC`);
  return rows.map(mapAutomation);
}

export async function getAutomation(identifier: unknown, includeSource = true): Promise<{ automation: AutomationView; activeVersion: AutomationVersionView | null; versions: AutomationVersionView[] }> {
  if (typeof identifier !== "string" || identifier.length > 100) throw new AppError("شناسه اتوماسیون معتبر نیست.", { status: 400, code: "automation_id_invalid" });
  const row = await dbFirst<AutomationRow>(`${SELECT_AUTOMATIONS} WHERE a.id = ? OR a.slug = ? LIMIT 1`, [identifier, identifier]);
  if (!row) throw new AppError("کد اتوماسیون پیدا نشد.", { status: 404, code: "automation_not_found" });
  const versions = await dbAll<VersionRow>("SELECT * FROM automation_versions WHERE automation_id = ? ORDER BY version DESC", [row.id]);
  const active = versions.find((version) => version.id === row.active_version_id) ?? null;
  return {
    automation: mapAutomation(row),
    activeVersion: active ? mapVersion(active, includeSource) : null,
    versions: versions.map((version) => mapVersion(version, false)),
  };
}

export async function saveAutomationVersion(input: {
  automationId?: unknown;
  slug?: unknown;
  name?: unknown;
  description?: unknown;
  target?: unknown;
  sourceCode?: unknown;
  changeSummary?: unknown;
  actor: string;
  activate?: boolean;
}): Promise<{ automation: AutomationView; version: AutomationVersionView; created: boolean }> {
  const now = new Date().toISOString();
  let automationId = typeof input.automationId === "string" ? input.automationId : null;
  let current: AutomationRow | null = null;
  if (automationId) current = await dbFirst<AutomationRow>(`${SELECT_AUTOMATIONS} WHERE a.id = ? LIMIT 1`, [automationId]);
  const slug = current?.slug ?? normalizeAutomationSlug(input.slug);
  if (!current) current = await dbFirst<AutomationRow>(`${SELECT_AUTOMATIONS} WHERE a.slug = ? LIMIT 1`, [slug]);
  const name = cleanText(input.name ?? current?.name ?? slug, "نام اتوماسیون", 120)!;
  const description = cleanText(input.description ?? current?.description, "توضیح", 1000, false);
  const target = input.target ?? current?.target ?? "windows";
  if (target !== "windows" && target !== "management" && target !== "both") {
    throw new AppError("مقصد اتوماسیون معتبر نیست.", { status: 400, code: "automation_target_invalid" });
  }
  const jobName = automationJobName(slug);
  const source = validateSource(input.sourceCode, jobName);
  const hash = await sha256Hex(source);
  const summary = cleanText(input.changeSummary, "شرح تغییر", 500, false);
  const created = !current;
  automationId = current?.id ?? id("auto");
  const latest = await dbFirst<{ version: number }>("SELECT MAX(version) AS version FROM automation_versions WHERE automation_id = ?", [automationId]);
  const versionNumber = Number(latest?.version ?? 0) + 1;
  const versionId = id("av");
  const active = input.activate !== false;

  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  if (created) {
    queries.push({
      sql: `INSERT INTO automations (id, slug, name, description, target, active_version_id, enabled, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      params: [automationId, slug, name, description, target, active ? versionId : null, input.actor, now, now],
    });
  } else {
    queries.push({
      sql: `UPDATE automations SET name = ?, description = ?, target = ?, active_version_id = CASE WHEN ? = 1 THEN ? ELSE active_version_id END, updated_at = ? WHERE id = ?`,
      params: [name, description, target, active ? 1 : 0, versionId, now, automationId],
    });
  }
  queries.push({
    sql: `INSERT INTO automation_versions
          (id, automation_id, version, source_code, source_sha256, status, change_summary, created_by, created_at, approved_by, approved_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [versionId, automationId, versionNumber, source, hash, active ? "active" : "draft", summary, input.actor, now, active ? input.actor : null, active ? now : null],
  });
  if (active && current?.active_version_id) {
    queries.push({ sql: "UPDATE automation_versions SET status = 'retired' WHERE id = ? AND status = 'active'", params: [current.active_version_id] });
  }
  queries.push({
    sql: `INSERT INTO events (kind, title, detail, job_name, created_at) VALUES ('automation_version', ?, ?, ?, ?)`,
    params: [`نسخه ${versionNumber} اتوماسیون ${name}`, `${input.actor} · ${hash.slice(0, 12)}`, jobName, now],
  });
  await dbBatch(queries);
  const detail = await getAutomation(automationId, true);
  const insertedVersion = await dbFirst<VersionRow>("SELECT * FROM automation_versions WHERE id = ?", [versionId]);
  return { automation: detail.automation, version: mapVersion(insertedVersion!, true), created };
}

export async function setAutomationEnabled(identifier: unknown, enabled: unknown): Promise<AutomationView> {
  if (typeof enabled !== "boolean") throw new AppError("وضعیت اتوماسیون معتبر نیست.", { status: 400, code: "automation_enabled_invalid" });
  const detail = await getAutomation(identifier, false);
  await dbRun("UPDATE automations SET enabled = ?, updated_at = ? WHERE id = ?", [enabled ? 1 : 0, new Date().toISOString(), detail.automation.id]);
  return (await getAutomation(detail.automation.id, false)).automation;
}

export async function activateAutomationVersion(identifier: unknown, versionIdValue: unknown, actor: string): Promise<AutomationView> {
  const detail = await getAutomation(identifier, false);
  if (typeof versionIdValue !== "string") throw new AppError("شناسه نسخه معتبر نیست.", { status: 400, code: "automation_version_invalid" });
  const version = await dbFirst<VersionRow>("SELECT * FROM automation_versions WHERE id = ? AND automation_id = ?", [versionIdValue, detail.automation.id]);
  if (!version) throw new AppError("نسخه اتوماسیون پیدا نشد.", { status: 404, code: "automation_version_not_found" });
  const now = new Date().toISOString();
  await dbBatch([
    { sql: "UPDATE automation_versions SET status = 'retired' WHERE automation_id = ? AND status = 'active'", params: [detail.automation.id] },
    { sql: "UPDATE automation_versions SET status = 'active', approved_by = ?, approved_at = ? WHERE id = ?", params: [actor, now, version.id] },
    { sql: "UPDATE automations SET active_version_id = ?, updated_at = ? WHERE id = ?", params: [version.id, now, detail.automation.id] },
  ]);
  return (await getAutomation(detail.automation.id, false)).automation;
}

export async function rerunAutomation(identifier: unknown, actor: string, dryRun = false) {
  const detail = await getAutomation(identifier, true);
  if (!detail.activeVersion?.sourceCode) throw new AppError("نسخه فعال اتوماسیون وجود ندارد.", { status: 409, code: "automation_version_missing" });
  const marker = `# rerun-d1: ${new Date().toISOString()} · ${id("req")}`;
  const sourceCode = `${detail.activeVersion.sourceCode.replace(/\s+$/, "")}\n\n${marker}\n`;
  if (dryRun) return { dryRun: true, marker, content: sourceCode, automation: detail.automation, commandId: null };
  const saved = await saveAutomationVersion({
    automationId: detail.automation.id,
    name: detail.automation.name,
    description: detail.automation.description,
    target: detail.automation.target,
    sourceCode,
    changeSummary: "درخواست اجرای دوباره با تغییر واقعی نسخه D1",
    actor,
    activate: true,
  });
  const run = await requestAutomationRun(saved.automation.id, actor);
  return { dryRun: false, marker, automation: saved.automation, version: saved.version, commandId: run.commandId };
}

export async function requestAutomationRun(
  identifier: unknown,
  actor: string,
  targetOverride?: { keyId: string; agentId: string; agentName?: string },
  context?: { promptId?: number; source?: string; title?: string },
): Promise<{ commandId: string; automation: AutomationView; version: AutomationVersionView }> {
  const detail = await getAutomation(identifier, true);
  if (!detail.automation.enabled) throw new AppError("این اتوماسیون غیرفعال است.", { status: 409, code: "automation_disabled" });
  if (!detail.activeVersion?.sourceCode) throw new AppError("نسخه فعال برای اجرا وجود ندارد.", { status: 409, code: "automation_version_missing" });
  if (detail.automation.target === "management") {
    throw new AppError("اتوماسیون مقصد مدیریت باید از APIهای عملیاتی مدیریت استفاده کند و روی ویندوز اجرا نمی‌شود.", { status: 409, code: "automation_target_management" });
  }
  const target = targetOverride ?? await findOnlineCommandAgent("d1_automations");
  const command = await createManagedCommand({
    type: "run_automation",
    title: context?.title ?? `اجرای اتوماسیون ${detail.automation.name}`,
    source: context?.source ?? "automation_catalog",
    promptId: context?.promptId ?? null,
    jobName: automationJobName(detail.automation.slug),
    target,
    requiresConfirmation: true,
    autoStopOnAnomaly: true,
    timeoutSeconds: 900,
    noProgressSeconds: 120,
    payload: {
      automationId: detail.automation.id,
      versionId: detail.activeVersion.id,
      version: detail.activeVersion.version,
      jobName: automationJobName(detail.automation.slug),
      sourceSha256: detail.activeVersion.sourceSha256,
      sourceEndpoint: `/api/agent/automations/${detail.automation.id}/versions/${detail.activeVersion.id}`,
      executionPolicy: "respect_windows_agent_mode",
      sourceOfTruth: "cloudflare_d1",
    },
  });
  const now = new Date().toISOString();
  await dbRun(
    "INSERT INTO automation_runs (id, automation_id, version_id, command_id, requested_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [id("arun"), detail.automation.id, detail.activeVersion.id, command.id, actor, now],
  );
  return { commandId: command.id, automation: detail.automation, version: detail.activeVersion };
}

export async function automationSourceForAgent(automationId: unknown, versionId: unknown): Promise<{ automationId: string; versionId: string; version: number; jobName: string; sourceCode: string; sourceSha256: string; createdAt: string }> {
  if (typeof automationId !== "string" || typeof versionId !== "string") throw new AppError("شناسه اتوماسیون یا نسخه معتبر نیست.", { status: 400, code: "automation_id_invalid" });
  const automation = await dbFirst<{ id: string; slug: string; enabled: number }>("SELECT id, slug, enabled FROM automations WHERE id = ?", [automationId]);
  const version = await dbFirst<VersionRow>("SELECT * FROM automation_versions WHERE id = ? AND automation_id = ?", [versionId, automationId]);
  if (!automation || !version) throw new AppError("نسخه اتوماسیون پیدا نشد.", { status: 404, code: "automation_version_not_found" });
  if (automation.enabled !== 1) throw new AppError("اتوماسیون غیرفعال است.", { status: 409, code: "automation_disabled" });
  return {
    automationId,
    versionId,
    version: version.version,
    jobName: automationJobName(automation.slug),
    sourceCode: version.source_code,
    sourceSha256: version.source_sha256,
    createdAt: version.created_at,
  };
}
