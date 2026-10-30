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
    payload: Record<string, unknown>;
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
    mimeType: string | null;
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

function durationLabel(seconds: number): string {
  if (seconds >= 86_400 && seconds % 86_400 === 0) return `${faNumber(seconds / 86_400)} روز`;
  if (seconds >= 3_600 && seconds % 3_600 === 0) return `${faNumber(seconds / 3_600)} ساعت`;
  if (seconds >= 60 && seconds % 60 === 0) return `${faNumber(seconds / 60)} دقیقه`;
  return `${faNumber(seconds)} ثانیه`;
}

function artifactHref(artifact: { driveUrl: string | null; name: string }): string {
  if (artifact.driveUrl) return artifact.driveUrl;
  // نسخه فعلی Windows Agent فقط metadata و نام فایل همگام‌شده را می‌فرستد.
  // تا زمانی که File ID آنلاین گزارش شود، جست‌وجوی دقیق همان نام در Drive یک لینک عملی فراهم می‌کند.
  return `https://drive.google.com/drive/u/0/search?q=${encodeURIComponent(`"${artifact.name}"`)}`;
}

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
  if (stage?.startsWith("agent-report-")) return "گزارش Markdown ایجنت";
  if (stage?.startsWith("ocr-")) return "بررسی دیداری OCR";
  if (stage?.startsWith("prompt-")) return "مرحله ورود یا ارسال پرامپت";
  return kind === "log" || kind === "agent-report" ? "گزارش مرحله‌ای" : "تصویر مرحله‌ای";
}

function timelineMessage(message: string): string {
  if (message.startsWith("SERVICE_AGENT_REPORT_BEGIN:")) {
    try {
      const report = JSON.parse(message.slice("SERVICE_AGENT_REPORT_BEGIN:".length).trim()) as { index?: number; item?: number; chars?: number };
      return `گزارش Markdown شماره ${faNumber(report.index ?? 0)} برای مرحله ${faNumber(report.item ?? 0)} دریافت شد و در حال بایگانی مستقل است (${faNumber(report.chars ?? 0)} نویسه).`;
    } catch {
      return "یک گزارش Markdown تازه از Agent همکار دریافت شد.";
    }
  }
  if (message.startsWith("SERVICE_AGENT_REPORT_END:")) return "دریافت و ثبت کامل نسخه گزارش Markdown پایان یافت.";
  for (const prefix of [INTERVENTION_REQUIRED_PREFIX, "SERVICE_HUMAN_INTERVENTION_WAITING:", INTERVENTION_CLEARED_PREFIX]) {
    if (!message.startsWith(prefix)) continue;
    try {
      const payload = JSON.parse(message.slice(prefix.length).trim()) as { message?: unknown; guidance?: unknown };
      const title = typeof payload.message === "string" ? payload.message : "وضعیت مداخله انسانی تغییر کرد.";
      const guidance = typeof payload.guidance === "string" ? payload.guidance : "";
      return [title, guidance].filter(Boolean).join(" ");
    } catch {
      return "وضعیت مداخله انسانی تغییر کرد؛ جزئیات در پنجره تصمیم مدیر نمایش داده می‌شود.";
    }
  }
  return message;
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
  const visibleEvents = (detail?.events ?? []).filter((event) => !event.message.startsWith("SERVICE_AGENT_REPORT_CHUNK:"));
  const eventCount = visibleEvents.length;
  const imageArtifacts = (detail?.artifacts ?? []).filter((artifact) => artifact.kind === "screenshot" || artifact.mimeType?.startsWith("image/"));
  const reportCount = (detail?.events ?? []).filter((event) => event.message.startsWith("SERVICE_AGENT_REPORT_BEGIN:")).length;
  const monitoringPlan = Array.isArray(detail?.command.payload?.monitoringPlan)
    ? detail.command.payload.monitoringPlan.filter((item): item is string => typeof item === "string")
    : [];
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
    && (detail?.anomaly.reasons ?? []).every((reason) => reason.startsWith("ارسال گزارش از Windows Agent به پنل"));
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
          <div className="command-head-actions">
            <button
              className="button secondary command-report-button"
              type="button"
              onClick={() => window.open(`/commands/${encodeURIComponent(commandId)}/agent-reports`, "_blank", "noopener,noreferrer")}
            >
              گزارشات ایجنت{reportCount ? ` (${faNumber(reportCount)})` : ""}
            </button>
            <button className="command-close" type="button" onClick={onClose} aria-label="بستن پنجره پایش">×</button>
          </div>
        </header>

        {showHumanIntervention ? (
          <div className="human-intervention-backdrop" role="presentation">
            <section className="human-intervention-modal" role="alertdialog" aria-modal="true" aria-labelledby="human-intervention-title">
              <span className="human-intervention-icon" aria-hidden="true">!</span>
              <div>
                <span className="eyebrow">{humanIntervention.reason === "completion_wait_expired" ? "پایش همچنان فعال است" : "توقف امن اتوماسیون"}</span>
                <h3 id="human-intervention-title">{humanIntervention.reason === "completion_wait_expired" ? "ادامه انتظار یا توقف؟" : "نیاز به مداخله انسانی"}</h3>
                <p>{humanIntervention.message}</p>
                <p className="human-intervention-guidance">
                  {humanIntervention.reason === "security_verification"
                    ? "به پنجره Arena بروید و چالش ضدربات را دستی کامل کنید. اتوماسیون در این فاصله هیچ کلیک، کلید یا Enter نمی‌فرستد و پس از رفع چالش از checkpoint امن ادامه می‌دهد."
                    : humanIntervention.reason === "completion_wait_expired"
                      ? "پاسخ هنوز کامل نشده است و پایش همچنان ادامه دارد. اگر زمان کار طبیعی است، پیام را ببندید و منتظر بمانید؛ فقط در صورت نیاز توقف امن را انتخاب کنید."
                      : humanIntervention.guidance || "اجرای خودکار متوقف شده است. تصاویر مرحله‌ای و گزارش خطا را بررسی کنید و پس از رفع مشکل فرمان تازه‌ای بسازید."}
                </p>
                {humanIntervention.requestId ? <code dir="ltr">{humanIntervention.requestId}</code> : null}
                {humanIntervention.artifactPath ? <small dir="ltr">{humanIntervention.artifactPath}</small> : null}
                {humanIntervention.artifactPaths?.map((path) => <small dir="ltr" key={path}>{path}</small>)}
              </div>
              <div className="human-intervention-actions">
                {(humanIntervention.reason === "security_verification" || humanIntervention.reason === "completion_wait_expired") && !isFinal ? (
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => {
                      setDismissedInterventionId(humanIntervention.eventId);
                      void load();
                    }}
                  >
                    {humanIntervention.reason === "security_verification" ? "چالش را حل کردم؛ ادامه پایش" : "ادامه پایش و انتظار"}
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
            {command ? <span>حد ایمنی اجرا: {durationLabel(command.timeoutSeconds)} · هشدار بی‌پیشرفتی: {durationLabel(command.noProgressSeconds)}</span> : null}
          </div>
        </div>

        <section className="command-monitoring-plan" aria-labelledby="command-monitoring-plan-title">
          <div className="command-panel-title">
            <h3 id="command-monitoring-plan-title">دستوراتی که برای پایش داده شده</h3>
            <span>{faNumber(monitoringPlan.length)} مورد</span>
          </div>
          {monitoringPlan.length ? (
            <ul>{monitoringPlan.map((item) => <li key={item}>{item}</li>)}</ul>
          ) : <p className="command-empty">برای این فرمان برنامه پایش جداگانه‌ای ثبت نشده است.</p>}
        </section>

        <div className="command-monitor-grid">
          <section className="command-panel" aria-labelledby="command-events-title">
            <div className="command-panel-title">
              <h3 id="command-events-title">گزارش زنده مرحله‌ها</h3>
              <span>{faNumber(visibleEvents.length)} رخداد</span>
            </div>
            <div className="command-timeline" ref={timelineRef} aria-live="polite">
              {!visibleEvents.length ? <p className="command-empty">در انتظار نخستین گزارش Windows Agent…</p> : null}
              {visibleEvents.map((event) => (
                <article className={`command-event level-${event.level}`} key={event.id}>
                  <div className="command-event-marker" aria-hidden="true" />
                  <div>
                    <div className="command-event-meta">
                      <strong>{event.stage}</strong>
                      <time dateTime={event.createdAt}>{formatJalaliDateTime(event.createdAt, true)}</time>
                    </div>
                    <p>{timelineMessage(event.message)}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="command-panel command-artifacts" aria-labelledby="command-artifacts-title">
            <div className="command-panel-title">
              <h3 id="command-artifacts-title">لینک تصویرهای مرحله‌ای</h3>
              <span>{faNumber(imageArtifacts.length)} مورد</span>
            </div>
            <p className="command-storage-note">فقط metadata و لینک در D1 است؛ بایت تصویر منحصراً در Google Drive می‌ماند.</p>
            <div className="command-artifact-list">
              {!imageArtifacts.length ? <p className="command-empty">هنوز لینک تصویری گزارش نشده است.</p> : null}
              {imageArtifacts.map((artifact) => (
                <article className="command-artifact" key={artifact.id}>
                  <div><strong>{artifact.name}</strong><span>{artifactStageLabel(artifact.stage, artifact.kind)}</span></div>
                  <a href={artifactHref(artifact)} target="_blank" rel="noopener noreferrer" title={artifact.driveUrl ? "بازکردن مستقیم تصویر در Google Drive" : "جست‌وجوی نام دقیق تصویر همگام‌شده در Google Drive"}>
                    {artifact.driveUrl ? "بازکردن تصویر ↗" : "یافتن تصویر در Drive ↗"}
                  </a>
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
