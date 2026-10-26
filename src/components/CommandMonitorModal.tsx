"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { faNumber, formatJalaliDateTime } from "@/lib/jalali";

type CommandStatus = "pending" | "claimed" | "waiting_confirmation" | "running" | "succeeded" | "failed" | "cancelled" | "timed_out" | "rejected";
type EventLevel = "debug" | "info" | "warning" | "error" | "fatal";

interface HumanIntervention {
  eventId: number;
  reason: string;
  message: string;
  guidance?: string;
  artifactPath?: string;
  artifactPaths?: string[];
  requestId?: string;
}

interface Detail {
  command: {
    id: string;
    title: string;
    type: string;
    status: CommandStatus;
    requiresConfirmation: boolean;
    autoStopOnAnomaly: boolean;
    timeoutSeconds: number;
    noProgressSeconds: number;
    createdAt: string;
    completedAt: string | null;
    cancelRequestedAt: string | null;
    cancelReason: string | null;
    error: string | null;
  };
  events: Array<{
    id: number;
    seq: number;
    stage: string;
    level: EventLevel;
    message: string;
    createdAt: string;
  }>;
  artifacts: Array<{
    id: string;
    kind: string;
    stage: string | null;
    name: string;
    driveFileId: string | null;
    driveUrl: string | null;
    createdAt: string;
  }>;
  anomaly: { detected: boolean; shouldStop: boolean; reasons: string[]; staleSeconds: number | null };
}

const finalStates: CommandStatus[] = ["succeeded", "failed", "cancelled", "timed_out", "rejected"];
const statusText: Record<CommandStatus, string> = {
  pending: "در صف دریافت",
  claimed: "دریافت‌شده",
  waiting_confirmation: "در انتظار تأیید ویندوز",
  running: "در حال اجرا",
  succeeded: "موفق",
  failed: "ناموفق",
  cancelled: "متوقف‌شده",
  timed_out: "پایان زمان مجاز",
  rejected: "ردشده در ویندوز",
};

async function parseResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & { error?: { message?: string; hint?: string } };
  if (!response.ok) {
    throw new Error([body.error?.message, body.error?.hint].filter(Boolean).join(" ") || "دریافت وضعیت فرمان ممکن نشد.");
  }
  return body;
}

const INTERVENTION_REQUIRED_PREFIX = "SERVICE_HUMAN_INTERVENTION_REQUIRED:";
const INTERVENTION_CLEARED_PREFIX = "SERVICE_HUMAN_INTERVENTION_CLEARED:";

function artifactStageLabel(stage: string | null, kind: string): string {
  const labels: Record<string, string> = {
    "ocr-before-input": "بررسی صفحه پیش از ورود متن",
    "ocr-composer": "پیدا کردن کادر پرامپت",
    "prompt-01-browser-foreground": "فعال بودن مرورگر",
    "prompt-02-composer-ready": "آماده بودن کادر پرامپت",
    "prompt-03-try1-focused": "فوکوس روی کادر پرامپت",
    "prompt-03-try1-after-input": "پس از ورود متن",
    "prompt-03-try1-verified": "تأیید حضور متن",
    "prompt-04-before-submit": "پیش از ارسال پرامپت",
    "prompt-05-after-submit": "پس از ارسال پرامپت",
    "prompt-05-submit-blocked": "توقف امن پیش از ارسال",
    "ocr-completion": "بررسی پایان پاسخ",
    "ocr-before-result-confirmation": "بررسی پیش از تأیید نتیجه",
    "result-confirmation-before": "پیش از انتخاب Yes",
    "result-confirmation-after": "پس از انتخاب Yes",
    "failure-report": "گزارش خطا",
    "failure-screenshot": "تصویر لحظه خطا",
  };
  if (stage && labels[stage]) return labels[stage];
  const attempt = stage?.match(/^prompt-03-try(\d+)-(focused|after-input|verified|unverified)$/);
  if (attempt) {
    const action = attempt[2] === "focused"
      ? "فوکوس کادر"
      : attempt[2] === "after-input"
        ? "پس از ورود متن"
        : attempt[2] === "verified"
          ? "تأیید موفق متن"
          : "متن تأیید نشد";
    return `تلاش ${attempt[1]} ـ ${action}`;
  }
  if (stage?.startsWith("ocr-")) return "بررسی دیداری OCR";
  if (stage?.startsWith("prompt-")) return "مرحله ورود یا ارسال پرامپت";
  return kind === "log" ? "گزارش مرحله‌ای" : "تصویر مرحله‌ای";
}

function currentHumanIntervention(detail: Detail | null): HumanIntervention | null {
  if (!detail) return null;
  let active: HumanIntervention | null = null;
  for (const event of detail.events) {
    if (event.message.startsWith(INTERVENTION_CLEARED_PREFIX)) {
      active = null;
      continue;
    }
    if (!event.message.startsWith(INTERVENTION_REQUIRED_PREFIX)) continue;
    const raw = event.message.slice(INTERVENTION_REQUIRED_PREFIX.length).trim();
    try {
      const parsed = JSON.parse(raw) as Partial<HumanIntervention>;
      active = {
        eventId: event.id,
        reason: String(parsed.reason || "arena_automation_failure"),
        message: String(parsed.message || "اجرای Arena به مداخله انسانی نیاز دارد."),
        guidance: parsed.guidance ? String(parsed.guidance) : undefined,
        artifactPath: parsed.artifactPath ? String(parsed.artifactPath) : undefined,
        artifactPaths: Array.isArray(parsed.artifactPaths) ? parsed.artifactPaths.map(String) : undefined,
        requestId: parsed.requestId ? String(parsed.requestId) : undefined,
      };
    } catch {
      active = {
        eventId: event.id,
        reason: "arena_automation_failure",
        message: raw || "اجرای Arena به مداخله انسانی نیاز دارد.",
      };
    }
  }
  return active;
}

export function CommandMonitorModal({ commandId, onClose }: { commandId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [dismissedInterventionId, setDismissedInterventionId] = useState<number | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const eventCount = detail?.events.length ?? 0;
  const humanIntervention = currentHumanIntervention(detail);
  const showHumanIntervention = humanIntervention && humanIntervention.eventId !== dismissedInterventionId;

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/commands/${encodeURIComponent(commandId)}`, { cache: "no-store" });
      setDetail(await parseResponse<Detail>(response));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "خطای ناشناخته در پایش فرمان");
    }
  }, [commandId]);

  useEffect(() => {
    setDismissedInterventionId(null);
  }, [commandId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 1500);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight, behavior: "smooth" });
  }, [eventCount]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onClose]);

  async function cancel() {
    setBusy(true);
    try {
      const response = await fetch(`/api/commands/${encodeURIComponent(commandId)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "توقف دستی توسط مدیر از پنجره پایش" }),
      });
      setDetail(await parseResponse<Detail>(response));
      setConfirmStop(false);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ثبت درخواست توقف ممکن نشد.");
    } finally {
      setBusy(false);
    }
  }

  function downloadEvidence() {
    if (!detail) return;
    const payload = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      command: detail.command,
      events: detail.events,
      artifacts: detail.artifacts,
      anomaly: detail.anomaly,
    };
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `command_evidence_${commandId}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function toggleAutoStop(enabled: boolean) {
    setBusy(true);
    try {
      const response = await fetch(`/api/commands/${encodeURIComponent(commandId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoStopOnAnomaly: enabled }),
      });
      setDetail(await parseResponse<Detail>(response));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تغییر توقف خودکار ممکن نشد.");
    } finally {
      setBusy(false);
    }
  }

  const command = detail?.command;
  const isFinal = command ? finalStates.includes(command.status) : false;
  const connectionOnlyWarning = command?.status === "succeeded"
    && Boolean(detail?.anomaly.reasons.length)
    && (detail?.anomaly.reasons ?? []).every((reason) => reason.startsWith("مسیر ارتباط Windows Agent با API مدیریت"));
  const progress = command?.status === "pending" ? 8 : command?.status === "claimed" || command?.status === "waiting_confirmation" ? 28 : command?.status === "running" ? 58 : 100;

  return (
    <div className="command-modal-backdrop" role="presentation">
      <section className="command-modal" role="dialog" aria-modal="true" aria-labelledby="command-monitor-title">
        <header className="command-modal-head">
          <div>
            <span className="eyebrow">مرکز فرمان ویندوز</span>
            <h2 id="command-monitor-title">{command?.title ?? "در حال دریافت فرمان…"}</h2>
            <code dir="ltr">{commandId}</code>
          </div>
          <button className="command-close" type="button" onClick={onClose} aria-label="بستن پنجره پایش">×</button>
        </header>

        {showHumanIntervention ? (
          <div className="human-intervention-backdrop" role="presentation">
            <section className="human-intervention-modal" role="alertdialog" aria-modal="true" aria-labelledby="human-intervention-title">
              <span className="human-intervention-icon" aria-hidden="true">!</span>
              <div>
                <span className="eyebrow">توقف امن اتوماسیون</span>
                <h3 id="human-intervention-title">نیاز به مداخله انسانی</h3>
                <p>{humanIntervention.message}</p>
                <p className="human-intervention-guidance">
                  {humanIntervention.reason === "security_verification"
                    ? "به پنجره Arena بروید و چالش ضدربات را دستی کامل کنید. اتوماسیون در این فاصله هیچ کلیک، کلید یا Enter نمی‌فرستد و پس از رفع چالش از checkpoint امن ادامه می‌دهد."
                    : humanIntervention.guidance || "اجرای خودکار متوقف شده است. تصاویر مرحله‌ای و گزارش خطا را بررسی کنید و پس از رفع مشکل فرمان تازه‌ای بسازید."}
                </p>
                {humanIntervention.requestId ? <code dir="ltr">{humanIntervention.requestId}</code> : null}
                {humanIntervention.artifactPath ? <small dir="ltr">{humanIntervention.artifactPath}</small> : null}
                {humanIntervention.artifactPaths?.map((path) => <small dir="ltr" key={path}>{path}</small>)}
              </div>
              <div className="human-intervention-actions">
                {humanIntervention.reason === "security_verification" && !isFinal ? (
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => {
                      setDismissedInterventionId(humanIntervention.eventId);
                      void load();
                    }}
                  >
                    چالش را حل کردم؛ ادامه پایش
                  </button>
                ) : null}
                <button type="button" className="button secondary" disabled={!detail} onClick={downloadEvidence}>دانلود گزارش شواهد</button>
                {!isFinal ? <button type="button" className="button danger" disabled={busy} onClick={() => void cancel()}>توقف امن اجرا</button> : null}
                <button type="button" className="button secondary" onClick={() => setDismissedInterventionId(humanIntervention.eventId)}>
                  {isFinal ? "بستن پیام" : "ادامه پایش در پس‌زمینه"}
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {error ? <div className="command-alert command-alert-error" role="alert">{error}</div> : null}
        {detail?.anomaly.detected ? (
          <div className={`command-alert ${detail.anomaly.shouldStop ? "command-alert-error" : "command-alert-warning"}`} role="alert">
            <strong>{connectionOnlyWarning ? "اجرای موفق با هشدار ارتباطی" : "رفتار غیرعادی تشخیص داده شد"}</strong>
            {detail.anomaly.reasons.map((reason) => <span key={reason}>{reason}</span>)}
          </div>
        ) : null}

        <div className="command-summary">
          <div className={`command-status status-${command?.status ?? "pending"}`}>
            <span className="pulse-dot" aria-hidden="true" />
            {command ? statusText[command.status] : "در حال اتصال"}
          </div>
          <div className="command-progress" aria-label={`پیشرفت ${faNumber(progress)} درصد`}>
            <span style={{ width: `${progress}%` }} />
          </div>
          <div className="command-policies">
            <span>سیاست اجرا: حالت دستی/خودکار خود Windows Agent</span>
            <label className="command-switch">
              <input
                type="checkbox"
                checked={command?.autoStopOnAnomaly ?? true}
                disabled={!command || busy || isFinal}
                onChange={(event) => void toggleAutoStop(event.target.checked)}
              />
              توقف خودکار در خطای بحرانی، پایان زمان یا توقف پیشرفت
            </label>
            {command ? <span>حد اجرا: {faNumber(command.timeoutSeconds)} ثانیه · بی‌پیشرفتی: {faNumber(command.noProgressSeconds)} ثانیه</span> : null}
          </div>
        </div>

        <div className="command-monitor-grid">
          <section className="command-panel" aria-labelledby="command-events-title">
            <div className="command-panel-title">
              <h3 id="command-events-title">گزارش زنده مرحله‌ها</h3>
              <span>{faNumber(detail?.events.length ?? 0)} رخداد</span>
            </div>
            <div className="command-timeline" ref={timelineRef} aria-live="polite">
              {!detail?.events.length ? <p className="command-empty">در انتظار نخستین گزارش Windows Agent…</p> : null}
              {detail?.events.map((event) => (
                <article className={`command-event level-${event.level}`} key={event.id}>
                  <div className="command-event-marker" aria-hidden="true" />
                  <div>
                    <div className="command-event-meta">
                      <strong>{event.stage}</strong>
                      <time dateTime={event.createdAt}>{formatJalaliDateTime(event.createdAt, true)}</time>
                    </div>
                    <p>{event.message}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="command-panel command-artifacts" aria-labelledby="command-artifacts-title">
            <div className="command-panel-title">
              <h3 id="command-artifacts-title">تصویرهای مرحله‌ای</h3>
              <span>{faNumber(detail?.artifacts.length ?? 0)} مورد</span>
            </div>
            <p className="command-storage-note">فقط نام و شناسه/لینک در D1 است؛ بایت تصویر منحصراً در Google Drive می‌ماند.</p>
            <div className="command-artifact-list">
              {!detail?.artifacts.length ? <p className="command-empty">هنوز تصویری گزارش نشده است.</p> : null}
              {detail?.artifacts.map((artifact) => (
                <article className="command-artifact" key={artifact.id}>
                  <div><strong>{artifact.name}</strong><span>{artifactStageLabel(artifact.stage, artifact.kind)}</span></div>
                  {artifact.driveUrl ? <a href={artifact.driveUrl} target="_blank" rel="noreferrer">بازکردن در Drive</a> : <span className="artifact-pending">در انتظار Drive</span>}
                </article>
              ))}
            </div>
          </section>
        </div>

        {command?.error ? <div className="command-alert command-alert-error"><strong>شرح شکست</strong><span>{command.error}</span></div> : null}
        <footer className="command-modal-actions">
          {!isFinal && !command?.cancelRequestedAt ? (
            confirmStop ? (
              <div className="command-stop-confirm" role="alert">
                <span>Windows Agent فرایند و فرزندانش را متوقف کند؟</span>
                <button className="button danger" type="button" disabled={busy} onClick={() => void cancel()}>{busy ? "در حال ثبت…" : "بله، متوقف شود"}</button>
                <button className="button secondary" type="button" disabled={busy} onClick={() => setConfirmStop(false)}>انصراف</button>
              </div>
            ) : <button className="button danger" type="button" onClick={() => setConfirmStop(true)}>توقف اجرای ویندوز</button>
          ) : command?.cancelRequestedAt && !isFinal ? <span className="command-cancel-pending">درخواست توقف ثبت شد؛ منتظر تأیید Windows Agent…</span> : null}
          <button className="button secondary" type="button" disabled={!detail} onClick={downloadEvidence}>دانلود گزارش شواهد</button>
          <button className="button secondary" type="button" onClick={onClose}>{isFinal ? "بستن" : "بستن و ادامه در پس‌زمینه"}</button>
        </footer>
      </section>
    </div>
  );
}
