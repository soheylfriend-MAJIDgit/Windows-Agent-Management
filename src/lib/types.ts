export type RunStatus = "success" | "error" | "timeout" | "running" | "pending";
export type JobStatus = "success" | "error" | "pending";
export type PromptMode = "new" | "append";

export interface Issue {
  code: string;
  message: string;
  line?: number;
  hint?: string;
  severity: "error" | "warning";
}

export interface LintResult {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
}

export interface RepoConfig {
  owner: string;
  repo: string;
  branch: string;
}

export interface Job {
  name: string;
  size: number;
  lines: number;
  docstring: string;
  contentSha: string;
  commitDate: string | null;
  commitSha: string | null;
  commitMessage: string | null;
  archiveUpdatedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  changedAt: string | null;
  present: boolean;
  issues: Issue[];
}

export interface Run {
  id: number;
  jobName: string;
  status: RunStatus;
  exitCode: string | null;
  startedAt: string | null;
  startedJalali: string | null;
  durationSeconds: number | null;
  output: string;
  errors: string;
  source: string;
  sourceFile: string | null;
  createdAt: string;
}

export interface ErrorLog {
  id: number;
  fileName: string;
  occurredAt: string | null;
  occurredJalali: string | null;
  subject: string;
  appVersion: string | null;
  detail: string;
  createdAt: string;
}

export interface PromptRecord {
  id: number;
  jobName: string;
  mode: PromptMode;
  prompt: string;
  code: string | null;
  commitSha: string | null;
  commitUrl: string | null;
  status: string;
  error: string | null;
  issues: Issue[];
  createdAt: string;
}

export interface EventRecord {
  id: number;
  kind: string;
  title: string;
  detail: string | null;
  jobName: string | null;
  url: string | null;
  createdAt: string;
}

export interface JobView extends Job {
  status: JobStatus;
  statusNote: string;
  lastRun: Run | null;
  isFresh: boolean;
}

export interface Stats {
  total: number;
  ran: number;
  pending: number;
  failed: number;
  stale: number;
  errorLogs: number;
  prompts: number;
}

export interface ConnectionState {
  github: { ok: boolean; message: string; checkedAt: string | null };
  drive: { configured: boolean; lastSyncAt: string | null; lastError: string | null };
  db: { ok: boolean; message: string };
  token: { configured: boolean };
}

export interface Overview {
  stats: Stats;
  recentJobs: JobView[];
  recentRuns: Run[];
  events: EventRecord[];
  connections: ConnectionState;
  repos: { collab: RepoConfig; mother: RepoConfig };
  archiveUpdatedAt: string | null;
  fetchedAt: string;
  stale: boolean;
  githubError: string | null;
  driveConfigured: boolean;
}

export interface JobsResponse {
  jobs: JobView[];
  archiveUpdatedAt: string | null;
  fetchedAt: string;
  stale: boolean;
  githubError: string | null;
  repos: { collab: RepoConfig };
}

export interface JobDetailResponse {
  job: JobView;
  content: string;
  repos: { collab: RepoConfig };
  commitUrl: string | null;
}

export interface RunsResponse {
  runs: Run[];
  total: number;
}

export interface ErrorsResponse {
  errors: ErrorLog[];
  total: number;
}

export interface SyncResult {
  ok: boolean;
  configured: boolean;
  downloaded: number;
  results: number;
  errors: number;
  skipped: number;
  warnings: string[];
  syncedAt: string;
  message?: string;
}

export interface HealthCheck {
  name: string;
  ok: boolean;
  message: string;
  detail?: string;
  hint?: string;
  /** اختیاری است و نبودش سلامت کلی را ناموفق نمی‌کند. */
  optional?: boolean;
}

export interface SettingsBundle {
  repos: { collab: RepoConfig; mother: RepoConfig };
  defaults: { collab: RepoConfig; mother: RepoConfig };
  env: {
    githubToken: boolean;
    driveServiceAccount: boolean;
    driveFolder: boolean;
    passcode: boolean;
    authSecret: boolean;
    workerName: string;
    driveFolderId: string | null;
  };
  sync: { auto: boolean; limit: number; lastSyncAt: string | null; lastError: string | null };
  data: { jobs: number; runs: number; errors: number; prompts: number; events: number };
  drive: { configured: boolean; hasServiceAccount: boolean; hasFolder: boolean; accountsEmail: string | null };
  version: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    hint?: string;
    details?: unknown;
  };
}
