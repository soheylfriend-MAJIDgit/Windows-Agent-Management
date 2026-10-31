"use client";

import { useMemo, useState } from "react";
import { useApi, useDebounced, postJson, ApiRequestError } from "@/hooks/useApi";
import { useOverview } from "@/components/OverviewProvider";
import { PageHeader, Banner, ErrorBanner, EmptyState, StatusChip, LoadingState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/ToastProvider";
import { faDuration } from "@/lib/format";
import {
  FA_MONTHS,
  faNumber,
  formatJalaliDateTime,
  jalaliMonthDays,
  relativeFa,
  tehranJalaliParts,
  toPersianDigits,
} from "@/lib/jalali";
import type { ErrorLog, Run } from "@/lib/types";

type ReportTab = "results" | "errors";
type Range = "all" | "today" | "7" | "30";
type RunStatusFilter = "all" | "success" | "error" | "timeout";

interface JalaliDay {
  jy: number;
  jm: number;
  jd: number;
}

interface ReportsResponse {
  type: ReportTab;
  runs?: Run[];
  errors?: ErrorLog[];
  total: number;
  range: Range | "custom";
  invalidDate?: boolean;
}


interface IngestResponse {
  kind: "result" | "error";
  results: number;
  errors: number;
  jobName?: string;
}

const RANGES: Array<{ key: Range; label: string }> = [
  { key: "all", label: "همه" },
  { key: "today", label: "امروز" },
  { key: "7", label: "۷ روز" },
  { key: "30", label: "۳۰ روز" },
];

const STATUSES: Array<{ key: RunStatusFilter; label: string; cls: string }> = [
  { key: "all", label: "همه", cls: "" },
  { key: "success", label: "موفق", cls: "chip-ok" },
  { key: "error", label: "خطا", cls: "chip-danger" },
  { key: "timeout", label: "زمان‌بر", cls: "chip-warn" },
];

export default function ReportsPage() {
  const overview = useOverview();
  const notify = useToast();

  const [tab, setTab] = useState<ReportTab>("results");
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<Range>("all");
  const [custom, setCustom] = useState(false);
  const [day, setDay] = useState<JalaliDay>(() => {
    const now = typeof window === "undefined" ? null : tehranJalaliParts(new Date());
    return now ? { jy: now.jy, jm: now.jm, jd: now.jd } : { jy: 1405, jm: 1, jd: 1 };
  });
  const [status, setStatus] = useState<RunStatusFilter>("all");
  const [showIngest, setShowIngest] = useState(false);
  const [ingestName, setIngestName] = useState("");
  const [ingestKind, setIngestKind] = useState<"auto" | "result" | "error">("auto");
  const [ingestText, setIngestText] = useState("");
  const [ingestBusy, setIngestBusy] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);

  const debouncedQuery = useDebounced(query, 350);
  const url = useMemo(() => {
    const params = new URLSearchParams({ type: tab, range: custom ? "all" : range });
    if (custom) {
      const padded = `${day.jy}-${String(day.jm).padStart(2, "0")}-${String(day.jd).padStart(2, "0")}`;
      params.set("date", padded);
    }
    if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
    if (tab === "results" && status !== "all") params.set("status", status);
    return `/api/reports?${params.toString()}`;
  }, [tab, range, custom, day, debouncedQuery, status]);

  const daysInMonth = jalaliMonthDays(day.jy, day.jm);
  const yearOptions = useMemo(() => {
    const current = tehranJalaliParts(new Date()).jy;
    return Array.from({ length: 7 }, (_, i) => current - 5 + i).reverse();
  }, []);

  function pickPreset(next: Range) {
    setCustom(false);
    setRange(next);
  }

  function changeDay(patch: Partial<JalaliDay>) {
    setDay((prev) => {
      const merged = { ...prev, ...patch };
      const max = jalaliMonthDays(merged.jy, merged.jm);
      if (merged.jd > max) merged.jd = max;
      return merged;
    });
  }

  const reports = useApi<ReportsResponse>(url, { refreshMs: 90_000 });
  const current = reports.data && reports.data.type === tab ? reports.data : null;

  const resultCount = overview.data?.stats.ran;
  const errorCount = overview.data?.stats.errorLogs;

  async function handleIngest(event: React.FormEvent) {
    event.preventDefault();
    setIngestError(null);
    if (!ingestText.trim()) {
      setIngestError("متن فایل نتیجه یا خطا را بگذارید.");
      return;
    }
    setIngestBusy(true);
    try {
      const result = await postJson<IngestResponse>("/api/ingest", {
        fileName: ingestName.trim() || (ingestKind === "error" ? "errors_manual.txt" : "manual_result.txt"),
        content: ingestText,
        kind: ingestKind === "auto" ? undefined : ingestKind,
      });
      notify.ok(result.kind === "error" ? `${faNumber(result.errors)} بلوک خطا ثبت شد.` : `نتیجه‌ی ${result.jobName ?? "اجرا"} ثبت شد.`);
      setIngestText("");
      setIngestName("");
      setShowIngest(false);
      await reports.reload({ silent: true });
      await overview.refresh();
    } catch (err) {
      setIngestError(err instanceof ApiRequestError ? [err.message, err.hint].filter(Boolean).join(" — ") : "ثبت فایل ممکن نشد.");
    } finally {
      setIngestBusy(false);
    }
  }

  async function handleFile(file: File | null) {
    if (!file) return;
    try {
      const text = await file.text();
      setIngestText(text);
      setIngestName(file.name);
      if (/errors?_/i.test(file.name) || /موضوع\s*:/.test(text)) setIngestKind("error");
      else if (/_result\.txt$/i.test(file.name) || /کد\s*خروج\s*:/.test(text)) setIngestKind("result");
      notify.ok(`فایل ${file.name} خوانده شد.`);
    } catch {
      setIngestError("خواندن فایل ممکن نشد.");
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="گزارش‌ها"
        title="گزارش اجرا"
        subtitle="نتیجه‌های اجرا و خطاهای پنل ویندوز از فایل‌های logs خوانده می‌شوند؛ تاریخ‌ها شمسی و ساعت تهران است."
        actions={
          <>
            <button type="button" className="btn btn-small" onClick={() => setShowIngest((v) => !v)}>
              <Icon name="inbox" size={14} />
              ورود دستی
            </button>
            <button type="button" className="btn btn-small" onClick={() => reports.reload()} disabled={reports.refreshing}>
              {reports.refreshing ? <span className="spinner" /> : <Icon name="refresh" size={14} />}
              به‌روزرسانی
            </button>
          </>
        }
      />

      {showIngest ? (
        <section className="card" style={{ marginBottom: 14 }}>
          <div className="card-head">
            <h2>
              <Icon name="inbox" size={17} />
              ورود دستی فایل نتیجه یا خطا
            </h2>
            <button type="button" className="btn btn-small btn-ghost" onClick={() => setShowIngest(false)}>
              <Icon name="x" size={13} />
              بستن
            </button>
          </div>
          <form onSubmit={handleIngest}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="ingest-name">نام فایل</label>
                <input
                  id="ingest-name"
                  className="input ltr"
                  value={ingestName}
                  onChange={(e) => setIngestName(e.target.value)}
                  placeholder="job_wikipedia_result.txt"
                  dir="ltr"
                />
              </div>
              <div className="field">
                <label htmlFor="ingest-kind">نوع فایل</label>
                <select
                  id="ingest-kind"
                  className="input"
                  value={ingestKind}
                  onChange={(e) => setIngestKind(e.target.value as "auto" | "result" | "error")}
                >
                  <option value="auto">تشخیص خودکار</option>
                  <option value="result">نتیجه‌ی اجرا</option>
                  <option value="error">فایل خطا</option>
                </select>
              </div>
              <div className="field full">
                <label htmlFor="ingest-text">متن فایل</label>
                <textarea
                  id="ingest-text"
                  className="input"
                  value={ingestText}
                  onChange={(e) => setIngestText(e.target.value)}
                  rows={9}
                  dir="auto"
                  placeholder={"نتیجه اجرای کد Arena\n==========================================================\nفایل: job_example.py\nشروع: 1 آبان 1405 — 23:50:12 تهران\nمدت: 1.2 ثانیه\nکد خروج: 0\n\n----- خروجی -----\n..."}
                />
                <div className="row-between">
                  <label className="btn btn-small" style={{ cursor: "pointer" }}>
                    <Icon name="file" size={13} />
                    انتخاب فایل .txt
                    <input
                      type="file"
                      accept=".txt,text/plain"
                      hidden
                      onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  <span className="field-helper">همان قالب فایل‌های logs پنل ویندوز را بچسبانید.</span>
                </div>
              </div>
            </div>
            {ingestError ? (
              <p className="form-error" style={{ marginTop: 10 }} role="alert">
                <Icon name="alert" size={14} />
                {ingestError}
              </p>
            ) : null}
            <div className="form-actions">
              <button type="submit" className="btn btn-primary btn-small" disabled={ingestBusy}>
                {ingestBusy ? <span className="spinner" /> : <Icon name="check" size={14} />}
                ثبت گزارش
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <div className="filter-bar">
        <div className="seg-tabs" role="tablist" aria-label="نوع گزارش">
          <button type="button" className={`seg-tab ${tab === "results" ? "active" : ""}`} onClick={() => setTab("results")} role="tab" aria-selected={tab === "results"}>
            نتیجه‌ها
            {resultCount != null ? <span className="count">{faNumber(resultCount)}</span> : null}
          </button>
          <button type="button" className={`seg-tab ${tab === "errors" ? "active" : ""}`} onClick={() => setTab("errors")} role="tab" aria-selected={tab === "errors"}>
            خطاها
            {errorCount != null ? <span className="count">{faNumber(errorCount)}</span> : null}
          </button>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <span className="field-helper">
            {current ? `${faNumber(current.total)} مورد ذخیره‌شده در PostgreSQL` : ""}
          </span>
        </div>
      </div>

      <section className="card card-tight filter-panel">
        <div className="filter-bar">
          <div className="search-field">
            <Icon name="search" size={15} />
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tab === "results" ? "جستجو در نام کد یا متن خروجی…" : "جستجو در موضوع یا جزئیات خطا…"}
              aria-label="جستجوی گزارش"
            />
          </div>
          <div className="chip-row">
            <span className="chip-label">بازه</span>
            {RANGES.map((item) => (
              <button
                key={item.key}
                type="button"
                className="chip"
                aria-pressed={!custom && range === item.key}
                onClick={() => pickPreset(item.key)}
              >
                {item.label}
              </button>
            ))}
            <button type="button" className="chip" aria-pressed={custom} onClick={() => setCustom(true)}>
              <Icon name="clock" size={12} />
              روز مشخص
            </button>
          </div>
        </div>
        {custom ? (
          <div className="chip-row" role="group" aria-label="انتخاب روز جلالی">
            <span className="chip-label">روز</span>
            <select
              className="input select-compact"
              aria-label="سال"
              value={day.jy}
              onChange={(e) => changeDay({ jy: Number(e.target.value) })}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {faNumber(y, false)}
                </option>
              ))}
            </select>
            <select
              className="input select-compact"
              aria-label="ماه"
              value={day.jm}
              onChange={(e) => changeDay({ jm: Number(e.target.value) })}
            >
              {FA_MONTHS.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
            <select
              className="input select-compact"
              aria-label="روز"
              value={day.jd}
              onChange={(e) => changeDay({ jd: Number(e.target.value) })}
            >
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {toPersianDigits(d)}
                </option>
              ))}
            </select>
            <span className="field-helper">
              {`${toPersianDigits(day.jd)} ${FA_MONTHS[day.jm - 1]} ${faNumber(day.jy, false)} — به ساعت تهران`}
            </span>
          </div>
        ) : null}
        {custom && current?.invalidDate ? (
          <p className="form-error">تاریخ انتخابی معتبر نیست؛ سال/ماه/روز را دوباره انتخاب کنید.</p>
        ) : null}
        {tab === "results" ? (
          <div className="chip-row">
            <span className="chip-label">وضعیت</span>
            {STATUSES.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`chip ${item.cls}`}
                aria-pressed={status === item.key}
                onClick={() => setStatus(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <ErrorBanner error={reports.error} onRetry={() => reports.reload()} />

      {reports.loading && !current ? (
        <LoadingState label="در حال خواندن گزارش‌ها…" />
      ) : tab === "results" ? (
        current?.runs?.length ? (
          <div className="list-rows">
            {current.runs.map((run) => (
              <RunCard key={run.id} run={run} />
            ))}
          </div>
        ) : (
          <section className="card">
            <EmptyState
              icon="terminal"
              title="هنوز نتیجه‌ای ثبت نشده"
              text="پس از اجرای کدها، نتیجه Agent مستقیماً در PostgreSQL ثبت می‌شود؛ ورود دستی نیز برای داده‌های قدیمی فعال است."
              actions={
                <>
                  <button type="button" className="btn btn-small" onClick={() => setShowIngest(true)}>
                    ورود دستی نتیجه
                  </button>
                  <a href="/screenshots" className="btn btn-small btn-primary">مشاهده اسکرین‌شات‌ها</a>
                </>
              }
            />
          </section>
        )
      ) : current?.errors?.length ? (
        <div className="list-rows">
          {current.errors.map((item) => (
            <ErrorCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <section className="card">
          <EmptyState
            icon="check-circle"
            title="خطایی ثبت نشده"
            text="Windows Agent هنوز خطایی در PostgreSQL ثبت نکرده است."
          />
        </section>
      )}

      <p className="feedback">گزارش‌ها مستقیماً در PostgreSQL و تصاویر در Vercel Blob نگه‌داری می‌شوند؛ Google Drive در این مسیر استفاده نمی‌شود.</p>
    </>
  );
}

function RunCard({ run }: { run: Run }) {
  const ok = run.status === "success";
  const sourceLabel = run.source === "drive" ? "میراث قدیمی" : run.source === "manual" ? "دستی" : run.source;
  const hasOutput = Boolean(run.output);
  const hasErrors = Boolean(run.errors);

  return (
    <article className={`item run-item b-${run.status}`}>
      <div className="run-head">
        <span className={`mini-mark ${ok ? "is-ok" : "is-danger"}`}>
          <Icon name={ok ? "check" : "x"} size={15} />
        </span>
        <div className="run-main">
          <div className="run-title-row">
            <bdi className="item-title mono" dir="ltr">
              {run.jobName}
            </bdi>
            <StatusChip status={run.status} note={ok ? "کد خروج صفر" : "اجرای ناموفق"} />
            <span className="chip chip-tiny">{sourceLabel}</span>
          </div>
          <div className="run-meta">
            <span title={run.startedAt ? formatJalaliDateTime(run.startedAt, true) : undefined}>
              {run.startedAt ? formatJalaliDateTime(run.startedAt) : run.startedJalali ?? "زمان نامشخص"}
            </span>
            <span className="sep" aria-hidden="true" />
            <span>مدت: {faDuration(run.durationSeconds)}</span>
            <span className="sep" aria-hidden="true" />
            <span>
              کد خروج: <bdi className="run-exit">{run.exitCode == null ? "—" : toPersianDigits(run.exitCode)}</bdi>
            </span>
            {run.sourceFile ? (
              <>
                <span className="sep" aria-hidden="true" />
                <span className="mono" dir="ltr">
                  {run.sourceFile}
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>
      <details className="run-details">
        <summary>خروجی و خطاها</summary>
        <div className="run-body">
          {hasOutput ? (
            <div className="console-block">
              <div className="console-label">
                <span>خروجی</span>
                <span className="tiny">{toPersianDigits(run.output.length)} نویسه</span>
              </div>
              <pre className="console">{run.output}</pre>
            </div>
          ) : (
            <div className="empty-console">خروجی متنی ثبت نشده است.</div>
          )}
          {hasErrors ? (
            <div className="console-block">
              <div className="console-label is-error">
                <span>خطاها (stderr)</span>
              </div>
              <pre className="console is-error">{run.errors}</pre>
            </div>
          ) : null}
        </div>
      </details>
    </article>
  );
}

function ErrorCard({ item }: { item: ErrorLog }) {
  return (
    <article className="item run-item b-error">
      <div className="run-head">
        <span className="mini-mark is-danger">
          <Icon name="alert" size={15} />
        </span>
        <div className="run-main">
          <div className="run-title-row">
            <span className="item-title">{item.subject}</span>
            <StatusChip status="error" label="خطا" />
          </div>
          <div className="run-meta">
            <span title={item.occurredAt ? formatJalaliDateTime(item.occurredAt, true) : undefined}>
              {item.occurredAt ? formatJalaliDateTime(item.occurredAt) : item.occurredJalali ?? "زمان نامشخص"}
            </span>
            {item.appVersion ? (
              <>
                <span className="sep" aria-hidden="true" />
                <span>نسخه‌ی برنامه: {toPersianDigits(item.appVersion)}</span>
              </>
            ) : null}
            <span className="sep" aria-hidden="true" />
            <span className="mono" dir="ltr">
              {item.fileName}
            </span>
          </div>
        </div>
      </div>
      <details className="run-details">
        <summary>جزئیات خطا</summary>
        <div className="run-body">
          <div className="console-block">
            <div className="console-label is-error">
              <span>جزئیات</span>
            </div>
            <pre className="console is-error">{item.detail || "جزئیاتی ثبت نشده است."}</pre>
          </div>
        </div>
      </details>
    </article>
  );
}
