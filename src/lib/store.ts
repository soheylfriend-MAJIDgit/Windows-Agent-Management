import { dbAll, dbBatch, dbCounts, dbFirst, dbRun } from "./db";
import { safeJsonParse } from "./format";
import type {
  ErrorLog,
  EventRecord,
  Issue,
  Job,
  JobStatus,
  JobView,
  PromptMode,
  PromptRecord,
  Run,
  RunStatus,
  Stats,
} from "./types";

type Row = Record<string, unknown>;

function s(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value);
}
function nullableS(value: unknown): string | null {
  return value == null ? null : String(value);
}
function n(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}
function nullableN(value: unknown): number | null {
  if (value == null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function mapJob(row: Row): Job {
  return {
    name: s(row.name),
    size: n(row.size),
    lines: n(row.lines),
    docstring: s(row.docstring),
    contentSha: s(row.content_sha),
    commitDate: nullableS(row.commit_date),
    commitSha: nullableS(row.commit_sha),
    commitMessage: nullableS(row.commit_message),
    archiveUpdatedAt: nullableS(row.archive_updated_at),
    firstSeenAt: s(row.first_seen_at),
    lastSeenAt: s(row.last_seen_at),
    changedAt: nullableS(row.changed_at),
    present: n(row.present, 1) === 1,
    issues: safeJsonParse<Issue[]>(s(row.issues), []),
  };
}

function mapRun(row: Row): Run {
  return {
    id: n(row.id),
    jobName: s(row.job_name),
    status: s(row.status, "pending") as RunStatus,
    exitCode: nullableS(row.exit_code),
    startedAt: nullableS(row.started_at),
    startedJalali: nullableS(row.started_jalali),
    durationSeconds: nullableN(row.duration_s),
    output: s(row.output),
    errors: s(row.errors),
    source: s(row.source, "drive"),
    sourceFile: nullableS(row.source_file),
    createdAt: s(row.created_at),
  };
}

function mapError(row: Row): ErrorLog {
  return {
    id: n(row.id),
    fileName: s(row.file_name),
    occurredAt: nullableS(row.occurred_at),
    occurredJalali: nullableS(row.occurred_jalali),
    subject: s(row.subject),
    appVersion: nullableS(row.app_version),
    detail: s(row.detail),
    createdAt: s(row.created_at),
  };
}

function mapPrompt(row: Row): PromptRecord {
  return {
    id: n(row.id),
    jobName: s(row.job_name),
    mode: s(row.mode, "new") as PromptMode,
    prompt: s(row.prompt),
    code: nullableS(row.code),
    commitSha: nullableS(row.commit_sha),
    commitUrl: nullableS(row.commit_url),
    status: s(row.status, "pending"),
    error: nullableS(row.error),
    issues: safeJsonParse<Issue[]>(s(row.issues), []),
    createdAt: s(row.created_at),
  };
}

function mapEvent(row: Row): EventRecord {
  return {
    id: n(row.id),
    kind: s(row.kind),
    title: s(row.title),
    detail: nullableS(row.detail),
    jobName: nullableS(row.job_name),
    url: nullableS(row.url),
    createdAt: s(row.created_at),
  };
}

export interface ParsedJobFile {
  name: string;
  size: number;
  lines: number;
  docstring: string;
  content: string;
  sha: string;
  archiveUpdatedAt: string | null;
  issues: Issue[];
}

/** ذخیره‌ی اسنپ‌شات فایل‌های مخزن + علامت‌گذاری فایل‌های حذف‌شده. */
export async function saveJobsSnapshot(files: ParsedJobFile[]): Promise<void> {
  const existing = await dbAll<Row>("SELECT name, content_sha, changed_at FROM jobs");
  const prev = new Map(existing.map((r) => [s(r.name), r]));
  const now = new Date().toISOString();

  const queries = files.map((file) => {
    const before = prev.get(file.name);
    const changedAt = before ? (s(before.content_sha) !== file.sha ? now : nullableS(before.changed_at)) : null;
    return {
      sql: `INSERT INTO jobs (
              name, size, lines, docstring, content, content_sha, archive_updated_at,
              first_seen_at, last_seen_at, changed_at, present, issues, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(name) DO UPDATE SET
              size = excluded.size,
              lines = excluded.lines,
              docstring = excluded.docstring,
              content = excluded.content,
              content_sha = excluded.content_sha,
              archive_updated_at = excluded.archive_updated_at,
              last_seen_at = excluded.last_seen_at,
              changed_at = excluded.changed_at,
              present = 1,
              issues = excluded.issues,
              updated_at = excluded.updated_at`,
      params: [
        file.name,
        file.size,
        file.lines,
        file.docstring,
        file.content,
        file.sha,
        file.archiveUpdatedAt,
        now,
        now,
        changedAt,
        JSON.stringify(file.issues),
        now,
      ],
    };
  });

  await dbBatch(queries);
  await dbRun("UPDATE jobs SET present = 0, updated_at = ? WHERE last_seen_at < ?", [now, now]);
}

export async function listJobRows(): Promise<Job[]> {
  const rows = await dbAll<Row>(
    `SELECT name, size, lines, docstring, content_sha, commit_date, commit_sha, commit_message,
            archive_updated_at, first_seen_at, last_seen_at, changed_at, present, issues
     FROM jobs ORDER BY lower(name)`,
  );
  return rows.map(mapJob);
}

export async function getJobContent(name: string): Promise<{ job: Job; content: string } | null> {
  const row = await dbFirst<Row>("SELECT * FROM jobs WHERE name = ?", [name]);
  if (!row) return null;
  return { job: mapJob(row), content: s(row.content) };
}

export async function setJobChanged(name: string): Promise<void> {
  const now = new Date().toISOString();
  await dbRun("UPDATE jobs SET changed_at = ?, updated_at = ? WHERE name = ?", [now, now, name]);
}

export async function updateJobCommit(
  name: string,
  info: { date: string | null; sha: string | null; message: string | null },
): Promise<void> {
  await dbRun(
    "UPDATE jobs SET commit_date = ?, commit_sha = ?, commit_message = ?, commit_checked_at = ? WHERE name = ?",
    [info.date, info.sha, info.message, new Date().toISOString(), name],
  );
}

export async function jobsMissingCommitInfo(limit: number): Promise<string[]> {
  const rows = await dbAll<Row>(
    `SELECT name FROM jobs
     WHERE present = 1 AND (commit_checked_at IS NULL OR commit_checked_at < ?)
     ORDER BY lower(name) LIMIT ?`,
    [new Date(Date.now() - 10 * 60_000).toISOString(), limit],
  );
  return rows.map((r) => s(r.name));
}

// -------------------------------------------------------------- اجراها ---

export async function saveRun(run: {
  jobName: string;
  status: RunStatus;
  exitCode: string | null;
  startedAt: string;
  startedJalali: string | null;
  durationSeconds: number | null;
  output: string;
  errors: string;
  source: string;
  sourceFile: string | null;
  sourceId?: string | null;
  raw?: string | null;
}): Promise<void> {
  await dbRun(
    `INSERT INTO runs (
       job_name, status, exit_code, started_at, started_jalali, duration_s,
       output, errors, source, source_file, source_id, raw, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(job_name, started_at) DO UPDATE SET
       status = excluded.status,
       exit_code = excluded.exit_code,
       started_jalali = excluded.started_jalali,
       duration_s = excluded.duration_s,
       output = excluded.output,
       errors = excluded.errors,
       source = excluded.source,
       source_file = excluded.source_file,
       source_id = excluded.source_id,
       raw = excluded.raw,
       created_at = excluded.created_at`,
    [
      run.jobName,
      run.status,
      run.exitCode,
      run.startedAt,
      run.startedJalali,
      run.durationSeconds,
      run.output,
      run.errors,
      run.source,
      run.sourceFile,
      run.sourceId ?? null,
      run.raw ?? null,
      new Date().toISOString(),
    ],
  );
}

export async function latestRunsByJob(): Promise<Map<string, Run>> {
  // ملاک، زمان شروع اجراست نه ترتیب درج؛ فایل قدیمی که دیرتر همگام شده
  // نباید جای اجرای تازه‌تر را بگیرد.
  const rows = await dbAll<Row>(
    `SELECT r.* FROM runs r
     WHERE r.id = (
       SELECT r2.id FROM runs r2
       WHERE r2.job_name = r.job_name
       ORDER BY r2.started_at DESC, r2.id DESC
       LIMIT 1
     )`,
  );
  return new Map(rows.map((r) => [s(r.job_name), mapRun(r)]));
}

export interface RunFilters {
  q?: string;
  status?: string;
  from?: string;
  to?: string;
  limit?: number;
  jobName?: string;
}

export async function listRuns(filters: RunFilters = {}): Promise<Run[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.jobName) {
    where.push("job_name = ?");
    params.push(filters.jobName);
  }
  if (filters.q) {
    where.push("(lower(job_name) LIKE ? OR lower(output) LIKE ? OR lower(errors) LIKE ?)");
    const like = `%${filters.q.toLowerCase()}%`;
    params.push(like, like, like);
  }
  if (filters.status && filters.status !== "all") {
    where.push("status = ?");
    params.push(filters.status);
  }
  if (filters.from) {
    where.push("started_at >= ?");
    params.push(filters.from);
  }
  if (filters.to) {
    where.push("started_at < ?");
    params.push(filters.to);
  }
  const limit = Math.min(Math.max(filters.limit ?? 60, 1), 200);
  const rows = await dbAll<Row>(
    `SELECT * FROM runs ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY started_at DESC, id DESC LIMIT ?`,
    [...params, limit],
  );
  return rows.map(mapRun);
}

export async function countRuns(filters: RunFilters = {}): Promise<number> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.q) {
    where.push("(lower(job_name) LIKE ? OR lower(output) LIKE ? OR lower(errors) LIKE ?)");
    const like = `%${filters.q.toLowerCase()}%`;
    params.push(like, like, like);
  }
  if (filters.status && filters.status !== "all") {
    where.push("status = ?");
    params.push(filters.status);
  }
  if (filters.from) {
    where.push("started_at >= ?");
    params.push(filters.from);
  }
  if (filters.to) {
    where.push("started_at < ?");
    params.push(filters.to);
  }
  const row = await dbFirst<Row>(`SELECT COUNT(*) AS c FROM runs ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`, params);
  return n(row?.c);
}

// --------------------------------------------------------------- خطاها ---

export interface ParsedErrorLog {
  fileName: string;
  occurredAt: string | null;
  occurredJalali: string | null;
  subject: string;
  appVersion: string | null;
  detail: string;
  raw: string;
  fingerprint: string;
}

export async function saveErrorLogs(items: ParsedErrorLog[]): Promise<void> {
  if (!items.length) return;
  const now = new Date().toISOString();
  await dbBatch(
    items.map((item) => ({
      sql: `INSERT INTO error_logs (
              file_name, occurred_at, occurred_jalali, subject, app_version, detail, raw, fingerprint, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(fingerprint) DO UPDATE SET
              occurred_at = excluded.occurred_at,
              occurred_jalali = excluded.occurred_jalali,
              subject = excluded.subject,
              app_version = excluded.app_version,
              detail = excluded.detail,
              raw = excluded.raw`,
      params: [
        item.fileName,
        item.occurredAt,
        item.occurredJalali,
        item.subject,
        item.appVersion,
        item.detail,
        item.raw,
        item.fingerprint,
        now,
      ],
    })),
  );
}

export async function listErrorLogs(filters: { q?: string; from?: string; to?: string; limit?: number } = {}): Promise<ErrorLog[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.q) {
    where.push("(lower(subject) LIKE ? OR lower(detail) LIKE ? OR lower(file_name) LIKE ?)");
    const like = `%${filters.q.toLowerCase()}%`;
    params.push(like, like, like);
  }
  if (filters.from) {
    where.push("occurred_at >= ?");
    params.push(filters.from);
  }
  if (filters.to) {
    where.push("occurred_at < ?");
    params.push(filters.to);
  }
  const limit = Math.min(Math.max(filters.limit ?? 60, 1), 200);
  const rows = await dbAll<Row>(
    `SELECT * FROM error_logs ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY occurred_at DESC, id DESC LIMIT ?`,
    [...params, limit],
  );
  return rows.map(mapError);
}

export async function countErrorLogs(filters: { q?: string; from?: string; to?: string } = {}): Promise<number> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.q) {
    where.push("(lower(subject) LIKE ? OR lower(detail) LIKE ? OR lower(file_name) LIKE ?)");
    const like = `%${filters.q.toLowerCase()}%`;
    params.push(like, like, like);
  }
  if (filters.from) {
    where.push("occurred_at >= ?");
    params.push(filters.from);
  }
  if (filters.to) {
    where.push("occurred_at < ?");
    params.push(filters.to);
  }
  const row = await dbFirst<Row>(
    `SELECT COUNT(*) AS c FROM error_logs ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`,
    params,
  );
  return n(row?.c);
}

// ------------------------------------------------------------- پرامپت‌ها ---

export async function insertPrompt(data: {
  jobName: string;
  mode: PromptMode;
  prompt: string;
  code: string | null;
  issues: Issue[];
  status: string;
  error?: string | null;
  commitSha?: string | null;
  commitUrl?: string | null;
}): Promise<number> {
  const row = await dbFirst<Row>(
    `INSERT INTO prompts (job_name, mode, prompt, code, commit_sha, commit_url, status, error, issues, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      data.jobName,
      data.mode,
      data.prompt,
      data.code,
      data.commitSha ?? null,
      data.commitUrl ?? null,
      data.status,
      data.error ?? null,
      JSON.stringify(data.issues),
      new Date().toISOString(),
    ],
  );
  return n(row?.id);
}

export async function updatePromptResult(
  id: number,
  data: { commitSha?: string | null; commitUrl?: string | null; status: string; error?: string | null },
): Promise<void> {
  await dbRun("UPDATE prompts SET commit_sha = ?, commit_url = ?, status = ?, error = ? WHERE id = ?", [
    data.commitSha ?? null,
    data.commitUrl ?? null,
    data.status,
    data.error ?? null,
    id,
  ]);
}

export async function listPrompts(limit = 20): Promise<PromptRecord[]> {
  // نسخه‌های D1 با SHA-256 به فرمان متصل‌اند. این reconciliation علاوه بر مسیر اصلی
  // prompt_id، رکورد تست‌های ساخته‌شده پیش از اضافه‌شدن آن اتصال را نیز اصلاح می‌کند.
  await dbRun(`
    UPDATE prompts AS p
    SET status = (
          SELECT c.status FROM commands c
          WHERE c.job_name = p.job_name
            AND c.payload LIKE '%"sourceSha256":"' || p.commit_sha || '"%'
          ORDER BY c.created_at DESC LIMIT 1
        ),
        error = (
          SELECT c.error FROM commands c
          WHERE c.job_name = p.job_name
            AND c.payload LIKE '%"sourceSha256":"' || p.commit_sha || '"%'
          ORDER BY c.created_at DESC LIMIT 1
        )
    WHERE p.commit_url IS NULL
      AND p.commit_sha IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM commands c
        WHERE c.job_name = p.job_name
          AND c.payload LIKE '%"sourceSha256":"' || p.commit_sha || '"%'
      )
  `);
  const rows = await dbAll<Row>("SELECT * FROM prompts ORDER BY created_at DESC, id DESC LIMIT ?", [
    Math.min(Math.max(limit, 1), 100),
  ]);
  return rows.map(mapPrompt);
}

// --------------------------------------------------------------- رویداد ---

export async function insertEvent(data: {
  kind: string;
  title: string;
  detail?: string | null;
  jobName?: string | null;
  url?: string | null;
}): Promise<void> {
  await dbRun("INSERT INTO events (kind, title, detail, job_name, url, created_at) VALUES (?, ?, ?, ?, ?, ?)", [
    data.kind,
    data.title,
    data.detail ?? null,
    data.jobName ?? null,
    data.url ?? null,
    new Date().toISOString(),
  ]);
}

export async function listEvents(limit = 8): Promise<EventRecord[]> {
  const rows = await dbAll<Row>("SELECT * FROM events ORDER BY created_at DESC, id DESC LIMIT ?", [
    Math.min(Math.max(limit, 1), 100),
  ]);
  return rows.map(mapEvent);
}

// ----------------------------------------------------------- وضعیت‌ها ---

export async function getSyncState(key: string): Promise<string | null> {
  const row = await dbFirst<Row>("SELECT value FROM sync_state WHERE key = ?", [key]);
  return row ? nullableS(row.value) : null;
}

export async function setSyncState(key: string, value: string | null): Promise<void> {
  await dbRun(
    `INSERT INTO sync_state (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, new Date().toISOString()],
  );
}

export async function getSetting(key: string): Promise<string | null> {
  const row = await dbFirst<Row>("SELECT value FROM settings WHERE key = ?", [key]);
  return row ? nullableS(row.value) : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await dbRun(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, new Date().toISOString()],
  );
}

export async function saveSettings(values: Record<string, string>): Promise<void> {
  const now = new Date().toISOString();
  await dbBatch(
    Object.entries(values).map(([key, value]) => ({
      sql: `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      params: [key, value, now],
    })),
  );
}

export async function getDriveCache(id: string): Promise<{ modifiedAt: string | null; name: string } | null> {
  const row = await dbFirst<Row>("SELECT name, modified_at FROM drive_files WHERE id = ?", [id]);
  return row ? { name: s(row.name), modifiedAt: nullableS(row.modified_at) } : null;
}

export async function saveDriveCache(file: {
  id: string;
  name: string;
  kind: string;
  modifiedAt: string | null;
  size: number | null;
}): Promise<void> {
  await dbRun(
    `INSERT INTO drive_files (id, name, kind, modified_at, size, synced_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, kind = excluded.kind,
       modified_at = excluded.modified_at, size = excluded.size, synced_at = excluded.synced_at`,
    [file.id, file.name, file.kind, file.modifiedAt, file.size, new Date().toISOString()],
  );
}

export async function tableCounts() {
  return dbCounts();
}

// ------------------------------------------------------ ساخت نمای کدها ---

function changedAfterLastRun(job: Job, run: Run | null): boolean {
  if (!run) return true;
  const ran = new Date(run.startedAt ?? run.createdAt).getTime();
  if (!Number.isFinite(ran)) return false;
  // تاریخ آخرین کامیت همان فایل: اگر بعد از شروع اجرا باشد، نسخه‌ی تازه‌تری
  // روی گیت‌هاب هست که هنوز اجرا نشده است.
  if (job.commitDate) {
    const commit = new Date(job.commitDate).getTime();
    if (Number.isFinite(commit) && commit > ran + 1500) return true;
  }
  if (!job.changedAt) return false;
  const changed = new Date(job.changedAt).getTime();
  return Number.isFinite(changed) && changed > ran + 1500;
}

export function buildJobView(job: Job, lastRun: Run | null): JobView {
  let status: JobStatus = "pending";
  let statusNote = "در انتظار اجرا";

  if (!job.present) {
    status = "pending";
    statusNote = "از مخزن حذف شده";
  } else if (lastRun) {
    if (changedAfterLastRun(job, lastRun)) {
      status = "pending";
      statusNote = "نسخه‌ی تازه — در انتظار اجرا";
    } else if (lastRun.status === "success") {
      status = "success";
      statusNote = "اجرا شده";
    } else if (lastRun.status === "running" || lastRun.status === "pending") {
      status = "pending";
      statusNote = "در حال اجرا";
    } else if (lastRun.status === "timeout") {
      status = "error";
      statusNote = "زمان اجرا تمام شد";
    } else {
      status = "error";
      statusNote = "خطا در اجرا";
    }
  }

  const isFresh = job.present && Boolean(lastRun) && changedAfterLastRun(job, lastRun);
  return { ...job, status, statusNote, lastRun, isFresh };
}

export function computeStats(
  jobs: Job[],
  latest: Map<string, Run>,
  extras: { errorLogs: number; prompts: number },
): Stats {
  const present = jobs.filter((j) => j.present);
  let ran = 0;
  let pending = 0;
  let failed = 0;
  let stale = 0;
  for (const job of present) {
    const run = latest.get(job.name) ?? null;
    if (!run) {
      pending += 1;
      continue;
    }
    ran += 1;
    if (changedAfterLastRun(job, run)) stale += 1;
    if (run.status !== "success") failed += 1;
  }
  return {
    total: present.length,
    ran,
    pending,
    failed,
    stale,
    errorLogs: extras.errorLogs,
    prompts: extras.prompts,
  };
}
