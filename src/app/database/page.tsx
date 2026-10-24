"use client";

import Link from "next/link";
import { useApi } from "@/hooks/useApi";
import { Banner, ErrorBanner, LoadingState, PageHeader, StatusChip } from "@/components/ui";
import { Icon } from "@/components/icons";
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

export default function DatabasePage() {
  const status = useApi<DatabaseStatus>("/api/database", { refreshMs: 60_000 });
  const db = status.data;

  return (
    <>
      <PageHeader
        eyebrow="ابزار مدیر"
        title="پایگاه داده"
        subtitle="وضعیت اتصال Cloudflare D1، آماده‌بودن ساختار و تعداد رکوردهای هر بخش را اینجا می‌بینید."
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
        status.error ? null : <LoadingState label="در حال بررسی D1…" />
      ) : (
        <>
          <Banner
            tone={db.connected && db.schemaReady ? "ok" : "danger"}
            icon="database"
            title={db.connected && db.schemaReady ? "D1 متصل و آماده است" : "D1 نیازمند بررسی است"}
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
                <li><Icon name="check-circle" size={15} /> binding واقعی D1 با نام <span className="mono">DB</span> در Worker موجود است.</li>
                <li><Icon name="check-circle" size={15} /> یک Query واقعی روی D1 اجرا و پاسخ آن خوانده شده است.</li>
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
