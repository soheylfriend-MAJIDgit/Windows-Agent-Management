"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiRequestError, postJson, useApi } from "@/hooks/useApi";
import { Banner, ErrorBanner, LoadingState, PageHeader, StatusChip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/ToastProvider";
import { faNumber, formatJalaliDateTime, relativeFa } from "@/lib/jalali";

interface DatabaseTable {
  name: string;
  label: string;
  ready: boolean;
  rows: number;
}

interface DatabaseStatus {
  connected: boolean;
  binding: string;
  engine: string;
  schemaVersion: number;
  schemaReady: boolean;
  tables: DatabaseTable[];
  tableCount: number;
  indexCount: number;
  totalRows: number;
  latestActivityAt: string | null;
  latencyMs: number;
  checkedAt: string;
  note: string;
}

interface AgentConnectionKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  expiresAt: string | null;
}

interface ManagedAgent {
  id: string;
  keyId: string;
  name: string;
  platform: string;
  version: string | null;
  commitSha: string | null;
  status: "online" | "offline";
  reportedStatus: string;
  message: string | null;
  lastSeenAt: string;
}

interface AgentConnectionTest {
  id: string;
  keyId: string;
  keyName: string | null;
  keyPrefix: string | null;
  status: "pending" | "delivered" | "succeeded" | "failed" | "cancelled" | "expired";
  requestMessage: string;
  expectedReply: string;
  replyMessage: string | null;
  createdAt: string;
  deliveredAt: string | null;
  respondedAt: string | null;
  expiresAt: string;
}

interface AgentConnectionBundle {
  expectedReply: string;
  keys: AgentConnectionKey[];
  agents: ManagedAgent[];
  tests: AgentConnectionTest[];
  checkedAt: string;
}

export default function DatabasePage() {
  const status = useApi<DatabaseStatus>("/api/database", { refreshMs: 60_000 });
  const connection = useApi<AgentConnectionBundle>("/api/agent-tests", { refreshMs: 5_000 });
  const notify = useToast();
  const [selectedKey, setSelectedKey] = useState("");
  const [startingTest, setStartingTest] = useState(false);
  const db = status.data;

  useEffect(() => {
    if (!connection.data?.keys.length) {
      setSelectedKey("");
      return;
    }
    if (!connection.data.keys.some((key) => key.id === selectedKey)) {
      setSelectedKey(connection.data.keys[0].id);
    }
  }, [connection.data, selectedKey]);

  async function startConnectionTest() {
    if (!selectedKey) {
      notify.error("ابتدا یک کلید فعال با دسترسی فرمان و رخداد بسازید.");
      return;
    }
    setStartingTest(true);
    try {
      const fresh = await postJson<AgentConnectionBundle>("/api/agent-tests", { keyId: selectedKey });
      connection.setData(fresh);
      notify.ok("درخواست تست در PostgreSQL ثبت شد؛ منتظر پاسخ ایجنت ویندوز هستیم.");
    } catch (err) {
      notify.error(err instanceof ApiRequestError ? err.message : "شروع تست اتصال ممکن نشد.");
    } finally {
      setStartingTest(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="مرکز فرماندهی"
        title="پایگاه داده و اتصال ویندوز"
        subtitle="سلامت PostgreSQL/Prisma، Heartbeat ایجنت‌ها و تست رفت‌وبرگشت واقعی بین سایت و Windows Agent."
        actions={
          <button
            type="button"
            className="btn btn-small"
            onClick={() => status.reload()}
            disabled={status.refreshing}
          >
            {status.refreshing ? <span className="spinner" /> : <Icon name="refresh" size={14} />}
            بررسی دوباره
          </button>
        }
      />

      <ErrorBanner error={status.error} onRetry={() => status.reload()} />

      {!db ? (
        status.error ? null : <LoadingState label="در حال بررسی PostgreSQL…" />
      ) : (
        <>
          <Banner
            tone={db.connected && db.schemaReady ? "ok" : "danger"}
            icon="database"
            title={db.connected && db.schemaReady ? "PostgreSQL متصل و آماده است" : "PostgreSQL نیازمند بررسی است"}
            actions={
              <Link href="/settings" className="btn btn-small">
                <Icon name="settings" size={13} />
                تنظیمات
              </Link>
            }
          >
            {db.connected && db.schemaReady
              ? `binding با نام ${db.binding} پاسخ داد و هر ${faNumber(db.tableCount)} جدول برنامه آماده‌اند.`
              : "binding یا یکی از جدول‌های ضروری آماده نیست."}
          </Banner>

          <div className="db-summary-grid" aria-label="خلاصه‌ی وضعیت پایگاه داده">
            <DatabaseMetric
              icon="database"
              label="وضعیت اتصال"
              value={db.connected ? "متصل" : "قطع"}
              note={`زمان پاسخ ${faNumber(db.latencyMs)} میلی‌ثانیه`}
              ok={db.connected}
            />
            <DatabaseMetric
              icon="layers"
              label="ساختار دیتابیس"
              value={`${faNumber(db.tableCount)} جدول`}
              note={`${faNumber(db.indexCount)} ایندکس · نسخه ${faNumber(db.schemaVersion)}`}
              ok={db.schemaReady}
            />
            <DatabaseMetric
              icon="report"
              label="کل رکوردها"
              value={faNumber(db.totalRows)}
              note="مجموع جدول‌های برنامه"
              ok
            />
            <DatabaseMetric
              icon="clock"
              label="آخرین فعالیت"
              value={db.latestActivityAt ? relativeFa(db.latestActivityAt) : "هنوز ثبت نشده"}
              note={db.latestActivityAt ? formatJalaliDateTime(db.latestActivityAt, true) : "دیتابیس تازه و آماده است"}
              ok
            />
          </div>

          <AgentConnectionPanel
            data={connection.data}
            error={connection.error}
            selectedKey={selectedKey}
            onSelectKey={setSelectedKey}
            onStart={startConnectionTest}
            starting={startingTest}
            refreshing={connection.refreshing}
            onRefresh={() => connection.reload()}
          />

          <div className="db-layout">
            <section className="card">
              <div className="card-head">
                <h2 className="row" style={{ gap: 7 }}>
                  <Icon name="database" size={16} />
                  مشخصات اتصال
                </h2>
                <StatusChip status={db.connected ? "success" : "error"} label={db.connected ? "سالم" : "قطع"} />
              </div>
              <dl className="kv">
                <dt>موتور</dt>
                <dd className="mono" dir="ltr">{db.engine}</dd>
                <dt>نام binding</dt>
                <dd className="mono" dir="ltr">{db.binding}</dd>
                <dt>ساختار</dt>
                <dd>{db.schemaReady ? "کامل و آماده" : "ناقص"}</dd>
                <dt>آخرین بررسی</dt>
                <dd>{formatJalaliDateTime(db.checkedAt, true)}</dd>
              </dl>
              <p className="field-helper" style={{ marginTop: 10 }}>{db.note}</p>
            </section>

            <section className="card">
              <div className="card-head">
                <h2 className="row" style={{ gap: 7 }}>
                  <Icon name="shield" size={16} />
                  معنی این بررسی
                </h2>
              </div>
              <ul className="db-check-list">
                <li><Icon name="check-circle" size={15} /> binding واقعی PostgreSQL با نام <span className="mono">DB</span> در Worker موجود است.</li>
                <li><Icon name="check-circle" size={15} /> یک Query واقعی روی PostgreSQL اجرا و پاسخ آن خوانده شده است.</li>
                <li><Icon name="check-circle" size={15} /> جدول‌ها با <span className="mono">ensureSchema</span> بررسی و در صورت نیاز ساخته شده‌اند.</li>
                <li><Icon name="lock" size={15} /> هیچ توکن، شناسه یا محتوای حساس در این صفحه نمایش داده نمی‌شود.</li>
              </ul>
            </section>
          </div>

          <section className="card db-tables-card">
            <div className="card-head">
              <h2 className="row" style={{ gap: 7 }}>
                <Icon name="layers" size={16} />
                جدول‌های برنامه
              </h2>
              <span className="field-helper">تعداد رکوردها در لحظه‌ی آخرین بررسی</span>
            </div>
            <div className="db-table-list">
              {db.tables.map((table) => (
                <div className="db-table-row" key={table.name}>
                  <span className={`status-mark ${table.ready ? "is-ok" : "is-danger"}`} aria-hidden="true" />
                  <div className="db-table-name">
                    <strong>{table.label}</strong>
                    <code dir="ltr">{table.name}</code>
                  </div>
                  <span className="db-row-count">{faNumber(table.rows)} رکورد</span>
                  <span className="field-helper">{table.ready ? "آماده" : "پیدا نشد"}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}

function AgentConnectionPanel({
  data,
  error,
  selectedKey,
  onSelectKey,
  onStart,
  starting,
  refreshing,
  onRefresh,
}: {
  data: AgentConnectionBundle | null;
  error: ApiRequestError | null;
  selectedKey: string;
  onSelectKey: (value: string) => void;
  onStart: () => void;
  starting: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const latest = data?.tests.find((test) => test.status !== "cancelled") ?? null;
  const statusMeta = latest
    ? {
        pending: { status: "pending", label: "در صف PostgreSQL", text: "ایجنت ویندوز هنوز درخواست تست را دریافت نکرده است." },
        delivered: { status: "running", label: "دریافت‌شده", text: "درخواست به Windows Agent رسیده؛ منتظر پیام پاسخ هستیم." },
        succeeded: { status: "success", label: "اتصال برقرار", text: "پیام صحیح از ایجنت ویندوز دریافت و در PostgreSQL ثبت شد." },
        failed: { status: "error", label: "پاسخ نادرست", text: "ایجنت پاسخ داد، اما متن پاسخ با پیام مورد انتظار یکسان نبود." },
        expired: { status: "error", label: "مهلت تمام شد", text: "تا پنج دقیقه پاسخی از ایجنت ویندوز نرسید." },
        cancelled: { status: "neutral", label: "لغوشده", text: "این تست با تست تازه جایگزین شد." },
      }[latest.status]
    : null;

  return (
    <section className="card agent-connection-card">
      <div className="card-head">
        <div>
          <h2 className="row" style={{ gap: 7 }}>
            <Icon name="terminal" size={17} />
            تست اتصال ایجنت مدیریت و ایجنت ویندوز
          </h2>
          <p className="field-helper">یک رفت‌وبرگشت واقعی از سایت ← PostgreSQL ← ویندوز ← PostgreSQL ← سایت</p>
        </div>
        <div className="row">
          {statusMeta ? <StatusChip status={statusMeta.status} label={statusMeta.label} /> : null}
          <button type="button" className="btn btn-small btn-ghost" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? <span className="spinner" /> : <Icon name="refresh" size={13} />}
            تازه‌سازی
          </button>
        </div>
      </div>

      {error ? <ErrorBanner error={error} onRetry={onRefresh} /> : null}

      <div className="agent-connection-grid">
        <div className="agent-test-control">
          <div className="field">
            <label htmlFor="connection-key">کلید مقصد Windows Agent</label>
            <select
              id="connection-key"
              className="select"
              value={selectedKey}
              onChange={(event) => onSelectKey(event.target.value)}
              disabled={!data?.keys.length || starting}
            >
              {!data?.keys.length ? <option value="">کلید مناسب موجود نیست</option> : null}
              {data?.keys.map((key) => (
                <option value={key.id} key={key.id}>{key.name} — {key.keyPrefix}</option>
              ))}
            </select>
            <span className="field-helper">کلید باید scopeهای commands:read و events:write را داشته باشد.</span>
          </div>

          {!data?.keys.length ? (
            <Banner
              tone="warn"
              title="ابتدا کلید ایجنت بسازید"
              actions={<Link href="/agent-keys" className="btn btn-small"><Icon name="lock" size={13} />کلید ایجنت</Link>}
            >
              بدون کلید فعال، Windows Agent نمی‌تواند درخواست تست را از PostgreSQL دریافت کند.
            </Banner>
          ) : (
            <button type="button" className="btn btn-primary" onClick={onStart} disabled={starting || !selectedKey}>
              {starting ? <span className="spinner" /> : <Icon name="play" size={14} />}
              شروع تست اتصال
            </button>
          )}

          <div className="agent-test-message">
            <span>پیام مورد انتظار از ویندوز</span>
            <strong>«{data?.expectedReply ?? "سلام ایجنت مدیریت."}»</strong>
          </div>
        </div>

        <div className="agent-test-result">
          {!latest ? (
            <div className="agent-test-empty">
              <Icon name="inbox" size={21} />
              <strong>هنوز تستی اجرا نشده است</strong>
              <span>پس از نصب manager_client.py، دکمه‌ی شروع تست را بزنید.</span>
            </div>
          ) : (
            <>
              <div className={`agent-test-status is-${latest.status}`}>
                <Icon name={latest.status === "succeeded" ? "check-circle" : latest.status === "failed" || latest.status === "expired" ? "x-circle" : "clock"} size={22} />
                <div>
                  <strong>{statusMeta?.label}</strong>
                  <span>{statusMeta?.text}</span>
                </div>
              </div>
              <div className="agent-test-flow" aria-label="مراحل تست اتصال">
                <TestStep done title="ثبت در PostgreSQL" note={formatJalaliDateTime(latest.createdAt, true)} />
                <TestStep
                  done={Boolean(latest.deliveredAt)}
                  title="دریافت در ویندوز"
                  note={latest.deliveredAt ? formatJalaliDateTime(latest.deliveredAt, true) : "در انتظار poll ایجنت"}
                />
                <TestStep
                  done={latest.status === "succeeded"}
                  failed={latest.status === "failed"}
                  title="پاسخ به مدیریت"
                  note={latest.replyMessage ?? "منتظر «سلام ایجنت مدیریت.»"}
                />
              </div>
              <dl className="kv agent-test-kv">
                <dt>کلید</dt><dd>{latest.keyName ?? latest.keyPrefix ?? latest.keyId}</dd>
                <dt>شناسه تست</dt><dd className="mono" dir="ltr">{latest.id}</dd>
                <dt>پاسخ</dt><dd>{latest.replyMessage ?? "هنوز نرسیده"}</dd>
              </dl>
            </>
          )}
        </div>
      </div>

      {data?.agents.length ? (
        <div className="managed-agent-strip">
          {data.agents.map((agent) => (
            <div className="managed-agent-pill" key={agent.id}>
              <span className={`status-mark ${agent.status === "online" ? "is-ok" : "is-warn"}`} />
              <div>
                <strong>{agent.name}</strong>
                <span>{agent.status === "online" ? "آنلاین" : "آفلاین"} · {relativeFa(agent.lastSeenAt)}{agent.version ? ` · نسخه ${agent.version}` : ""}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function TestStep({ done, failed = false, title, note }: { done: boolean; failed?: boolean; title: string; note: string }) {
  return (
    <div className={`agent-test-step ${failed ? "is-failed" : done ? "is-done" : ""}`}>
      <span>{failed ? <Icon name="x" size={12} /> : done ? <Icon name="check" size={12} /> : null}</span>
      <div><strong>{title}</strong><small>{note}</small></div>
    </div>
  );
}

function DatabaseMetric({
  icon,
  label,
  value,
  note,
  ok,
}: {
  icon: "database" | "layers" | "report" | "clock";
  label: string;
  value: string;
  note: string;
  ok: boolean;
}) {
  return (
    <section className="card db-metric">
      <span className={`db-metric-icon ${ok ? "is-ok" : "is-danger"}`}><Icon name={icon} size={18} /></span>
      <div>
        <span className="field-helper">{label}</span>
        <strong>{value}</strong>
        <span className="field-helper">{note}</span>
      </div>
    </section>
  );
}
