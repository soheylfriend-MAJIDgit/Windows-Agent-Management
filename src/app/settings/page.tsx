"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApi, putJson, apiRequest, ApiRequestError } from "@/hooks/useApi";
import { useOverview } from "@/components/OverviewProvider";
import { PageHeader, Banner, ErrorBanner, StatusChip, CopyButton, LoadingState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/ToastProvider";
import { faNumber, formatJalaliDateTime, relativeFa } from "@/lib/jalali";
import type { RepoConfig, SettingsBundle } from "@/lib/types";

interface HealthCheck {
  name: string;
  ok: boolean;
  message: string;
  detail?: string;
  hint?: string;
  optional?: boolean;
}

interface HealthResult {
  ok: boolean;
  checks: HealthCheck[];
  checkedAt: string;
}

type RepoKind = "collab" | "mother";

const EMPTY: RepoConfig = { owner: "", repo: "", branch: "" };

export default function SettingsPage() {
  const settingsApi = useApi<SettingsBundle>("/api/settings");
  const overview = useOverview();
  const notify = useToast();

  const [repos, setRepos] = useState<Record<RepoKind, RepoConfig>>({ collab: EMPTY, mother: EMPTY });
  const [savingRepo, setSavingRepo] = useState<RepoKind | null>(null);
  const [repoErrors, setRepoErrors] = useState<Partial<Record<RepoKind, string>>>({});
  const [auto, setAuto] = useState(true);
  const [limit, setLimit] = useState(20);
  const [savingSync, setSavingSync] = useState(false);
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [healthBusy, setHealthBusy] = useState<"shallow" | "deep" | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  const bundle = settingsApi.data;

  useEffect(() => {
    if (bundle) {
      setRepos({ collab: bundle.repos.collab, mother: bundle.repos.mother });
      setAuto(bundle.sync.auto);
      setLimit(bundle.sync.limit);
    }
  }, [bundle]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await apiRequest<HealthResult>("/api/health");
        if (!cancelled) setHealth(result);
      } catch {
        // بررسی خودکار اختیاری است
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateRepo(kind: RepoKind, field: keyof RepoConfig, value: string) {
    setRepos((prev) => ({ ...prev, [kind]: { ...prev[kind], [field]: value } }));
    setRepoErrors((prev) => ({ ...prev, [kind]: undefined }));
  }

  async function saveRepo(kind: RepoKind) {
    const value = repos[kind];
    if (!value.owner.trim() || !value.repo.trim() || !value.branch.trim()) {
      setRepoErrors((prev) => ({ ...prev, [kind]: "هر سه فیلد مالک، مخزن و شاخه لازم است." }));
      return;
    }
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(value.owner.trim())) {
      setRepoErrors((prev) => ({ ...prev, [kind]: "نام مالک باید فقط حروف لاتین، عدد و خط تیره باشد." }));
      return;
    }
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(value.repo.trim())) {
      setRepoErrors((prev) => ({ ...prev, [kind]: "نام مخزن معتبر نیست." }));
      return;
    }
    if (!/^[A-Za-z0-9._/-]{1,200}$/.test(value.branch.trim()) || value.branch.includes("..")) {
      setRepoErrors((prev) => ({ ...prev, [kind]: "نام شاخه معتبر نیست. اسلش مجاز است." }));
      return;
    }
    setSavingRepo(kind);
    try {
      const fresh = await putJson<SettingsBundle>("/api/settings", { repos: { [kind]: value } });
      settingsApi.setData(fresh);
      setRepos({ collab: fresh.repos.collab, mother: fresh.repos.mother });
      notify.ok(kind === "collab" ? "مخزن ایجنت همکار ذخیره شد." : "مخزن ایجنت مادر ذخیره شد.");
      await overview.refresh();
    } catch (err) {
      const message = err instanceof ApiRequestError ? err.message : "ذخیره‌ی مخزن ممکن نشد.";
      setRepoErrors((prev) => ({ ...prev, [kind]: message }));
      notify.error(message);
    } finally {
      setSavingRepo(null);
    }
  }

  async function saveSync() {
    if (!Number.isFinite(limit) || limit < 5 || limit > 40) {
      notify.error("سقف همگام‌سازی باید بین ۵ و ۴۰ باشد.");
      return;
    }
    setSavingSync(true);
    try {
      const fresh = await putJson<SettingsBundle>("/api/settings", { sync: { auto, limit } });
      settingsApi.setData(fresh);
      notify.ok("تنظیمات همگام‌سازی ذخیره شد.");
      await overview.reloadSync();
    } catch (err) {
      notify.error(err instanceof ApiRequestError ? err.message : "ذخیره‌ی تنظیمات ممکن نشد.");
    } finally {
      setSavingSync(false);
    }
  }

  async function checkHealth(deep: boolean) {
    setHealthBusy(deep ? "deep" : "shallow");
    setHealthError(null);
    try {
      const result = await apiRequest<HealthResult>(`/api/health${deep ? "?deep=1" : ""}`);
      setHealth(result);
      notify.ok(deep ? "بررسی عمیق انجام شد." : "وضعیت اتصال‌ها به‌روز شد.");
    } catch (err) {
      setHealthError(err instanceof ApiRequestError ? err.message : "بررسی اتصال‌ها ممکن نشد.");
    } finally {
      setHealthBusy(null);
    }
  }

  const env = bundle?.env;
  const drive = bundle?.drive;

  return (
    <>
      <PageHeader
        eyebrow="مدیریت"
        title="تنظیمات"
        subtitle="مخزن‌ها، Vercel Blob/PostgreSQL، وضعیت اتصال‌ها و متغیرهای محیطی. مقدارهای حساس فقط سمت سرور نگه‌داری می‌شوند."
        actions={
          <>
            <Link href="/database" className="btn btn-small">
              <Icon name="database" size={14} />
              وضعیت دیتابیس
            </Link>
            <Link href="/help" className="btn btn-small">
              <Icon name="help" size={14} />
              راهنمای راه‌اندازی
            </Link>
          </>
        }
      />

      <ErrorBanner error={settingsApi.error} onRetry={() => settingsApi.reload()} />

      {!bundle ? (
        settingsApi.error ? null : <LoadingState label="در حال خواندن تنظیمات…" />
      ) : (
        <>
          <div className="settings-grid">
            <section className="card">
              <div className="repo-card-head">
                <div>
                  <h2 className="row" style={{ gap: 7 }}>
                    <Icon name="code" size={16} />
                    مخزن ایجنت همکار
                  </h2>
                  <p className="field-helper">فایل‌های job_*.py اینجا خوانده و کامیت می‌شوند.</p>
                </div>
                <span className="repo-tag">نوشتنی</span>
              </div>
              <RepoFields kind="collab" value={repos.collab} onChange={updateRepo} />
              {repoErrors.collab ? <p className="form-error">{repoErrors.collab}</p> : null}
              <div className="row-between" style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-small btn-ghost"
                  onClick={() => setRepos((prev) => ({ ...prev, collab: bundle.defaults.collab }))}
                >
                  بازگشت به پیش‌فرض
                </button>
                <button type="button" className="btn btn-small btn-primary" onClick={() => saveRepo("collab")} disabled={savingRepo === "collab"}>
                  {savingRepo === "collab" ? <span className="spinner" /> : <Icon name="check" size={13} />}
                  ذخیره
                </button>
              </div>
            </section>

            <section className="card">
              <div className="repo-card-head">
                <div>
                  <h2 className="row" style={{ gap: 7 }}>
                    <Icon name="shield" size={16} />
                    مخزن ایجنت مادر
                  </h2>
                  <p className="field-helper">فقط برای شناخت نسخه‌ی برنامه؛ این پنل در آن کامیت نمی‌کند.</p>
                </div>
                <span className="repo-tag">فقط خواندن</span>
              </div>
              <RepoFields kind="mother" value={repos.mother} onChange={updateRepo} />
              {repoErrors.mother ? <p className="form-error">{repoErrors.mother}</p> : null}
              <div className="row-between" style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-small btn-ghost"
                  onClick={() => setRepos((prev) => ({ ...prev, mother: bundle.defaults.mother }))}
                >
                  بازگشت به پیش‌فرض
                </button>
                <button type="button" className="btn btn-small" onClick={() => saveRepo("mother")} disabled={savingRepo === "mother"}>
                  {savingRepo === "mother" ? <span className="spinner" /> : <Icon name="check" size={13} />}
                  ذخیره
                </button>
              </div>
            </section>

            <section className="card">
              <div className="card-head">
                <h2 className="row" style={{ gap: 7 }}>
                  <Icon name="shield" size={16} />
                  وضعیت اتصال‌ها
                </h2>
                <div className="actions-inline">
                  <button type="button" className="btn btn-small" onClick={() => checkHealth(false)} disabled={Boolean(healthBusy)}>
                    {healthBusy === "shallow" ? <span className="spinner" /> : <Icon name="refresh" size={13} />}
                    بررسی
                  </button>
                  <button type="button" className="btn btn-small" onClick={() => checkHealth(true)} disabled={Boolean(healthBusy)}>
                    {healthBusy === "deep" ? <span className="spinner" /> : <Icon name="external" size={13} />}
                    بررسی عمیق
                  </button>
                </div>
              </div>
              {healthError ? <p className="form-error">{healthError}</p> : null}
              <div className="status-list">
                {health
                  ? health.checks.map((check) => (
                      <div className="status-row" key={check.name}>
                        <span className={`status-mark ${check.ok ? "is-ok" : check.optional ? "is-warn" : "is-danger"}`} />
                        <div className="status-row-body">
                          <div className="status-row-title">{check.name}</div>
                          <div className="status-row-note">{check.message}</div>
                          {check.hint && !check.ok ? <div className="status-row-note" style={{ color: "var(--warn)" }}>{check.hint}</div> : null}
                        </div>
                        <span className="field-helper">{check.ok ? "سالم" : check.optional ? "اختیاری" : "نیازمند بررسی"}</span>
                      </div>
                    ))
                  : env
                    ? [
                        { name: "توکن گیت‌هاب", ok: env.githubToken, note: env.githubToken ? "تنظیم شده" : "تنظیم نشده" },
                        { name: "ذخیره تصاویر", ok: true, note: "Vercel Blob + PostgreSQL؛ وضعیت واقعی را با دکمه بررسی ببینید" },
                        { name: "کد مدیریت", ok: env.passcode, note: env.passcode ? "فعال" : "بدون رمز" },
                      ].map((row) => (
                        <div className="status-row" key={row.name}>
                          <span className={`status-mark ${row.ok ? "is-ok" : "is-warn"}`} />
                          <div className="status-row-body">
                            <div className="status-row-title">{row.name}</div>
                            <div className="status-row-note mono" dir="auto">{row.note}</div>
                          </div>
                        </div>
                      ))
                    : null}
              </div>
              {health ? <p className="field-helper" style={{ marginTop: 6 }}>آخرین بررسی: {formatJalaliDateTime(health.checkedAt, true)}</p> : null}
            </section>

            <section className="card full" id="secrets">
              <div className="card-head">
                <h2 className="row" style={{ gap: 7 }}>
                  <Icon name="terminal" size={16} />
                  متغیرهای محیطی و کلیدها
                </h2>
                <span className={`status-chip ${env?.githubToken ? "is-ok" : "is-warn"}`}>
                  <span className="dot" />
                  {env?.githubToken ? "توکن تنظیم شده" : "توکن تنظیم نشده"}
                </span>
              </div>
              <p className="field-helper">
                هیچ‌کدام از این مقدارها در فرانت‌اند یا مخزن ذخیره نمی‌شوند. در Vercel از مسیر Project → Settings → Environment Variables ثبت و سپس Redeploy کنید.
              </p>
              <div className="secrets-stack" style={{ marginTop: 10 }}>
                <SecretRow
                  label="توکن گیت‌هاب (نوشتن در مخزن همکار)"
                  present={Boolean(env?.githubToken)}
                  command="Vercel: GITHUB_TOKEN"
                  helper="کلاسیک یا fine-grained با دسترسی Contents: Read and write روی Windows-Agent-hamkar."
                />
                <SecretRow
                  label="کد مدیریت (ورود)"
                  present={Boolean(env?.passcode)}
                  command="Vercel: MANAGER_PASSCODE"
                  helper="اگر تنظیم نشود، سایت بدون رمز باز است. برای محیط عمومی حتماً تنظیم کنید."
                />
                <SecretRow
                  label="کلید امضای نشست (اختیاری)"
                  present={Boolean(env?.authSecret)}
                  command="Vercel: AUTH_SECRET"
                  helper="طولانی و تصادفی؛ اگر خالی باشد از کد مدیریت استفاده می‌شود."
                />
              </div>
            </section>

            <section className="card">
              <div className="card-head"><h2 className="row" style={{ gap: 7 }}><Icon name="image" size={16} />ذخیره تصاویر Vercel</h2><StatusChip status="success" label="Blob + PostgreSQL" /></div>
              <ol className="steps"><li><strong>Blob Store</strong>در تب Storage پروژه، Vercel Blob بسازید و به همین Project متصل کنید.</li><li><strong>متغیر سرور</strong>وجود <span className="mono">BLOB_READ_WRITE_TOKEN</span> را بررسی و Redeploy کنید.</li><li><strong>Agent API</strong>ایجنت فقط <span className="mono">/api/agent/screenshots</span> را با Agent Key صدا می‌زند؛ Blob Token هرگز داخل Agent قرار نمی‌گیرد.</li></ol>
              <p className="feedback">Google Drive بازنشسته شده است؛ تصویر در Blob و متادیتا و گزارش در PostgreSQL ذخیره می‌شود.</p>
            </section>

            <section className="card">
              <div className="card-head">
                <h2 className="row" style={{ gap: 7 }}>
                  <Icon name="database" size={16} />
                  داده‌ها و نسخه
                </h2>
              </div>
              <dl className="kv">
                <dt>کدها</dt>
                <dd>{faNumber(bundle.data.jobs)}</dd>
                <dt>اجراها</dt>
                <dd>{faNumber(bundle.data.runs)}</dd>
                <dt>خطاها</dt>
                <dd>{faNumber(bundle.data.errors)}</dd>
                <dt>پرامپت‌ها</dt>
                <dd>{faNumber(bundle.data.prompts)}</dd>
                <dt>رویدادها</dt>
                <dd>{faNumber(bundle.data.events)}</dd>
                <dt>Vercel Project</dt>
                <dd className="mono" dir="ltr">{env?.workerName}</dd>
                <dt>نسخه</dt>
                <dd className="mono" dir="ltr">{bundle.version}</dd>
              </dl>
              <div className="callout" style={{ marginTop: 10 }}>
                <strong>PostgreSQL با Prisma مدیریت می‌شود.</strong> Store را یک‌بار در Vercel متصل کنید؛ <span className="mono">prisma migrate deploy</span> ساختار را هنگام Build اعمال می‌کند.
              </div>
              {!env?.passcode ? (
                <p className="form-error" style={{ marginTop: 8 }}>
                  <Icon name="alert" size={13} />
                  کد مدیریت تنظیم نشده؛ آدرس عمومی سایت بدون رمز باز است.
                </p>
              ) : null}
            </section>
          </div>

          <Banner tone="info" title="این تنظیمات چه چیزی را عوض می‌کند؟">
            مخزن‌ها بلافاصله در خواندن و کامیت بعدی استفاده می‌شوند. تغییر همگام‌سازی روی چرخه‌ی خودکار همین پنل اثر
            دارد؛ کنترل واقعی اجرای کدها در دست انسان روی برنامه‌ی ویندوز است (کلید خودکار/دستی در تب مغز ایجنت).
          </Banner>
        </>
      )}
    </>
  );
}

function RepoFields({
  kind,
  value,
  onChange,
}: {
  kind: RepoKind;
  value: RepoConfig;
  onChange: (kind: RepoKind, field: keyof RepoConfig, value: string) => void;
}) {
  return (
    <div className="stack-sm">
      <div className="field">
        <label htmlFor={`${kind}-owner`}>مالک</label>
        <input
          id={`${kind}-owner`}
          className="input ltr"
          dir="ltr"
          value={value.owner}
          onChange={(e) => onChange(kind, "owner", e.target.value)}
          placeholder="soheylfriend-MAJIDgit"
          spellCheck={false}
        />
      </div>
      <div className="field">
        <label htmlFor={`${kind}-repo`}>مخزن</label>
        <input
          id={`${kind}-repo`}
          className="input ltr"
          dir="ltr"
          value={value.repo}
          onChange={(e) => onChange(kind, "repo", e.target.value)}
          placeholder="Windows-Agent-hamkar"
          spellCheck={false}
        />
      </div>
      <div className="field">
        <label htmlFor={`${kind}-branch`}>شاخه</label>
        <input
          id={`${kind}-branch`}
          className="input ltr"
          dir="ltr"
          value={value.branch}
          onChange={(e) => onChange(kind, "branch", e.target.value)}
          placeholder="arena/..."
          spellCheck={false}
        />
        <span className="field-helper">نام شاخه می‌تواند اسلش داشته باشد؛ همان‌طور که در گیت‌هاب است بنویسید.</span>
      </div>
    </div>
  );
}

function SecretRow({
  label,
  present,
  command,
  helper,
}: {
  label: string;
  present: boolean;
  command: string;
  helper: string;
}) {
  return (
    <div>
      <div className="secret-label">
        <span className={`status-mark ${present ? "is-ok" : "is-warn"}`} />
        {label}
        <span className="chip chip-tiny" style={{ marginInlineStart: "auto" }}>
          {present ? "تنظیم شده" : "تنظیم نشده"}
        </span>
      </div>
      <div className="secret-row">
        <span>{command}</span>
        <CopyButton text={command} label="کپی" />
      </div>
      <p className="field-helper" style={{ marginTop: 3 }}>
        {helper}
      </p>
    </div>
  );
}
