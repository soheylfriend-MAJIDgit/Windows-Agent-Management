"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useApi, apiRequest, postJson, ApiRequestError } from "@/hooks/useApi";
import { useOverview } from "@/components/OverviewProvider";
import { CodeViewer } from "@/components/CodeViewer";
import { CommandMonitorModal } from "@/components/CommandMonitorModal";
import { PageHeader, Banner, ErrorBanner, EmptyState, StatusChip, LoadingState, IssueList } from "@/components/ui";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/ToastProvider";
import { faBytes, faLines } from "@/lib/format";
import { faNumber, formatJalali, formatJalaliDateTime, relativeFa } from "@/lib/jalali";
import type { JobDetailResponse, JobsResponse, JobView, Issue, RepoConfig } from "@/lib/types";

type Filter = "all" | "success" | "error" | "pending";
type Sort = "name" | "recent" | "size";
type View = "rows" | "cards";
type PanelTab = "code" | "rules";

interface RerunResponse {
  jobName: string;
  commitSha: string;
  commitUrl: string;
  message: string;
  fileUrl: string | null;
  commandId: string;
}

const FILTERS: Array<{ key: Filter; label: string; cls: string }> = [
  { key: "all", label: "همه", cls: "" },
  { key: "success", label: "اجرا شده", cls: "chip-ok" },
  { key: "error", label: "خطا", cls: "chip-danger" },
  { key: "pending", label: "در انتظار", cls: "chip-warn" },
];

const SORTS: Array<{ key: Sort; label: string }> = [
  { key: "name", label: "نام" },
  { key: "recent", label: "تازه‌ترین" },
  { key: "size", label: "حجم" },
];

export default function CodesPage() {
  const { data, error, loading, refreshing, reload, setData } = useApi<JobsResponse>("/api/jobs", { refreshMs: 120_000 });
  const overview = useOverview();
  const notify = useToast();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("name");
  const [view, setView] = useState<View>("rows");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<PanelTab>("code");
  const [details, setDetails] = useState<Record<string, JobDetailResponse>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<ApiRequestError | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busyRerun, setBusyRerun] = useState<string | null>(null);
  const [hardRefreshing, setHardRefreshing] = useState(false);
  const [rerunInfo, setRerunInfo] = useState<{ name: string; url: string } | null>(null);
  const [activeCommandId, setActiveCommandId] = useState<string | null>(null);

  const tokenReady = overview.data?.connections.token.configured ?? true;
  const repos = data?.repos.collab;
  const jobs = useMemo(() => data?.jobs ?? [], [data]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("wam-code-view");
      if (saved === "cards" || saved === "rows") setView(saved);
    } catch {
      // نادیده بگیر
    }
  }, []);

  function changeView(next: View) {
    setView(next);
    try {
      localStorage.setItem("wam-code-view", next);
    } catch {
      // نادیده بگیر
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = jobs
      .filter((job) => (q ? job.name.toLowerCase().includes(q) || job.docstring.toLowerCase().includes(q) : true))
      .filter((job) => (filter === "all" ? true : job.status === filter));
    const weight = (job: JobView) => (job.present ? 0 : 1);
    return list.sort((a, b) => {
      const present = weight(a) - weight(b);
      if (present) return present;
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "size") return b.size - a.size;
      const da = a.commitDate ?? a.archiveUpdatedAt ?? a.changedAt ?? "";
      const db = b.commitDate ?? b.archiveUpdatedAt ?? b.changedAt ?? "";
      return db.localeCompare(da);
    });
  }, [jobs, query, filter, sort]);

  const counts = useMemo(() => {
    return {
      all: jobs.length,
      success: jobs.filter((j) => j.status === "success").length,
      error: jobs.filter((j) => j.status === "error").length,
      pending: jobs.filter((j) => j.status === "pending").length,
      errorsInCode: jobs.filter((j) => j.issues.some((i) => i.severity === "error")).length,
    };
  }, [jobs]);

  async function hardRefresh() {
    setHardRefreshing(true);
    try {
      const fresh = await apiRequest<JobsResponse>("/api/jobs?refresh=1");
      setData(fresh);
      setDetails({});
      notify.ok("فهرست از گیت‌هاب تازه شد.");
    } catch (err) {
      notify.error(err instanceof ApiRequestError ? err.message : "به‌روزرسانی ممکن نشد.");
    } finally {
      setHardRefreshing(false);
    }
  }

  async function toggleCode(job: JobView) {
    if (expanded === job.name) {
      setExpanded(null);
      return;
    }
    setExpanded(job.name);
    setPanelTab("code");
    setDetailError(null);
    if (details[job.name]) return;
    setDetailLoading(job.name);
    try {
      const res = await apiRequest<JobDetailResponse>(`/api/jobs/${encodeURIComponent(job.name)}`);
      setDetails((prev) => ({ ...prev, [job.name]: res }));
    } catch (err) {
      setDetailError(err instanceof ApiRequestError ? err : new ApiRequestError("خواندن کد ممکن نشد."));
    } finally {
      setDetailLoading(null);
    }
  }

  async function doRerun(job: JobView) {
    setBusyRerun(job.name);
    try {
      const res = await postJson<RerunResponse>(`/api/jobs/${encodeURIComponent(job.name)}/rerun`, {});
      setConfirming(null);
      setDetails((prev) => {
        const next = { ...prev };
        delete next[job.name];
        return next;
      });
      setRerunInfo({ name: job.name, url: res.commitUrl });
      setActiveCommandId(res.commandId);
      notify.ok("فرمان اجرای دوباره ثبت شد و پایش زنده آغاز شد.");
      await reload({ silent: true });
      await overview.refresh();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        notify.error(err.hint ? `${err.message} ${err.hint}` : err.message);
      } else {
        notify.error("ثبت درخواست اجرا ممکن نشد.");
      }
    } finally {
      setBusyRerun(null);
    }
  }

  const lastChecked = data ? formatJalaliDateTime(data.fetchedAt) : "—";

  return (
    <>
      <PageHeader
        eyebrow="کتابخانه"
        title="فهرست کدها"
        subtitle="فایل‌های job_*.py مستقیم از ریشه‌ی مخزن ایجنت همکار خوانده می‌شوند؛ بدون کلید API و بدون محدودیت نرخ."
        actions={
          <>
            <button type="button" className="btn btn-small" onClick={hardRefresh} disabled={hardRefreshing || refreshing}>
              {hardRefreshing || refreshing ? <span className="spinner" /> : <Icon name="refresh" size={14} />}
              تازه‌سازی
            </button>
            <Link href="/prompt" className="btn btn-small btn-primary">
              <Icon name="plus" size={14} />
              پرامپت جدید
            </Link>
          </>
        }
      />

      {data?.stale ? (
        <Banner tone="warn" title="فهرست از حافظه‌ی ذخیره‌شده است" actions={<button type="button" className="btn btn-small" onClick={hardRefresh}>تلاش دوباره</button>}>
          {data.githubError ?? "ارتباط با گیت‌هاب برقرار نشد."}
        </Banner>
      ) : null}

      {rerunInfo ? (
        <Banner
          tone="ok"
          title={`درخواست اجرای دوباره‌ی ${rerunInfo.name} ثبت شد`}
          actions={
            <>
              {rerunInfo.url ? (
                <a href={rerunInfo.url} target="_blank" rel="noreferrer" className="btn btn-small">
                  <Icon name="external" size={13} />
                  مشاهده‌ی کامیت
                </a>
              ) : null}
              <button type="button" className="btn btn-small btn-ghost" onClick={() => setRerunInfo(null)}>
                بستن
              </button>
            </>
          }
        >
          محتوای فایل یک خط نشانه گرفت تا هشِ آن تغییر کند؛ پنل ویندوز در بررسی بعدی آن را در CODES می‌نویسد و اجرا
          می‌کند. تغییر <span className="mono">version.txt</span> روی اجرای کدها اثری ندارد.
        </Banner>
      ) : null}

      <ErrorBanner error={error} onRetry={() => reload()} />

      <section className="card card-tight filter-panel">
        <div className="filter-bar">
          <div className="search-field">
            <Icon name="search" size={15} />
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="جستجو در نام فایل یا توضیح کوتاه…"
              aria-label="جستجوی کد"
            />
          </div>
          <div className="row" style={{ gap: 8 }}>
            {counts.errorsInCode > 0 ? (
              <span className="chip chip-danger" title="تعداد فایل‌هایی که تخلف قاعده دارند">
                <Icon name="alert" size={12} />
                {faNumber(counts.errorsInCode)} تخلف
              </span>
            ) : null}
            <div className="view-switch" role="group" aria-label="نوع نمایش">
              <button type="button" className={view === "rows" ? "is-active" : ""} onClick={() => changeView("rows")} aria-pressed={view === "rows"}>
                <Icon name="report" size={13} /> ردیفی
              </button>
              <button type="button" className={view === "cards" ? "is-active" : ""} onClick={() => changeView("cards")} aria-pressed={view === "cards"}>
                <Icon name="dashboard" size={13} /> کارتی
              </button>
            </div>
          </div>
        </div>
        <div className="filter-bar">
          <div className="chip-row">
            <span className="chip-label">وضعیت</span>
            {FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`chip ${item.cls}`}
                aria-pressed={filter === item.key}
                onClick={() => setFilter(item.key)}
              >
                {item.label}
                <span className="tiny" style={{ opacity: 0.7 }}>
                  {faNumber(counts[item.key])}
                </span>
              </button>
            ))}
          </div>
          <div className="chip-row">
            <span className="chip-label">مرتب‌سازی</span>
            {SORTS.map((item) => (
              <button key={item.key} type="button" className="chip" aria-pressed={sort === item.key} onClick={() => setSort(item.key)}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="list-summary">
        <span>
          {faNumber(filtered.length)} از {faNumber(counts.all)} کد
          {counts.pending ? ` · ${faNumber(counts.pending)} در انتظار اجرا` : ""}
        </span>
        <span>آخرین بررسی: {lastChecked}</span>
      </div>

      {loading && !data ? (
        <div className="list-rows">
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className="skeleton skeleton-card" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <section className="card">
          <EmptyState
            icon="code"
            title={jobs.length ? "کدی با این فیلتر پیدا نشد" : "هنوز کدی در مخزن همکار نیست"}
            text={
              jobs.length
                ? "جستجو یا فیلتر وضعیت را تغییر دهید."
                : "با ارسال یک پرامپت، فایل job_*.py ساخته می‌شود و پنل ویندوز آن را اجرا می‌کند."
            }
            actions={
              jobs.length ? (
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  پاک کردن فیلترها
                </button>
              ) : (
                <>
                  <Link href="/prompt" className="btn btn-small btn-primary">
                    ارسال پرامپت
                  </Link>
                  <Link href="/help" className="btn btn-small">
                    قواعد فایل
                  </Link>
                </>
              )
            }
          />
        </section>
      ) : (
        <div className={view === "rows" ? "list-rows" : "list-cards"}>
          {filtered.map((job) => {
            const isOpen = expanded === job.name;
            const detail = details[job.name];
            const codeIssues: Issue[] = job.issues ?? [];
            const errorCount = codeIssues.filter((i) => i.severity === "error").length;
            return (
              <article
                key={job.name}
                className={`item ${view === "rows" ? "view-rows" : "view-cards"} b-${job.status} ${!job.present ? "is-deleted" : ""} ${
                  busyRerun === job.name ? "is-busy" : ""
                }`}
              >
                {view === "rows" ? (
                  <span className={`job-mark ${job.status === "error" ? "is-danger" : job.status === "pending" ? "is-warn" : ""}`}>
                    <Icon name="file" size={16} />
                  </span>
                ) : null}

                <div className="item-main">
                  <div className="item-title-row">
                    {view === "cards" ? (
                      <span className={`job-mark ${job.status === "error" ? "is-danger" : job.status === "pending" ? "is-warn" : ""}`} style={{ width: 30, height: 30, borderRadius: 8 }}>
                        <Icon name="file" size={14} />
                      </span>
                    ) : null}
                    <bdi className="item-title mono" dir="ltr">
                      {job.name}
                    </bdi>
                    <StatusChip status={job.status} note={job.statusNote} />
                    {job.isFresh ? <span className="chip chip-tiny chip-ok">تازه</span> : null}
                    {!job.present ? <span className="chip chip-tiny">حذف‌شده</span> : null}
                    {errorCount ? (
                      <span className="chip chip-tiny chip-danger" title="این فایل قاعده‌های اجرای پنل را رعایت نمی‌کند">
                        <Icon name="alert" size={10} />
                        {faNumber(errorCount)} تخلف
                      </span>
                    ) : null}
                  </div>
                  <p className={`item-doc ${job.docstring ? "" : "is-empty"}`}>
                    {job.docstring || "بدون داک‌استرینگ یا توضیح کوتاه"}
                  </p>
                </div>

                <div className="item-meta">
                  <span>
                    {faBytes(job.size)} · {faLines(job.lines)}
                  </span>
                  <span title={job.commitDate ? formatJalaliDateTime(job.commitDate) : undefined}>
                    {job.commitDate
                      ? `کامیت: ${relativeFa(job.commitDate)}`
                      : job.archiveUpdatedAt
                        ? `مخزن: ${formatJalali(job.archiveUpdatedAt)}`
                        : "بدون تاریخ"}
                  </span>
                  {job.commitSha ? (
                    <a
                      className="commit-line"
                      href={`https://github.com/${repos?.owner ?? ""}/${repos?.repo ?? ""}/commit/${job.commitSha}`}
                      target="_blank"
                      rel="noreferrer"
                      title="مشاهده‌ی کامیت در گیت‌هاب"
                    >
                      <bdi className="commit-sha">{job.commitSha.slice(0, 7)}</bdi>
                      <Icon name="external" size={10} />
                    </a>
                  ) : null}
                </div>

                <div className="item-actions">
                  <button type="button" className="btn btn-small" onClick={() => toggleCode(job)}>
                    <Icon name="code" size={13} />
                    {isOpen ? "بستن کد" : "مشاهده کد"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-small btn-primary"
                    disabled={!job.present || !tokenReady || busyRerun === job.name}
                    title={!tokenReady ? "برای اجرای دوباره، توکن گیت‌هاب لازم است." : !job.present ? "این فایل از مخزن حذف شده است." : undefined}
                    onClick={() => {
                      setConfirming(job.name);
                      setExpanded(null);
                    }}
                  >
                    {busyRerun === job.name ? <span className="spinner" /> : <Icon name="play" size={13} />}
                    اجرای دوباره
                  </button>
                  <a className="btn btn-small btn-ghost" href={`/api/jobs/${encodeURIComponent(job.name)}/download`}>
                    <Icon name="download" size={13} />
                    دانلود
                  </a>
                </div>

                {confirming === job.name ? (
                  <div className="item-editor confirm-panel">
                    <div className="confirm-title">
                      <Icon name="alert" size={15} />
                      اجرای دوباره‌ی {job.name}
                    </div>
                    <p>
                      یک کامیت کوچک به بالای فایل اضافه می‌شود تا محتوایش تغییر کند؛ پنل ویندوز هش تازه را می‌بیند و کد
                      را در <span className="mono">Desktop\CODES</span> می‌نویسد و اجرا می‌کند.
                    </p>
                    <p className="field-helper">
                      تغییر <span className="mono">version.txt</span> فقط نسخه‌ی برنامه است و اجرای کدها را تحریک
                      نمی‌کند. هر اجرای دوباره یک کامیت واقعی در مخزن همکار می‌سازد.
                    </p>
                    <div className="confirm-actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-small"
                        onClick={() => doRerun(job)}
                        disabled={busyRerun === job.name}
                      >
                        {busyRerun === job.name ? <span className="spinner" /> : <Icon name="play" size={13} />}
                        بله، اجرای دوباره
                      </button>
                      <button type="button" className="btn btn-small" onClick={() => setConfirming(null)}>
                        نه، انصراف
                      </button>
                    </div>
                  </div>
                ) : null}

                {isOpen ? (
                  <div className="item-editor code-panel">
                    <div className="code-head">
                      <div className="code-head-info">
                        <span className="code-head-title mono" dir="ltr">
                          {job.name}
                        </span>
                        <span className="code-head-meta">
                          <span>{faLines(job.lines)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{faBytes(job.size)}</span>
                          <span aria-hidden="true">·</span>
                          <span>sha: {job.contentSha.slice(0, 8)}</span>
                        </span>
                      </div>
                      <div className="actions-inline">
                        <button
                          type="button"
                          className={`chip-tab ${panelTab === "code" ? "is-active" : ""}`}
                          onClick={() => setPanelTab("code")}
                          aria-pressed={panelTab === "code"}
                        >
                          کد
                        </button>
                        <button
                          type="button"
                          className={`chip-tab ${panelTab === "rules" ? "is-active" : ""}`}
                          onClick={() => setPanelTab("rules")}
                          aria-pressed={panelTab === "rules"}
                        >
                          قواعد ({faNumber(codeIssues.length)})
                        </button>
                        {repos && job.commitSha ? (
                          <a
                            className="btn btn-small btn-ghost"
                            href={`https://github.com/${repos.owner}/${repos.repo}/commit/${job.commitSha}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Icon name="github" size={13} />
                            کامیت
                          </a>
                        ) : null}
                        <button type="button" className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => setExpanded(null)} aria-label="بستن">
                          <Icon name="x" size={14} />
                        </button>
                      </div>
                    </div>

                    {panelTab === "code" ? (
                      detailLoading === job.name ? (
                        <LoadingState label="در حال خواندن فایل از حافظه‌ی D1…" />
                      ) : detailError && !detail ? (
                        <ErrorBanner error={detailError} onRetry={() => toggleCode(job)} />
                      ) : detail ? (
                        <CodeViewer
                          content={detail.content}
                          fileName={job.name}
                          downloadHref={`/api/jobs/${encodeURIComponent(job.name)}/download`}
                        />
                      ) : (
                        <div className="code-empty">کد هنوز بارگذاری نشده است.</div>
                      )
                    ) : (
                      <div className="stack-sm">
                        <p className="field-helper">
                          بررسی ایستا روی importها، ورودی تعاملی، مسیر مطلق و محدودیت زمان. هشدارها مانع کامیت
                          نمی‌شوند، خطاها مانع هستند.
                        </p>
                        {codeIssues.length ? (
                          <IssueList issues={codeIssues} />
                        ) : (
                          <div className="callout">
                            <Icon name="check-circle" size={15} /> هیچ تخلف یا هشداری در این فایل پیدا نشد.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
      {activeCommandId ? <CommandMonitorModal commandId={activeCommandId} onClose={() => setActiveCommandId(null)} /> : null}
    </>
  );
}
