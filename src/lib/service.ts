import { dbHealthy, envVar } from "./db";
import { driveStatus, getDriveState } from "./drive";
import { AppError } from "./errors";
import { fetchArchive, fetchLatestCommit, getLastGoodArchive, type ArchiveSnapshot } from "./github";
import { getRepoConfig } from "./config";
import {
  buildJobView,
  computeStats,
  countErrorLogs,
  countRuns,
  getJobContent,
  jobsMissingCommitInfo,
  latestRunsByJob,
  listErrorLogs,
  listEvents,
  listJobRows,
  listRuns,
  saveJobsSnapshot,
  tableCounts,
  updateJobCommit,
} from "./store";
import type { ConnectionState, ErrorLog, JobView, Overview, Run, Stats } from "./types";

export interface JobsData {
  jobs: JobView[];
  archiveUpdatedAt: string | null;
  fetchedAt: string;
  stale: boolean;
  githubError: string | null;
  repos: { collab: Awaited<ReturnType<typeof getRepoConfig>> };
}

async function enrichCommitDates(limit = 6): Promise<void> {
  try {
    const token = await envVar("GITHUB_TOKEN");
    if (!token) return;
    const cfg = await getRepoConfig("collab");
    const names = await jobsMissingCommitInfo(limit);
    if (!names.length) return;
    await Promise.allSettled(
      names.map(async (name) => {
        try {
          const info = await fetchLatestCommit(cfg, name, token);
          if (info) {
            await updateJobCommit(name, { date: info.date, sha: info.sha, message: info.message });
          } else {
            await updateJobCommit(name, { date: null, sha: null, message: null });
          }
        } catch {
          // محدودیت نرخ یا خطای موقت؛ دفعه‌ی بعد
        }
      }),
    );
  } catch {
    // تاریخ کامیت اختیاری است؛ نباید صفحه‌ی کدها را بشکند.
  }
}

export async function getJobsData(options: { force?: boolean; enrich?: boolean; enrichLimit?: number } = {}): Promise<JobsData> {
  const config = await getRepoConfig("collab");
  let archive: ArchiveSnapshot | null = null;
  let githubError: string | null = null;

  try {
    archive = await fetchArchive(config, { force: options.force });
    await saveJobsSnapshot(
      archive.files.map((file) => ({
        name: file.name,
        size: file.size,
        lines: file.lines,
        docstring: file.docstring,
        content: file.content,
        sha: file.sha,
        archiveUpdatedAt: file.archiveUpdatedAt,
        issues: file.issues,
      })),
    );
    if (options.enrich !== false) await enrichCommitDates(options.enrichLimit ?? 6);
  } catch (err) {
    githubError = err instanceof Error ? err.message : "ارتباط با گیت‌هاب برقرار نشد.";
    const fallback = getLastGoodArchive(config);
    if (fallback) archive = fallback;
  }

  const rows = await listJobRows();
  const latest = await latestRunsByJob();
  const jobs = rows.map((row) => buildJobView(row, latest.get(row.name) ?? null));
  const archiveUpdatedAt =
    archive?.updatedAt ??
    rows.reduce<string | null>((max, row) => {
      const value = row.archiveUpdatedAt ?? row.commitDate;
      return value && (!max || value > max) ? value : max;
    }, null);

  return {
    jobs,
    archiveUpdatedAt,
    fetchedAt: archive?.fetchedAt ?? new Date().toISOString(),
    stale: !archive || Boolean(githubError),
    githubError,
    repos: { collab: config },
  };
}

export async function getOverview(options: { force?: boolean } = {}): Promise<Overview> {
  // تاریخ کامیت در داشبورد هم لازم است؛ با کش ۱۰ دقیقه‌ای، حداکثر چند درخواست API.
  const data = await getJobsData({ force: options.force, enrichLimit: options.force ? 8 : 3 });
  const latest = await latestRunsByJob();
  const counts = await tableCounts();
  const drive = await getDriveState();
  const driveCfg = await driveStatus();
  const tokenConfigured = Boolean(await envVar("GITHUB_TOKEN"));

  const present = data.jobs.filter((j) => j.present);
  const stamp = (job: JobView) => job.commitDate ?? job.firstSeenAt ?? "";
  const recentJobs = [...present]
    .sort((a, b) => stamp(b).localeCompare(stamp(a)) || a.name.localeCompare(b.name))
    .slice(0, 5);

  const recentRuns = await listRuns({ limit: 5 });
  const events = await listEvents(6);
  const stats: Stats = computeStats(data.jobs, latest, { errorLogs: counts.errors, prompts: counts.prompts });

  const databaseOk = await dbHealthy().catch(() => false);
  const connections: ConnectionState = {
    github: {
      ok: !data.githubError,
      message: data.githubError ?? "متصل به مخزن ایجنت همکار",
      checkedAt: data.fetchedAt,
    },
    drive: {
      configured: driveCfg.configured,
      lastSyncAt: drive.lastSyncAt,
      lastError: drive.lastError,
    },
    db: {
      ok: databaseOk,
      message: databaseOk ? "پایگاه داده D1 آماده است" : "پایگاه داده D1 پاسخ نداد.",
    },
    token: { configured: tokenConfigured },
  };

  return {
    stats,
    recentJobs,
    recentRuns,
    events,
    connections,
    repos: {
      collab: data.repos.collab,
      mother: await getRepoConfig("mother"),
    },
    archiveUpdatedAt: data.archiveUpdatedAt,
    fetchedAt: data.fetchedAt,
    stale: data.stale || Boolean(data.githubError),
    githubError: data.githubError,
    driveConfigured: driveCfg.configured,
  };
}

export async function getJobDetail(name: string): Promise<{ job: JobView; content: string; commitUrl: string | null; repos: JobsData["repos"] }> {
  const config = await getRepoConfig("collab");
  const record = await getJobContent(name);
  if (!record) {
    throw new AppError("این کد در فهرست پیدا نشد.", {
      status: 404,
      code: "job_not_found",
      hint: "فهرست را به‌روزرسانی کنید؛ ممکن است فایل از مخزن حذف شده باشد.",
    });
  }
  const latest = await latestRunsByJob();
  const view = buildJobView(record.job, latest.get(name) ?? null);
  const commitUrl = record.job.commitSha
    ? `https://github.com/${config.owner}/${config.repo}/commit/${record.job.commitSha}`
    : null;
  return { job: view, content: record.content, commitUrl, repos: { collab: config } };
}

export interface ReportFilters {
  q?: string;
  range?: string;
  status?: string;
  from?: string;
  to?: string;
}

export async function getRunsReport(filters: ReportFilters): Promise<{ runs: Run[]; total: number }> {
  const runs = await listRuns({
    q: filters.q,
    status: filters.status,
    from: filters.from,
    to: filters.to,
    limit: 80,
  });
  const total = await countRuns({ q: filters.q, status: filters.status, from: filters.from, to: filters.to });
  return { runs, total };
}

export async function getErrorsReport(filters: ReportFilters): Promise<{ errors: ErrorLog[]; total: number }> {
  const errors = await listErrorLogs({ q: filters.q, from: filters.from, to: filters.to, limit: 80 });
  const total = await countErrorLogs({ q: filters.q, from: filters.from, to: filters.to });
  return { errors, total };
}

export async function getReportCounts(): Promise<{ runs: number; errors: number }> {
  const counts = await tableCounts();
  const errorCount = await countErrorLogs();
  return { runs: counts.runs, errors: errorCount };
}
