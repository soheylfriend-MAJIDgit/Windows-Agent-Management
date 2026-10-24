"use client";

import { useMemo, useState } from "react";
import { apiRequest, postJson, ApiRequestError, useApi } from "@/hooks/useApi";
import { PageHeader, Banner, ErrorBanner, EmptyState, LoadingState, StatusChip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/ToastProvider";
import { CommandMonitorModal } from "@/components/CommandMonitorModal";
import { faNumber, formatJalaliDateTime } from "@/lib/jalali";

interface Automation {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  target: "windows" | "management" | "both";
  enabled: boolean;
  activeVersionId: string | null;
  activeVersion: number | null;
  sourceSha256: string | null;
  changeSummary: string | null;
  createdBy: string;
  updatedAt: string;
  versionCreatedAt: string | null;
}
interface Version { id: string; version: number; sourceCode?: string; sourceSha256: string; status: string; changeSummary: string | null; createdBy: string; createdAt: string }
interface Detail { automation: Automation; activeVersion: Version | null; versions: Version[] }

export default function AutomationsPage() {
  const catalog = useApi<{ automations: Automation[]; sourceOfTruth: string }>("/api/automations", { refreshMs: 20_000 });
  const notify = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [source, setSource] = useState("");
  const [summary, setSummary] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ApiRequestError | null>(null);
  const [commandId, setCommandId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (catalog.data?.automations ?? []).filter((item) => !needle || `${item.name} ${item.slug} ${item.description ?? ""}`.toLowerCase().includes(needle));
  }, [catalog.data, query]);

  async function select(item: Automation) {
    setSelectedId(item.id);
    setBusy("detail");
    setError(null);
    try {
      const value = await apiRequest<Detail>(`/api/automations/${item.id}`);
      setDetail(value);
      setSource(value.activeVersion?.sourceCode ?? "");
      setSummary("");
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause : new ApiRequestError("خواندن اتوماسیون ممکن نشد."));
    } finally {
      setBusy(null);
    }
  }

  async function saveVersion() {
    if (!detail) return;
    setBusy("save");
    setError(null);
    try {
      const saved = await postJson<{ automation: Automation }>(`/api/automations/${detail.automation.id}`, {
        action: "new_version",
        sourceCode: source,
        changeSummary: summary || "ویرایش از سایت مدیریت",
        activate: true,
      });
      notify.ok("نسخه جدید در D1 ثبت و فعال شد.");
      await catalog.reload({ silent: true });
      await select(saved.automation);
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause : new ApiRequestError("ذخیره نسخه ممکن نشد."));
    } finally {
      setBusy(null);
    }
  }

  async function createAutomation() {
    setBusy("create");
    setError(null);
    try {
      const saved = await postJson<{ automation: Automation }>("/api/automations", {
        slug,
        name,
        description,
        target: "windows",
        sourceCode: source,
        changeSummary: "نسخه نخست در D1",
        activate: true,
      });
      setShowNew(false);
      setName(""); setSlug(""); setDescription(""); setSource("");
      notify.ok("کد اتوماسیون در D1 ساخته شد.");
      await catalog.reload({ silent: true });
      await select(saved.automation);
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause : new ApiRequestError("ساخت اتوماسیون ممکن نشد."));
    } finally {
      setBusy(null);
    }
  }

  async function run(item: Automation) {
    setBusy(`run:${item.id}`);
    setError(null);
    try {
      const value = await postJson<{ commandId: string }>(`/api/automations/${item.id}/run`, {});
      setCommandId(value.commandId);
      notify.ok("فرمان اجرای نسخه فعال ثبت شد.");
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause : new ApiRequestError("اجرای اتوماسیون ممکن نشد."));
    } finally {
      setBusy(null);
    }
  }

  async function toggle(item: Automation) {
    setBusy(`toggle:${item.id}`);
    try {
      await postJson(`/api/automations/${item.id}`, { action: "set_enabled", enabled: !item.enabled });
      await catalog.reload({ silent: true });
      notify.ok(item.enabled ? "اتوماسیون غیرفعال شد." : "اتوماسیون فعال شد.");
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause : new ApiRequestError("تغییر وضعیت ممکن نشد."));
    } finally { setBusy(null); }
  }

  async function importGithub() {
    setBusy("import");
    setError(null);
    try {
      const value = await postJson<{ imported: unknown[]; failed: unknown[] }>("/api/automations/import-github", {});
      notify.ok(`${faNumber(value.imported.length)} فایل به D1 منتقل شد.`);
      if (value.failed.length) notify.error(`${faNumber(value.failed.length)} فایل منتقل نشد؛ نتیجه را بررسی کنید.`);
      await catalog.reload({ silent: true });
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause : new ApiRequestError("انتقال اولیه ممکن نشد."));
    } finally { setBusy(null); }
  }

  return (
    <>
      <PageHeader
        eyebrow="منبع اجرایی D1"
        title="کدهای اتوماسیون"
        subtitle="کدهای Python عملیاتی مستقل از کد پایه ایجنت ویندوز و سایت مدیریت؛ نسخه‌بندی، اجرا و رصد از طریق D1."
        actions={<button className="btn btn-small" type="button" onClick={() => { setShowNew(true); setDetail(null); setSelectedId(null); setSource("#!/usr/bin/env python3\n\ndef main():\n    print(\"automation ready\")\n\nif __name__ == \"__main__\":\n    main()\n"); }}><Icon name="plus" size={14} /> اتوماسیون جدید</button>}
      />

      <Banner tone="info" title="تفکیک کدها">
        منبع اصلی این صفحه Cloudflare D1 است. کد پایه Windows Agent در مخزن مادر و کد پایه سایت مدیریت در مخزن مدیریت باقی می‌ماند. ایجنت همکار برای ساخت و اجرای اتوماسیون‌ها به Git نیاز ندارد.
      </Banner>
      <ErrorBanner error={error ?? catalog.error} onRetry={() => catalog.reload()} />

      <div className="toolbar" style={{ marginTop: 16 }}>
        <div className="search-wrap"><Icon name="search" size={14} /><input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جست‌وجوی اتوماسیون…" /></div>
        <button className="btn btn-small btn-ghost" type="button" disabled={busy === "import"} onClick={() => void importGithub()}>
          <Icon name="github" size={14} /> {busy === "import" ? "در حال انتقال…" : "انتقال اولیه از GitHub"}
        </button>
      </div>

      {catalog.loading && !catalog.data ? <LoadingState label="در حال خواندن کاتالوگ D1…" /> : filtered.length === 0 ? (
        <EmptyState icon="code" title="هنوز کد اتوماسیونی در D1 نیست" text="یک اتوماسیون بسازید یا فایل‌های مخزن قدیمی را یک‌بار به D1 منتقل کنید." />
      ) : (
        <div className="automation-grid">
          {filtered.map((item) => (
            <article className={`card automation-card ${selectedId === item.id ? "is-selected" : ""}`} key={item.id}>
              <div className="card-head"><div><h2>{item.name}</h2><bdi className="mono" dir="ltr">job_{item.slug}.py</bdi></div><StatusChip status={item.enabled ? "success" : "neutral"} label={item.enabled ? "فعال" : "غیرفعال"} /></div>
              <p>{item.description ?? "بدون توضیح"}</p>
              <div className="automation-meta"><span>نسخه {faNumber(item.activeVersion ?? 0)}</span><span>{formatJalaliDateTime(item.updatedAt, true)}</span><code dir="ltr">{item.sourceSha256?.slice(0, 12) ?? "—"}</code></div>
              <div className="actions-inline">
                <button className="btn btn-small" type="button" onClick={() => void select(item)}>مشاهده و ویرایش</button>
                <button className="btn btn-small btn-ghost" type="button" disabled={!item.enabled || busy === `run:${item.id}`} onClick={() => void run(item)}>اجرا در ویندوز</button>
                <button className="btn btn-small btn-ghost" type="button" disabled={busy === `toggle:${item.id}`} onClick={() => void toggle(item)}>{item.enabled ? "غیرفعال‌کردن" : "فعال‌کردن"}</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {(detail || showNew) ? (
        <section className="card automation-editor">
          <div className="card-head"><h2>{showNew ? "ساخت کد اتوماسیون" : `ویرایش ${detail?.automation.name}`}</h2>{!showNew && detail ? <span>نسخه فعال {faNumber(detail.automation.activeVersion ?? 0)}</span> : null}</div>
          {showNew ? <div className="form-grid"><div className="field"><label>نام نمایشی</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div><div className="field"><label>شناسه لاتین</label><input className="input" dir="ltr" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="arena_helper" /></div><div className="field field-wide"><label>توضیح</label><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></div></div> : null}
          <div className="field"><label htmlFor="automation-source">کد Python</label><textarea id="automation-source" className="code-input automation-source" dir="ltr" value={source} onChange={(e) => setSource(e.target.value)} spellCheck={false} /></div>
          <div className="field"><label>شرح تغییر</label><input className="input" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="چه چیزی تغییر کرده است؟" /></div>
          <div className="actions-inline"><button className="btn" type="button" disabled={Boolean(busy)} onClick={() => void (showNew ? createAutomation() : saveVersion())}>{busy === "save" || busy === "create" ? "در حال ثبت…" : "ثبت نسخه فعال در D1"}</button><button className="btn btn-ghost" type="button" onClick={() => { setDetail(null); setShowNew(false); setSelectedId(null); }}>بستن</button></div>
          {detail?.versions.length ? <div className="automation-versions"><h3>تاریخچه نسخه‌ها</h3>{detail.versions.map((version) => <div key={version.id}><span>نسخه {faNumber(version.version)} · {version.status}</span><code dir="ltr">{version.sourceSha256.slice(0, 16)}</code><time>{formatJalaliDateTime(version.createdAt, true)}</time></div>)}</div> : null}
        </section>
      ) : null}

      {commandId ? <CommandMonitorModal commandId={commandId} onClose={() => setCommandId(null)} /> : null}
    </>
  );
}
