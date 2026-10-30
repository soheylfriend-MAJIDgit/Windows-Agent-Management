"use client";

import Link from "next/link";
import { useOverview } from "@/components/OverviewProvider";
import { PageHeader, Banner, ErrorBanner, EmptyState, StatusChip } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { useToast } from "@/components/ToastProvider";
import { faDuration } from "@/lib/format";
import { faNumber, formatJalaliDateTime, relativeFa } from "@/lib/jalali";
import type { EventRecord, JobView, Run } from "@/lib/types";

type Tone = "accent" | "ok" | "warn" | "danger";

export default function DashboardPage() {
  const { data, error, loading, refreshing, reload, refresh } = useOverview();
  const notify = useToast();

  const stats = data?.stats;
  const setupIssue = error && !data && (error.code?.startsWith("db_") || error.code === "internal_error");
  const lastChecked = data ? formatJalaliDateTime(data.fetchedAt) : "—";

  async function handleRefresh() {
    await refresh();
    notify.ok("داده‌های داشبورد تازه شد.");
  }


  return (
    <>
      <PageHeader
        eyebrow="مرکز فرمان"
        title="داشبورد"
        subtitle={`نمای کلی کدهای ایجنت همکار، نتیجه‌ی اجراها و سلامت اتصال‌ها — آخرین بررسی: ${lastChecked}`}
        actions={
          <>
            <Link href="/screenshots" className="btn btn-small">
              <Icon name="image" size={14} />
              اسکرین‌شات‌ها
            </Link>
            <button type="button" className="btn btn-small" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? <span className="spinner" /> : <Icon name="refresh" size={14} />}
              به‌روزرسانی
            </button>
            <Link href="/prompt" className="btn btn-small btn-primary">
              <Icon name="send" size={14} />
              ارسال پرامپت
            </Link>
          </>
        }
      />

      {data?.githubError ? (
        <Banner
          tone="warn"
          title="گیت‌هاب در دسترس نیست"
          actions={
            <button type="button" className="btn btn-small" onClick={handleRefresh}>
              تلاش دوباره
            </button>
          }
        >
          {data.githubError} فهرست کدها از آخرین نسخه‌ی ذخیره‌شده در پایگاه داده نمایش داده می‌شود.
        </Banner>
      ) : null}

      {error && !data ? <ErrorBanner error={error} onRetry={() => reload()} /> : null}

      {setupIssue ? (
        <section className="card" style={{ marginBottom: 14 }}>
          <div className="card-head">
            <h2>
              <Icon name="database" size={17} />
              راه‌اندازی پایگاه داده
            </h2>
            <span className="card-head-sub">حدود یک دقیقه</span>
          </div>
          <ol className="steps">
            <li>
              <strong>استقرار</strong>
              یک بار <span className="mono">npm run deploy</span> را اجرا کنید؛ Wrangler دیتابیس D1 را از روی{" "}
              <span className="mono">database_name</span> خودکار می‌سازد و شناسه را در <span className="mono">wrangler.jsonc</span>
              می‌نویسد.
            </li>
            <li>
              <strong>جدول‌ها</strong>
              با اولین درخواست، جدول‌ها خودکار ساخته می‌شوند؛ هیچ SQL دستی لازم نیست.
            </li>
            <li>
              <strong>بررسی</strong>
              بعد از بالا آمدن Worker، همین صفحه را تازه کنید. وضعیت هر اتصال در بخش «سلامت اتصال‌ها» دیده می‌شود.
            </li>
          </ol>
          <div className="actions-inline" style={{ marginTop: 10 }}>
            <Link href="/settings" className="btn btn-small">
              <Icon name="settings" size={13} />
              تنظیمات و بررسی اتصال
            </Link>
            <Link href="/help" className="btn btn-small btn-ghost">
              <Icon name="help" size={13} />
              راهنمای کامل
            </Link>
          </div>
        </section>
      ) : null}

      {loading && !data ? (
        <div className="stat-grid" aria-busy="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <span key={index} className="skeleton skeleton-card" />
          ))}
        </div>
      ) : (
        <div className="stat-grid">
          <StatCard
            icon="layers"
            value={stats?.total ?? 0}
            label="کل کدها"
            hint="فایل‌های job_*.py در ریشه‌ی مخزن"
            tone="accent"
            href="/codes"
          />
          <StatCard
            icon="check-circle"
            value={stats?.ran ?? 0}
            label="اجرا شده"
            hint="دست‌کم یک نتیجه برایشان ثبت شده"
            tone="ok"
            href="/reports"
          />
          <StatCard
            icon="clock"
            value={stats?.pending ?? 0}
            label="در انتظار"
            hint="هنوز هیچ نتیجه‌ای برایشان ثبت نشده"
            tone="warn"
            href="/codes"
          />
          <StatCard
            icon="alert"
            value={stats?.failed ?? 0}
            label="خطای اجرا"
            hint="آخرین اجرایشان ناموفق بوده"
            tone="danger"
            href="/reports"
          />
        </div>
      )}

      {data && (stats?.stale ?? 0) > 0 ? (
        <Banner
          tone="info"
          title={`${faNumber(stats?.stale ?? 0)} کد پس از آخرین اجرا تغییر کرده است`}
          actions={
            <Link href="/codes" className="btn btn-small">
              <Icon name="play" size={13} />
              اجرای دوباره
            </Link>
          }
        >
          نسخه‌ی فعلی این فایل‌ها با آخرین نتیجه‌ی ثبت‌شده فرق دارد؛ پنل ویندوز در بررسی بعدی خودش آن‌ها را اجرا می‌کند. اگر
          عجله دارید از فهرست کدها «اجرای دوباره» را بزنید.
        </Banner>
      ) : null}

      {!loading && data && stats?.total === 0 && !data.githubError ? (
        <section className="card" style={{ marginBottom: 14 }}>
          <EmptyState
            icon="code"
            title="هنوز کدی در مخزن همکار نیست"
            text="با ارسال یک پرامپت، فایل job_*.py ساخته می‌شود؛ پنل ویندوز در بررسی بعدی آن را می‌گیرد و اجرا می‌کند."
            actions={
              <>
                <Link href="/prompt" className="btn btn-primary btn-small">
                  <Icon name="plus" size={14} />
                  ساخت اولین کد
                </Link>
                <Link href="/help" className="btn btn-small">
                  قواعد فایل
                </Link>
              </>
            }
          />
        </section>
      ) : null}

      <div className="dash-grid">
        <section className="card">
          <div className="card-head">
            <h2>
              <Icon name="code" size={17} />
              آخرین کدها
            </h2>
            <Link href="/codes" className="btn btn-small btn-ghost">
              همه‌ی کدها
              <Icon name="arrow-left" size={13} />
            </Link>
          </div>
          {loading && !data ? (
            <div aria-hidden="true">
              <span className="skeleton skeleton-line" />
              <span className="skeleton skeleton-line" style={{ width: "84%" }} />
              <span className="skeleton skeleton-line" style={{ width: "72%" }} />
            </div>
          ) : data && data.recentJobs.length ? (
            <div className="mini-list">
              {data.recentJobs.map((job) => (
                <RecentJobRow key={job.name} job={job} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon="code"
              title="کدی برای نمایش نیست"
              text="مخزن همکار هنوز فایل job_*.py ندارد یا دسترسی به آن برقرار نشده است."
            />
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>
              <Icon name="terminal" size={17} />
              آخرین اجراها
            </h2>
            <Link href="/reports" className="btn btn-small btn-ghost">
              گزارش کامل
              <Icon name="arrow-left" size={13} />
            </Link>
          </div>
          {loading && !data ? (
            <div aria-hidden="true">
              <span className="skeleton skeleton-line" />
              <span className="skeleton skeleton-line" style={{ width: "78%" }} />
              <span className="skeleton skeleton-line" style={{ width: "66%" }} />
            </div>
          ) : data && data.recentRuns.length ? (
            <div className="mini-list">
              {data.recentRuns.map((run) => (
                <RecentRunRow key={run.id} run={run} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon="terminal"
              title="هنوز اجرایی ثبت نشده"
              text="پس از اجرا، Windows Agent نتیجه را مستقیماً در D1 ثبت می‌کند؛ ورود دستی داده‌های قدیمی نیز فعال است."
              actions={
                <Link href="/reports" className="btn btn-small">
                  ورود دستی نتیجه
                </Link>
              }
            />
          )}
        </section>
      </div>

      <div className="dash-grid equal">
        <section className="card">
          <div className="card-head">
            <h2>
              <Icon name="shield" size={17} />
              سلامت اتصال‌ها
            </h2>
            <Link href="/settings" className="btn btn-small btn-ghost">
              تنظیمات
            </Link>
          </div>
          {data ? (
            <>
              <div className="conn-list">
                <ConnectionRow
                  icon="github"
                  label="گیت‌هاب (ایجنت همکار)"
                  ok={data.connections.github.ok}
                  text={
                    data.connections.github.ok
                      ? `${data.repos.collab.owner}/${data.repos.collab.repo} · ${data.repos.collab.branch}`
                      : data.connections.github.message
                  }
                  badge={data.connections.github.ok ? "متصل" : "قطع"}
                />
                <ConnectionRow
                  icon="image"
                  label="فضای تصاویر Cloudflare"
                  ok={true}
                  text="فایل‌ها در R2 و متادیتا و گزارش‌ها در D1 نگهداری می‌شوند"
                  badge="R2 + D1"
                />
                <ConnectionRow
                  icon="database"
                  label="پایگاه داده D1"
                  ok={data.connections.db.ok}
                  text={data.connections.db.message}
                  badge={data.connections.db.ok ? "آماده" : "خطا"}
                />
                <ConnectionRow
                  icon="lock"
                  label="توکن نوشتن"
                  ok={data.connections.token.configured}
                  text={
                    data.connections.token.configured
                      ? "اجرای دوباره و ارسال پرامپت فعال است"
                      : "تنظیم نشده؛ پنل فقط خواندنی است"
                  }
                  badge={data.connections.token.configured ? "فعال" : "فقط خواندن"}
                />
              </div>
              <div className="card-foot">
                <span>آخرین بررسی: {formatJalaliDateTime(data.fetchedAt)}</span>
                <Link href="/settings" className="btn btn-small btn-ghost">
                  بررسی کامل
                </Link>
              </div>
            </>
          ) : (
            <span className="skeleton skeleton-line" />
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>
              <Icon name="clock" size={17} />
              رویدادهای اخیر
            </h2>
            <span className="card-head-sub">رخدادهای D1</span>
          </div>
          {data && data.events.length ? (
            <ul className="timeline">
              {data.events.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </ul>
          ) : (
            <EmptyState
              icon="clock"
              title="رویدادی ثبت نشده"
              text="اجرای دوباره، پرامپت و همگام‌سازی‌ها اینجا ثبت می‌شوند."
            />
          )}
        </section>
      </div>
    </>
  );
}

function StatCard({
  icon,
  value,
  label,
  hint,
  tone,
  href,
}: {
  icon: IconName;
  value: number;
  label: string;
  hint: string;
  tone: Tone;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={`stat-card ${tone === "warn" || tone === "danger" ? `is-${tone}` : ""}`}
      style={{ color: "inherit", textDecoration: "none" }}
    >
      <span className="stat-icon">
        <Icon name={icon} size={19} />
      </span>
      <span className="stat-body">
        <span className="stat-value">{faNumber(value)}</span>
        <span className="stat-label">{label}</span>
        <span className="stat-hint">{hint}</span>
      </span>
    </Link>
  );
}

function RecentJobRow({ job }: { job: JobView }) {
  const tone = job.status === "success" ? "is-ok" : job.status === "error" ? "is-danger" : "is-warn";
  return (
    <Link href="/codes" className="mini-row">
      <span className={`mini-mark ${tone}`}>
        <Icon name="file" size={15} />
      </span>
      <span className="mini-body">
        <span className="mini-title mono" dir="ltr">
          {job.name}
        </span>
        <span className="mini-sub">{job.docstring || "بدون توضیح کوتاه"}</span>
      </span>
      <span className="mini-side">
        <span title={job.commitDate ? formatJalaliDateTime(job.commitDate) : undefined}>
          {job.commitDate ? relativeFa(job.commitDate) : "تاریخ نامشخص"}
        </span>
        <StatusChip status={job.status} />
      </span>
    </Link>
  );
}

function RecentRunRow({ run }: { run: Run }) {
  const ok = run.status === "success";
  return (
    <Link href="/reports" className="mini-row">
      <span className={`mini-mark ${ok ? "is-ok" : "is-danger"}`}>
        <Icon name={ok ? "check" : "x"} size={15} />
      </span>
      <span className="mini-body">
        <span className="mini-title mono" dir="ltr">
          {run.jobName}
        </span>
        <span className="mini-sub">
          {run.startedAt ? relativeFa(run.startedAt) : "زمان نامشخص"}
          {run.durationSeconds != null ? ` · ${faDuration(run.durationSeconds)}` : ""}
        </span>
      </span>
      <span className="mini-side">
        <StatusChip status={run.status} note={`کد خروج: ${run.exitCode ?? "—"}`} />
      </span>
    </Link>
  );
}

function ConnectionRow({
  icon,
  label,
  ok,
  text,
  badge,
}: {
  icon: IconName;
  label: string;
  ok: boolean;
  text: string;
  badge: string;
}) {
  return (
    <div className="conn-row">
      <span className="conn-icon">
        <Icon name={icon} size={15} />
      </span>
      <div className="conn-body">
        <span className="conn-name">
          {label}
          <span className={`status-mark ${ok ? "is-ok" : "is-warn"}`} aria-hidden="true" />
        </span>
        <span className="conn-msg">{text}</span>
      </div>
      <span className="conn-side">
        <span className={`chip chip-tiny ${ok ? "chip-ok" : "chip-warn"}`}>{badge}</span>
      </span>
    </div>
  );
}

function EventRow({ event }: { event: EventRecord }) {
  const toneMap: Record<string, string> = {
    rerun: "is-accent",
    prompt: "is-due",
    sync: "is-ok",
    ingest: "is-warn",
    error: "is-danger",
  };
  return (
    <li>
      <span className={`timeline-dot ${toneMap[event.kind] ?? ""}`} aria-hidden="true" />
      <div className="timeline-title">
        {event.url ? (
          <a href={event.url} target="_blank" rel="noreferrer">
            {event.title}
          </a>
        ) : (
          event.title
        )}
      </div>
      <div className="timeline-sub">
        {relativeFa(event.createdAt)}
        {event.detail ? ` · ${event.detail}` : ""}
      </div>
    </li>
  );
}
