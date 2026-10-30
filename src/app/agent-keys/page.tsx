"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest, ApiRequestError, postJson, useApi } from "@/hooks/useApi";
import { Banner, CopyButton, EmptyState, ErrorBanner, LoadingState, PageHeader, StatusChip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/ToastProvider";
import { faNumber, formatJalaliDateTime, relativeFa } from "@/lib/jalali";

interface ScopeInfo {
  id: string;
  label: string;
}

interface AgentKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  note: string | null;
  status: "active" | "revoked" | "expired";
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

interface AgentKeyBundle {
  keys: AgentKeyItem[];
  availableScopes: ScopeInfo[];
  stats: { total: number; active: number; revoked: number; expired: number };
  generatedKey?: string;
  generatedKeyId?: string;
}

const DEFAULT_SCOPES = [
  "heartbeat:write",
  "events:write",
  "commands:read",
  "results:write",
  "artifacts:write",
  "artifacts:read",
  "reports:read",
];

export default function AgentKeysPage() {
  const keysApi = useApi<AgentKeyBundle>("/api/agent-keys");
  const notify = useToast();
  const [name, setName] = useState("Windows Agent اصلی");
  const [note, setNote] = useState("پنل ویندوز دستگاه اصلی");
  const [expiresInDays, setExpiresInDays] = useState<string>("never");
  const [scopes, setScopes] = useState<string[]>(DEFAULT_SCOPES);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ id: string; type: "rotate" | "revoke" } | null>(null);
  const [generated, setGenerated] = useState<{ key: string; id: string } | null>(null);
  const [origin, setOrigin] = useState("");
  const registeredKeysRef = useRef<HTMLElement>(null);

  useEffect(() => setOrigin(window.location.origin), []);

  function showRegisteredKeys() {
    registeredKeysRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    registeredKeysRef.current?.focus({ preventScroll: true });
  }

  const bundle = keysApi.data;
  const endpoint = origin ? `${origin}/api/agent` : "/api/agent";
  const configJson = useMemo(
    () =>
      generated
        ? JSON.stringify(
            {
              base_url: endpoint,
              agent_key: generated.key,
              auth_header: "Authorization: Bearer <agent_key>",
              ping_url: `${endpoint}/ping`,
            },
            null,
            2,
          )
        : "",
    [endpoint, generated],
  );

  function toggleScope(id: string) {
    setScopes((current) => (current.includes(id) ? current.filter((scope) => scope !== id) : [...current, id]));
  }

  async function createKey() {
    if (name.trim().length < 2) {
      notify.error("برای کلید یک نام مشخص بنویسید.");
      return;
    }
    if (!scopes.length) {
      notify.error("حداقل یک دسترسی انتخاب کنید.");
      return;
    }
    setBusy("create");
    try {
      const fresh = await postJson<AgentKeyBundle>("/api/agent-keys", {
        action: "create",
        name,
        note,
        scopes,
        expiresInDays,
      });
      keysApi.setData(fresh);
      if (fresh.generatedKey && fresh.generatedKeyId) {
        setGenerated({ key: fresh.generatedKey, id: fresh.generatedKeyId });
      }
      notify.ok("کلید ایجنت ساخته شد؛ همین حالا آن را کپی کنید.");
    } catch (err) {
      notify.error(err instanceof ApiRequestError ? err.message : "ساخت کلید ممکن نشد.");
    } finally {
      setBusy(null);
    }
  }

  async function revoke(key: AgentKeyItem) {
    setBusy(`revoke:${key.id}`);
    try {
      const fresh = await apiRequest<AgentKeyBundle>("/api/agent-keys", {
        method: "DELETE",
        body: JSON.stringify({ id: key.id }),
      });
      keysApi.setData(fresh);
      if (generated?.id === key.id) setGenerated(null);
      setConfirmAction(null);
      notify.ok("کلید غیرفعال شد و درخواست‌های بعدی آن رد می‌شوند.");
    } catch (err) {
      notify.error(err instanceof ApiRequestError ? err.message : "غیرفعال‌کردن کلید ممکن نشد.");
    } finally {
      setBusy(null);
    }
  }

  async function rotate(key: AgentKeyItem) {
    setBusy(`rotate:${key.id}`);
    try {
      const fresh = await postJson<AgentKeyBundle>("/api/agent-keys", { action: "rotate", id: key.id });
      keysApi.setData(fresh);
      if (fresh.generatedKey && fresh.generatedKeyId) {
        setGenerated({ key: fresh.generatedKey, id: fresh.generatedKeyId });
      }
      setConfirmAction(null);
      notify.ok("کلید قبلی غیرفعال و کلید تازه ساخته شد.");
    } catch (err) {
      notify.error(err instanceof ApiRequestError ? err.message : "تعویض کلید ممکن نشد.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="مرکز فرماندهی"
        title="کلید ایجنت"
        subtitle="کلیدهای اتصال Windows Agent به Cloudflare را بسازید، تعویض کنید یا فوراً از کار بیندازید."
        actions={
          <div className="row">
            <button
              type="button"
              className="btn btn-small btn-primary"
              onClick={showRegisteredKeys}
              disabled={!bundle}
              title="نمایش فهرست امن کلیدها؛ مقدار محرمانه کلیدهای قبلی قابل بازیابی نیست"
            >
              <Icon name="layers" size={14} />
              مشاهده کلیدهای ثبت‌شده
            </button>
            <button type="button" className="btn btn-small" onClick={() => keysApi.reload()} disabled={keysApi.refreshing}>
              {keysApi.refreshing ? <span className="spinner" /> : <Icon name="refresh" size={14} />}
              به‌روزرسانی
            </button>
          </div>
        }
      />

      <ErrorBanner error={keysApi.error} onRetry={() => keysApi.reload()} />

      {!bundle ? (
        keysApi.error ? null : <LoadingState label="در حال خواندن کلیدهای ایجنت…" />
      ) : (
        <>
          <Banner tone="info" icon="lock" title="مقدار کامل کلید فقط یک بار نمایش داده می‌شود">
            در D1 فقط اثر انگشت SHA-256 کلید ذخیره می‌شود. کلید کامل را بعد از ساخت در
            <span className="mono" dir="ltr"> manager_secret.bin </span>
            ویندوز نگه دارید. هر زمان لازم بود می‌توانید آن را از همین صفحه غیرفعال یا تعویض کنید.
          </Banner>

          <div className="agent-key-metrics" aria-label="خلاصه‌ی کلیدها">
            <KeyMetric icon="lock" label="کل کلیدها" value={bundle.stats.total} tone="neutral" />
            <KeyMetric icon="check-circle" label="فعال" value={bundle.stats.active} tone="ok" />
            <KeyMetric icon="x-circle" label="غیرفعال" value={bundle.stats.revoked} tone="danger" />
            <KeyMetric icon="clock" label="منقضی" value={bundle.stats.expired} tone="warn" />
          </div>

          {generated ? (
            <section className="card generated-key-card" aria-live="polite">
              <div className="card-head">
                <div>
                  <h2 className="row" style={{ gap: 7 }}>
                    <Icon name="check-circle" size={17} />
                    کلید تازه آماده است
                  </h2>
                  <p className="field-helper">پس از بستن یا بارگذاری دوباره‌ی صفحه، مقدار کامل قابل بازیابی نیست.</p>
                </div>
                <StatusChip status="success" label="نمایش یک‌باره" />
              </div>
              <div className="agent-secret-row">
                <code className="agent-secret" dir="ltr">{generated.key}</code>
                <CopyButton text={generated.key} label="کپی کلید" className="btn btn-small btn-primary" />
              </div>
              <details className="agent-config-details">
                <summary>پیکربندی آماده برای manager_client.py</summary>
                <pre dir="ltr">{configJson}</pre>
                <CopyButton text={configJson} label="کپی JSON" />
              </details>
              <div className="row-between" style={{ marginTop: 12 }}>
                <span className="field-helper">شناسه: <span className="mono">{generated.id}</span></span>
                <button type="button" className="btn btn-small btn-ghost" onClick={() => setGenerated(null)}>
                  <Icon name="x" size={13} />
                  بستن نمایش کلید
                </button>
              </div>
            </section>
          ) : null}

          <div className="agent-key-layout">
            <section className="card agent-key-create">
              <div className="card-head">
                <h2 className="row" style={{ gap: 7 }}>
                  <Icon name="plus" size={16} />
                  ساخت کلید تازه
                </h2>
                <span className="repo-tag">Bearer API Key</span>
              </div>

              <div className="field">
                <label htmlFor="agent-key-name">نام کلید</label>
                <input
                  id="agent-key-name"
                  className="input"
                  value={name}
                  maxLength={80}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="مثلاً Windows Agent اصلی"
                />
              </div>
              <div className="field">
                <label htmlFor="agent-key-note">یادداشت</label>
                <textarea
                  id="agent-key-note"
                  className="textarea"
                  rows={2}
                  value={note}
                  maxLength={300}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="این کلید روی کدام دستگاه استفاده می‌شود؟"
                />
              </div>
              <div className="field">
                <label htmlFor="agent-key-expiry">مدت اعتبار</label>
                <select
                  id="agent-key-expiry"
                  className="select"
                  value={expiresInDays}
                  onChange={(event) => setExpiresInDays(event.target.value)}
                >
                  <option value="never">بدون انقضا؛ تا زمان غیرفعال‌کردن دستی</option>
                  <option value="30">۳۰ روز</option>
                  <option value="90">۹۰ روز</option>
                  <option value="365">یک سال</option>
                </select>
              </div>

              <fieldset className="agent-scope-fieldset">
                <legend>دسترسی‌ها</legend>
                <div className="agent-scope-grid">
                  {bundle.availableScopes.map((scope) => (
                    <label className="agent-scope-option" key={scope.id}>
                      <input
                        type="checkbox"
                        checked={scopes.includes(scope.id)}
                        onChange={() => toggleScope(scope.id)}
                      />
                      <span>
                        <strong>{scope.label}</strong>
                        <code dir="ltr">{scope.id}</code>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <button type="button" className="btn btn-primary" onClick={createKey} disabled={busy === "create"}>
                {busy === "create" ? <span className="spinner" /> : <Icon name="lock" size={15} />}
                ساخت کلید ایجنت
              </button>
            </section>

            <section className="card agent-key-guide">
              <div className="card-head">
                <h2 className="row" style={{ gap: 7 }}>
                  <Icon name="terminal" size={16} />
                  قرارداد اتصال
                </h2>
              </div>
              <ol className="agent-steps">
                <li><span>۱</span><div><strong>کلید را بسازید</strong><p>مقدار کامل را همان لحظه کپی کنید.</p></div></li>
                <li><span>۲</span><div><strong>ذخیره با DPAPI</strong><p>ایجنت مادر آن را در <code>manager_secret.bin</code> قرار می‌دهد.</p></div></li>
                <li><span>۳</span><div><strong>آزمون اتصال</strong><p><code dir="ltr">GET /api/agent/ping</code> با Bearer Token پاسخ واقعی D1 می‌دهد.</p></div></li>
                <li><span>۴</span><div><strong>لغو فوری</strong><p>دکمه‌ی «غیرفعال‌کردن» تمام درخواست‌های بعدی آن کلید را رد می‌کند.</p></div></li>
              </ol>
              <div className="agent-endpoint-box">
                <span>نشانی پایه Control Plane</span>
                <code dir="ltr">{endpoint}</code>
                <CopyButton text={endpoint} label="کپی نشانی" />
              </div>
            </section>
          </div>

          <section
            ref={registeredKeysRef}
            id="registered-agent-keys"
            className="card agent-key-list-card"
            tabIndex={-1}
            aria-labelledby="registered-agent-keys-title"
          >
            <div className="card-head">
              <div>
                <h2 id="registered-agent-keys-title" className="row" style={{ gap: 7 }}>
                  <Icon name="layers" size={16} />
                  کلیدهای ثبت‌شده
                </h2>
                <p className="field-helper">برای امنیت فقط پیشوند، دسترسی‌ها و وضعیت نمایش داده می‌شود؛ مقدار کامل قابل بازیابی نیست.</p>
              </div>
              <span className="field-helper">{faNumber(bundle.keys.length)} کلید</span>
            </div>

            {!bundle.keys.length ? (
              <EmptyState icon="lock" title="هنوز کلیدی ساخته نشده است" text="اولین کلید Windows Agent را از فرم بالا بسازید." />
            ) : (
              <div className="agent-key-list">
                {bundle.keys.map((key) => (
                  <article className={`agent-key-item ${key.status !== "active" ? "is-muted" : ""}`} key={key.id}>
                    <div className="agent-key-main">
                      <div className="row">
                        <strong>{key.name}</strong>
                        <StatusChip
                          status={key.status === "active" ? "success" : key.status === "expired" ? "pending" : "error"}
                          label={key.status === "active" ? "فعال" : key.status === "expired" ? "منقضی" : "غیرفعال"}
                        />
                      </div>
                      <code className="agent-key-prefix" dir="ltr">{key.keyPrefix}</code>
                      {key.note ? <p className="field-helper">{key.note}</p> : null}
                      <div className="agent-key-scope-tags">
                        {key.scopes.map((scope) => <code dir="ltr" key={scope}>{scope}</code>)}
                      </div>
                    </div>
                    <dl className="agent-key-meta">
                      <dt>ساخته‌شده</dt>
                      <dd>{formatJalaliDateTime(key.createdAt, true)}</dd>
                      <dt>آخرین استفاده</dt>
                      <dd>{key.lastUsedAt ? relativeFa(key.lastUsedAt) : "هنوز استفاده نشده"}</dd>
                      <dt>انقضا</dt>
                      <dd>{key.expiresAt ? formatJalaliDateTime(key.expiresAt, true) : "بدون انقضا"}</dd>
                    </dl>
                    <div className="agent-key-actions">
                      {key.status === "active" ? (
                        confirmAction?.id === key.id ? (
                          <div className="agent-key-confirm">
                            <strong>
                              {confirmAction.type === "rotate"
                                ? "کلید فعلی فوراً غیرفعال و کلید تازه صادر شود؟"
                                : "این کلید همین حالا غیرفعال شود؟"}
                            </strong>
                            <div className="row">
                              <button
                                type="button"
                                className={`btn btn-small ${confirmAction.type === "revoke" ? "btn-danger" : "btn-primary"}`}
                                onClick={() => (confirmAction.type === "rotate" ? rotate(key) : revoke(key))}
                                disabled={Boolean(busy)}
                              >
                                {busy ? <span className="spinner" /> : <Icon name="check" size={13} />}
                                تأیید
                              </button>
                              <button type="button" className="btn btn-small btn-ghost" onClick={() => setConfirmAction(null)} disabled={Boolean(busy)}>
                                انصراف
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="btn btn-small"
                              onClick={() => setConfirmAction({ id: key.id, type: "rotate" })}
                              disabled={Boolean(busy)}
                            >
                              <Icon name="refresh" size={13} />
                              تعویض
                            </button>
                            <button
                              type="button"
                              className="btn btn-small btn-danger"
                              onClick={() => setConfirmAction({ id: key.id, type: "revoke" })}
                              disabled={Boolean(busy)}
                            >
                              <Icon name="x-circle" size={13} />
                              غیرفعال‌کردن
                            </button>
                          </>
                        )
                      ) : (
                        <span className="field-helper">این کلید دیگر درخواست معتبر نمی‌سازد.</span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

function KeyMetric({
  icon,
  label,
  value,
  tone,
}: {
  icon: "lock" | "check-circle" | "x-circle" | "clock";
  label: string;
  value: number;
  tone: "neutral" | "ok" | "danger" | "warn";
}) {
  return (
    <section className={`card agent-key-metric is-${tone}`}>
      <span><Icon name={icon} size={17} /></span>
      <div><strong>{faNumber(value)}</strong><small>{label}</small></div>
    </section>
  );
}
