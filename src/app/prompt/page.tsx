"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useApi, postJson, ApiRequestError } from "@/hooks/useApi";
import { CommandMonitorModal } from "@/components/CommandMonitorModal";
import { PageHeader, Banner, ErrorBanner, EmptyState, StatusChip, IssueList, FieldError } from "@/components/ui";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/ToastProvider";
import { faNumber, formatJalaliDateTime, relativeFa, toPersianDigits } from "@/lib/jalali";
import type { LintResult, PromptRecord, Issue, PromptMode } from "@/lib/types";

type TelegramReportMode = "off" | "final" | "start_final";

interface AutomationOption {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  enabled: boolean;
  activeVersion: number | null;
  updatedAt: string;
}

interface PromptResponse {
  promptId: number;
  jobName: string;
  mode: PromptMode;
  commitSha: string;
  commitUrl: string;
  message: string;
  commitLink: string;
  issues: Issue[];
  commandId: string;
}

const RULES = [
  "شناسه یکتا در D1، با نام اجرایی job_ و پسوند .py",
  "فقط کتابخانه‌ی استاندارد پایتون ۳.۹+",
  "بدون input() و بدون کنسول تعاملی",
  "حداکثر ۶۰۰ ثانیه زمان اجرا",
  "بدون مسیر مطلق ویندوزی مثل C:\\Users\\...",
  "خروجی متنی با print() برای گزارش اجرا",
];

function promptModeMeta(mode: PromptMode): { label: string; cls: string; icon: "send" | "plus" | "file" } {
  if (mode === "arena") return { label: "ارسال به Arena", cls: "chip-ok", icon: "send" };
  if (mode === "new") return { label: "کد جدید", cls: "chip-ok", icon: "plus" };
  return { label: "افزودنی", cls: "chip-warn", icon: "file" };
}

function toJobName(slug: string): string {
  const cleaned = slug
    .trim()
    .replace(/\.py$/i, "")
    .replace(/^job_/i, "")
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  return `job_${cleaned || "task"}.py`.slice(0, 80);
}

export default function PromptPage() {
  const jobsApi = useApi<{ automations: AutomationOption[] }>("/api/automations", { refreshMs: 60_000 });
  const historyApi = useApi<{ prompts: PromptRecord[] }>("/api/prompts");
  const notify = useToast();

  const [mode, setMode] = useState<PromptMode>("arena");
  const [slug, setSlug] = useState("");
  const [target, setTarget] = useState("");
  const [prompt, setPrompt] = useState("");
  const [code, setCode] = useState("");
  const [telegramMode, setTelegramMode] = useState<TelegramReportMode>("final");
  const [lint, setLint] = useState<LintResult | null>(null);
  const [lintBusy, setLintBusy] = useState(false);
  const [lintNote, setLintNote] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<ApiRequestError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PromptResponse | null>(null);
  const [activeCommandId, setActiveCommandId] = useState<string | null>(null);

  const jobs = useMemo(() => (jobsApi.data?.automations ?? []).map((automation) => ({
    name: `job_${automation.slug}.py`,
    status: automation.enabled ? "pending" as const : "error" as const,
    statusNote: automation.enabled ? "نسخه فعال در D1" : "غیرفعال",
    docstring: automation.description ?? automation.name,
    commitDate: automation.updatedAt,
  })), [jobsApi.data]);

  useEffect(() => {
    if (!target && jobs.length) setTarget(jobs[0].name);
  }, [jobs, target]);

  const previewName = toJobName(slug);
  const cleanedSlug = previewName.replace(/^job_/, "").replace(/\.py$/, "");
  const targetJob = jobs.find((job) => job.name === target) ?? null;
  const canSubmit =
    prompt.trim().length >= 8 &&
    (mode === "arena" || (mode === "new" ? slug.trim().length > 0 : Boolean(target))) &&
    !submitting;

  function switchMode(next: PromptMode) {
    setMode(next);
    setFormError(null);
    setSubmitError(null);
    setLint(null);
    setLintNote(null);
  }

  async function checkCode() {
    if (!code.trim()) {
      setLintNote("برای بررسی، کد پایتون را در کادر کد بگذارید.");
      setLint(null);
      return;
    }
    setLintBusy(true);
    setLintNote(null);
    try {
      const res = await postJson<LintResult>("/api/lint", { name: previewName, code });
      setLint(res);
    } catch (err) {
      setLintNote(err instanceof ApiRequestError ? err.message : "بررسی کد ممکن نشد.");
    } finally {
      setLintBusy(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSubmitError(null);
    setResult(null);

    if (prompt.trim().length < 8) {
      setFormError("متن پرامپت باید دست‌کم ۸ نویسه باشد.");
      return;
    }
    if (mode === "new" && cleanedSlug === "task" && !/[A-Za-z]/.test(slug)) {
      setFormError("نام فایل باید دست‌کم یک حرف لاتین داشته باشد (مثل my_task).");
      return;
    }
    if (mode === "append" && !target) {
      setFormError("یک کد موجود برای افزودن پرامپت انتخاب کنید.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await postJson<PromptResponse>("/api/prompts", {
        mode,
        slug: mode === "new" ? cleanedSlug : undefined,
        jobName: mode === "append" ? target : mode === "arena" ? "job_arena.py" : undefined,
        prompt,
        code: mode === "new" && code.trim() ? code : undefined,
        telegramMode: mode === "arena" ? telegramMode : undefined,
      });
      setResult(res);
      setActiveCommandId(res.commandId);
      notify.ok("پرامپت ثبت شد و پایش زنده‌ی اجرای ویندوز آغاز شد.");
      setPrompt("");
      setCode("");
      setLint(null);
      setLintNote(null);
      await Promise.all([historyApi.reload({ silent: true }), jobsApi.reload({ silent: true })]);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setSubmitError(err);
        notify.error(err.message);
      } else {
        setSubmitError(new ApiRequestError("ارسال پرامپت ممکن نشد."));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const details = submitError?.details;
  const detailIssues = Array.isArray(details) ? (details as Issue[]) : null;
  const history = historyApi.data?.prompts ?? [];

  return (
    <>
      <PageHeader
        eyebrow="ایجنت همکار"
        title="ارسال پرامپت"
        subtitle="مسیر اختصاصی Arena متن شما را داخل job_arena.py قرار می‌دهد؛ پنل ویندوز فایل را می‌گیرد، Arena را باز می‌کند و متن را تایپ و ارسال می‌کند."
        actions={
          <Link href="/codes" className="btn btn-small">
            <Icon name="code" size={14} />
            فهرست کدها
          </Link>
        }
      />

      <Banner tone="info" title="مسیر مستقیم D1">
        پرامپت و نسخه تازه کد اتوماسیون در D1 ثبت می‌شود؛ ایجنت همکار برای این مسیر به GitHub یا Push نیاز ندارد.
      </Banner>

      <div className="split-grid">
        <section className="card form-card">
          <div className="card-head">
            <h2>
              <Icon name="send" size={17} />
              پرامپت جدید
            </h2>
            <span className="card-head-sub">ثبت نسخه مستقیم در کاتالوگ D1</span>
          </div>

          <form onSubmit={submit}>
            <div className="field">
              <span className="field-label">مقصد پرامپت</span>
              <div className="mode-switch">
                <button type="button" className="chip" aria-pressed={mode === "arena"} onClick={() => switchMode("arena")}>
                  <Icon name="send" size={13} />
                  ارسال اختصاصی به Arena
                </button>
                <button type="button" className="chip" aria-pressed={mode === "new"} onClick={() => switchMode("new")}>
                  <Icon name="plus" size={13} />
                  ساخت کد جدید
                </button>
                <button type="button" className="chip" aria-pressed={mode === "append"} onClick={() => switchMode("append")}>
                  <Icon name="file" size={13} />
                  افزودن یادداشت به کد
                </button>
              </div>
            </div>

            {mode === "arena" ? (
              <div className="arena-target-card">
                <span className="arena-target-icon"><Icon name="send" size={18} /></span>
                <div>
                  <strong>مسیر اختصاصی Arena آماده است</strong>
                  <p className="field-helper">
                    مقصد ثابت: <bdi className="mono" dir="ltr">job_arena.py</bdi> در کاتالوگ D1. هر ارسال یک
                    نسخه و hash یکتا می‌سازد و اجرای پنل ویندوز را فعال می‌کند.
                  </p>
                </div>
                <StatusChip status="success" label="اختصاصی" />
              </div>
            ) : mode === "new" ? (
              <div className="field" style={{ marginTop: 12 }}>
                <label htmlFor="slug">نام فایل</label>
                <div className="input-group" dir="ltr">
                  <span className="addon">job_</span>
                  <input
                    id="slug"
                    className="input"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="my_task"
                    maxLength={40}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <span className="addon">.py</span>
                </div>
                <div className="preview-file">
                  فایل نهایی: <b>{previewName}</b>
                </div>
                <span className="field-helper">فقط حروف لاتین، عدد و زیرخط. این شناسه در کاتالوگ D1 ساخته می‌شود.</span>
              </div>
            ) : (
              <div className="field" style={{ marginTop: 12 }}>
                <label htmlFor="target">کد موجود</label>
                <select id="target" className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="">یک کد را انتخاب کنید…</option>
                  {jobs.map((job) => (
                    <option key={job.name} value={job.name}>
                      {job.name} — {job.status === "error" ? "غیرفعال" : "نسخه فعال D1"}
                    </option>
                  ))}
                </select>
                {targetJob ? (
                  <div className="row" style={{ gap: 6, marginTop: 2 }}>
                    <StatusChip status={targetJob.status} note={targetJob.statusNote} />
                    <span className="field-helper">
                      {targetJob.docstring || "بدون توضیح"} · آخرین کامیت{" "}
                      {targetJob.commitDate ? relativeFa(targetJob.commitDate) : "نامشخص"}
                    </span>
                  </div>
                ) : jobs.length === 0 && !jobsApi.loading ? (
                  <span className="field-helper">هنوز کدی در D1 نیست؛ از حالت «کد جدید» شروع کنید یا انتقال اولیه را انجام دهید.</span>
                ) : null}
              </div>
            )}

            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor="prompt">متن پرامپت</label>
              <textarea
                id="prompt"
                className="input"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="مثلاً: کدی بنویس که صفحه‌ی اصلی ویکی‌پدیا را در مرورگر پیش‌فرض باز کند، ۵ ثانیه صبر کند و یک اسکرین‌شات در پوشه‌ی ScreenShots بگیرد…"
                rows={7}
                maxLength={8000}
              />
              <div className="row-between">
                <span className="field-helper">
                  {mode === "arena"
                    ? "همین متن عیناً در متغیر PROMPT_TEXT قرار می‌گیرد و job_arena.py آن را در کادر Arena تایپ و ارسال می‌کند."
                    : mode === "new"
                      ? "این متن در داک‌استرینگ فایل ذخیره می‌شود تا ایجنت همکار و انسان بتوانند آن را ببینند."
                      : "این متن به‌صورت کامنت به انتهای فایل اضافه می‌شود و باعث اجرای دوباره هم می‌شود."}
                </span>
                <span className="field-helper">{faNumber(prompt.length)} از ۸۰۰۰</span>
              </div>
            </div>

            {mode === "arena" ? (
              <div className="field" style={{ marginTop: 12 }}>
                <label htmlFor="telegram-mode">گزارش تلگرام</label>
                <select
                  id="telegram-mode"
                  className="input"
                  value={telegramMode}
                  onChange={(event) => setTelegramMode(event.target.value as TelegramReportMode)}
                >
                  <option value="final">فقط نتیجه نهایی — موفق یا ناموفق</option>
                  <option value="start_final">پیام شروع + نتیجه نهایی</option>
                  <option value="off">بدون پیام تلگرام</option>
                </select>
                <span className="field-helper">
                  پیام از طریق bot_api.json خود Windows Agent به مقصد پیش‌فرض ربات می‌رود؛ هیچ توکن تلگرامی وارد
                  این سایت، D1 یا GitHub نمی‌شود.
                </span>
                <div className="callout" style={{ marginTop: 8 }}>
                  <strong>اصلاح خودکار شکست:</strong> اگر job_arena.py خطای جدی بدهد، ابتدا لاگ و اسکرین‌شات شکست در
                  Google Drive ذخیره می‌شود؛ سپس برنامه گزینه No را برای نتیجه‌ی ناموفق می‌زند و تا سه بار تلاش می‌کند
                  پیام بررسی گزارش‌ها و بازنویسی کد را به ایجنت همکار برگرداند. اجرای موفق بدون پیام اصلاح ادامه می‌یابد.
                </div>
              </div>
            ) : null}

            {mode === "new" ? (
              <div className="field" style={{ marginTop: 12 }}>
                <label htmlFor="code">
                  کد پیشنهادی <span className="field-helper">(اختیاری)</span>
                </label>
                <textarea
                  id="code"
                  className="input code-input"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    setLint(null);
                    setLintNote(null);
                  }}
                  placeholder={'# اگر کد آماده دارید اینجا بگذارید\nimport sys\n\ndef main():\n    print("hello")\n\nif __name__ == "__main__":\n    main()'}
                  rows={10}
                  spellCheck={false}
                  dir="ltr"
                />
                <span className="field-helper">
                  اگر خالی بماند، فایل با یک بدنه‌ی امن ساخته می‌شود و ایجنت همکار بعداً می‌تواند کد را کامل کند.
                </span>
                <div className="row">
                  <button type="button" className="btn btn-small" onClick={checkCode} disabled={lintBusy || !code.trim()}>
                    {lintBusy ? <span className="spinner" /> : <Icon name="shield" size={13} />}
                    بررسی قواعد
                  </button>
                  {lint ? (
                    <span className={`status-chip ${lint.ok ? "is-ok" : "is-danger"}`}>
                      <span className="dot" />
                      {lint.ok ? "قواعد رعایت شده" : `${faNumber(lint.errors.length)} خطا`}
                    </span>
                  ) : null}
                  {lint?.warnings.length ? (
                    <span className="field-helper">{faNumber(lint.warnings.length)} هشدار</span>
                  ) : null}
                </div>
                {lintNote ? <p className="feedback">{lintNote}</p> : null}
                {lint ? (
                  <div className="stack-sm" style={{ marginTop: 6 }}>
                    <IssueList issues={[...lint.errors, ...lint.warnings]} />
                  </div>
                ) : null}
              </div>
            ) : null}

            {formError ? (
              <p className="form-error" style={{ marginTop: 12 }} role="alert">
                <Icon name="alert" size={14} />
                {formError}
              </p>
            ) : null}

            {submitError ? (
              <div style={{ marginTop: 12 }}>
                <Banner tone="danger" title="ارسال انجام نشد" actions={
                  <button type="button" className="btn btn-small" onClick={() => setSubmitError(null)}>
                    بستن
                  </button>
                }>
                  <div>{submitError.message}</div>
                  {submitError.hint ? <div className="field-helper">{submitError.hint}</div> : null}
                </Banner>
                {detailIssues?.length ? <IssueList issues={detailIssues} /> : null}
              </div>
            ) : null}

            <div className="form-actions">
              <button
                type="button"
                className="btn btn-small btn-ghost"
                onClick={() => {
                  setPrompt("");
                  setCode("");
                  setResult(null);
                  setFormError(null);
                  setSubmitError(null);
                }}
              >
                <Icon name="x" size={13} />
                پاک کردن فرم
              </button>
              <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
                {submitting ? <span className="spinner" /> : <Icon name="send" size={15} />}
                {submitting ? "در حال ثبت نسخه D1…" : mode === "arena" ? "ارسال به Arena از طریق ویندوز" : "ثبت و اجرا از طریق D1"}
              </button>
            </div>
          </form>

          {result ? (
            <div className="success-panel">
              <div className="success-title">
                <Icon name="check-circle" size={16} />
                پرامپت با موفقیت ثبت شد
              </div>
              <div className="success-meta">
                <bdi className="mono" dir="ltr">
                  {result.jobName}
                </bdi>
                <span className={`chip chip-tiny ${promptModeMeta(result.mode).cls}`}>
                  {promptModeMeta(result.mode).label}
                </span>
                <StatusChip status="pending" label="در انتظار اجرا" />
                <span>هش نسخه D1: {result.commitSha.slice(0, 12)}</span>
              </div>
              <p className="field-helper">
                {result.mode === "arena"
                  ? "نسخه تازه job_arena.py در D1 فعال شد. پنل ویندوز همان نسخه را با بررسی SHA-256 می‌گیرد، Arena را باز می‌کند و نتیجه را گزارش می‌دهد."
                  : "نسخه تازه در D1 فعال و برای Windows Agent صف شد؛ نتیجه در گزارش زنده اجرا دیده می‌شود."}
              </p>
              <div className="actions-inline">
                <Link href="/codes" className="btn btn-small btn-primary">
                  <Icon name="code" size={13} />
                  دیدن در فهرست کدها
                </Link>
                <button type="button" className="btn btn-small btn-ghost" onClick={() => setResult(null)}>
                  بستن
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <aside className="side-stack">
          <section className="card">
            <div className="card-head">
              <h2>
                <Icon name="arrow-left" size={16} />
                گردش کار
              </h2>
            </div>
            <ol className="steps">
              <li>
                <strong>ثبت در فایل اختصاصی</strong>
                متن و تنظیم گزارش در job_arena.py با شناسه‌ی یکتای درخواست کامیت می‌شود.
              </li>
              <li>
                <strong>دریافت توسط پنل ویندوز</strong>
                حالت خودکار هر ۱۰ ثانیه، یا دستی، محتوای تازه را در Desktop\CODES می‌نویسد.
              </li>
              <li>
                <strong>تحویل به Arena</strong>
                کد با پایتون ویندوز اجرا می‌شود، صفحه‌ی Arena را باز می‌کند و متن را در کادر گفتگو تایپ و ارسال می‌کند.
              </li>
              <li>
                <strong>گزارش یا اصلاح</strong>
                موفقیت طبق انتخاب فرم به تلگرام می‌رود؛ در خطای جدی، لاگ و اسکرین‌شات ذخیره و پیام اصلاح کد تا سه
                بار به ایجنت همکار برگردانده می‌شود.
              </li>
            </ol>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>
                <Icon name="shield" size={16} />
                قواعد فایل
              </h2>
              <Link href="/help" className="btn btn-small btn-ghost">
                جزئیات
              </Link>
            </div>
            <ul className="rules-list">
              {RULES.map((rule) => (
                <li key={rule}>
                  <span className="rule-check">
                    <Icon name="check" size={13} />
                  </span>
                  {rule}
                </li>
              ))}
            </ul>
          </section>

          <section className="card intro-card">
            <div className="card-head">
              <h2>
                <Icon name="alert" size={16} />
                نکته‌ی اجرای دوباره
              </h2>
            </div>
            <p className="prose" style={{ fontSize: 12.3 }}>
              پنل ویندوز تازگی را از <strong>محتوای فایل</strong> می‌فهمد، نه از شماره نسخه. تغییر{" "}
              <span className="mono">version.txt</span> فقط نسخه‌ی خود برنامه است و هیچ اجرایی را تحریک نمی‌کند.
            </p>
          </section>
        </aside>
      </div>

      <section className="card history-card">
        <div className="card-head">
          <h2>
            <Icon name="clock" size={17} />
            تاریخچه‌ی پرامپت‌ها
          </h2>
          <button type="button" className="btn btn-small btn-ghost" onClick={() => historyApi.reload()} disabled={historyApi.refreshing}>
            {historyApi.refreshing ? <span className="spinner" /> : <Icon name="refresh" size={13} />}
            به‌روزرسانی
          </button>
        </div>

        <ErrorBanner error={historyApi.error} onRetry={() => historyApi.reload()} />

        {historyApi.loading && !historyApi.data ? (
          <div className="skeleton skeleton-line" />
        ) : history.length === 0 ? (
          <EmptyState icon="send" title="هنوز پرامپتی فرستاده نشده" text="اولین پرامپت را از فرم بالا بفرستید؛ تاریخچه و لینک کامیت اینجا می‌آید." />
        ) : (
          <div>
            {history.map((item) => {
              const status =
                item.status === "pending"
                  ? { status: "pending", label: "در انتظار اجرا" }
                  : item.status === "failed"
                    ? { status: "error", label: "ناموفق" }
                    : item.status === "sending"
                      ? { status: "running", label: "در حال ارسال" }
                      : item.status === "running" || item.status === "claimed" || item.status === "waiting_confirmation"
                        ? { status: "running", label: item.status === "waiting_confirmation" ? "در انتظار تأیید ویندوز" : "در حال اجرا" }
                        : item.status === "succeeded"
                          ? { status: "success", label: "موفق" }
                          : item.status === "cancelled"
                            ? { status: "error", label: "متوقف‌شده" }
                            : item.status === "timed_out"
                              ? { status: "error", label: "پایان زمان مجاز" }
                              : item.status === "rejected"
                                ? { status: "error", label: "ردشده در ویندوز" }
                                : { status: "neutral", label: item.status };
              return (
                <div key={item.id} className="history-row">
                  <span className="history-mark">
                    <Icon name={promptModeMeta(item.mode).icon} size={14} />
                  </span>
                  <div className="history-body">
                    <div className="history-title">
                      <bdi className="mono" dir="ltr">
                        {item.jobName}
                      </bdi>
                      <span className={`chip chip-tiny ${promptModeMeta(item.mode).cls}`}>
                        {promptModeMeta(item.mode).label}
                      </span>
                      <StatusChip status={status.status} label={status.label} />
                      <span className="field-helper" title={formatJalaliDateTime(item.createdAt, true)}>
                        {relativeFa(item.createdAt)}
                      </span>
                    </div>
                    <p className="history-prompt">{item.prompt}</p>
                    {item.error ? <p className="form-error">{item.error}</p> : null}
                  </div>
                  <div className="actions-inline">
                    {item.commitUrl ? (
                      <a href={item.commitUrl} target="_blank" rel="noreferrer" className="btn btn-small btn-ghost">
                        <Icon name="external" size={12} />
                        کامیت
                      </a>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="feedback">
          تاریخ‌ها به شمسی و ساعت تهران نمایش داده می‌شوند؛ ذخیره‌سازی داخلی میلادی/UTC است. مجموع پرامپت‌ها:{" "}
          {toPersianDigits(history.length)}
        </p>
      </section>
      {activeCommandId ? <CommandMonitorModal commandId={activeCommandId} onClose={() => setActiveCommandId(null)} /> : null}
    </>
  );
}
