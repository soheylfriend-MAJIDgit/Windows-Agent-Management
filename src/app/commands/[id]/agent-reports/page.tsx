"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { faNumber, formatJalaliDateTime } from "@/lib/jalali";

interface CommandDetail {
  command: { id: string; title: string; status: string };
  events: Array<{ id: number; message: string; createdAt: string }>;
  artifacts: Array<{ id: string; kind: string; stage: string | null; name: string; driveUrl: string | null; createdAt: string }>;
}

interface ReportMeta {
  id: string;
  index: number;
  item: number;
  parts: number;
  chars: number;
  sha256: string;
  name: string;
}

interface AgentReport {
  meta: ReportMeta;
  content: string;
  createdAt: string;
  complete: boolean;
  driveUrl: string | null;
}

const BEGIN = "SERVICE_AGENT_REPORT_BEGIN:";
const CHUNK = "SERVICE_AGENT_REPORT_CHUNK:";
const END = "SERVICE_AGENT_REPORT_END:";

function decodeBase64Utf8(value: string): string {
  try {
    const bytes = Uint8Array.from(window.atob(value), (character) => character.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return "[محتوای این گزارش کامل دریافت نشد]";
  }
}

function reportsFromDetail(detail: CommandDetail | null): AgentReport[] {
  if (!detail) return [];
  const reports = new Map<string, { meta: ReportMeta; chunks: Map<number, string>; createdAt: string; ended: boolean }>();
  for (const event of detail.events) {
    if (event.message.startsWith(BEGIN)) {
      try {
        const meta = JSON.parse(event.message.slice(BEGIN.length).trim()) as ReportMeta;
        if (meta.id) reports.set(meta.id, { meta, chunks: new Map(), createdAt: event.createdAt, ended: false });
      } catch {
        // رخداد ناقص در صفحه نادیده گرفته می‌شود؛ اصل فایل همچنان در Drive باقی می‌ماند.
      }
      continue;
    }
    if (event.message.startsWith(CHUNK)) {
      const raw = event.message.slice(CHUNK.length).trim();
      const match = raw.match(/^([^:]+):(\d+)\/(\d+):(.*)$/);
      if (!match) continue;
      const report = reports.get(match[1]);
      if (report) report.chunks.set(Number(match[2]), match[4]);
      continue;
    }
    if (event.message.startsWith(END)) {
      try {
        const meta = JSON.parse(event.message.slice(END.length).trim()) as ReportMeta;
        const report = reports.get(meta.id);
        if (report) report.ended = true;
      } catch {
        // وضعیت ناقص پایین صفحه مشخص می‌شود.
      }
    }
  }
  const artifacts = detail.artifacts.filter((artifact) => artifact.kind === "agent-report");
  return [...reports.values()]
    .sort((a, b) => a.meta.index - b.meta.index)
    .map((report) => {
      const encoded = Array.from({ length: report.meta.parts }, (_, index) => report.chunks.get(index + 1) ?? "").join("");
      const artifact = artifacts.find((item) => item.name === report.meta.name || item.stage?.endsWith(report.meta.id));
      return {
        meta: report.meta,
        content: decodeBase64Utf8(encoded),
        createdAt: report.createdAt,
        complete: report.ended && report.chunks.size === report.meta.parts,
        driveUrl: artifact?.driveUrl ?? null,
      };
    });
}

function downloadReport(report: AgentReport) {
  const blob = new Blob([`${report.content}\n`], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = report.meta.name || `agent-report-${report.meta.index}.md`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function AgentReportsPage() {
  const params = useParams<{ id: string }>();
  const commandId = String(params.id ?? "");
  const [detail, setDetail] = useState<CommandDetail | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/commands/${encodeURIComponent(commandId)}`, { cache: "no-store" });
      const body = await response.json() as CommandDetail & { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message || "دریافت گزارش‌های ایجنت ممکن نشد.");
      setDetail(body);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "دریافت گزارش‌های ایجنت ممکن نشد.");
    }
  }, [commandId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(timer);
  }, [load]);

  const reports = useMemo(() => reportsFromDetail(detail), [detail]);

  return (
    <>
      <PageHeader
        eyebrow="مرکز فرمان ویندوز"
        title="گزارشات ایجنت"
        subtitle={detail ? `${detail.command.title} · ${faNumber(reports.length)} گزارش مستقل` : "در حال دریافت گزارش‌های همین سرویس و همین اجرا…"}
      />

      <div className="agent-reports-toolbar">
        <code dir="ltr">{commandId}</code>
        <button type="button" className="button secondary" onClick={() => void load()}>به‌روزرسانی</button>
      </div>

      {error ? <div className="command-alert command-alert-error" role="alert"><strong>خطا</strong><span>{error}</span></div> : null}
      {!error && !reports.length ? <div className="empty-state"><p>هنوز گزارش Markdown تازه‌ای برای این اجرا دریافت نشده است.</p></div> : null}

      <div className="agent-report-list">
        {reports.map((report) => (
          <article className="agent-report-card" key={report.meta.id}>
            <header>
              <div>
                <span className="eyebrow">گزارش {faNumber(report.meta.index)} · مرحله {faNumber(report.meta.item)}</span>
                <h2>{report.meta.name}</h2>
                <time dateTime={report.createdAt}>{formatJalaliDateTime(report.createdAt, true)}</time>
              </div>
              <span className={`status-chip ${report.complete ? "is-ok" : "is-warn"}`}>
                <span className="dot" />{report.complete ? "کامل" : "در حال دریافت"}
              </span>
            </header>
            <pre className="agent-report-markdown" dir="auto">{report.content}</pre>
            <footer>
              <span>{faNumber(report.meta.chars)} نویسه · SHA-256: <code dir="ltr">{report.meta.sha256.slice(0, 12)}…</code></span>
              <div className="actions-inline">
                <button type="button" className="button secondary" onClick={() => downloadReport(report)}>دانلود Markdown</button>
                {report.driveUrl ? <a className="button secondary" href={report.driveUrl} target="_blank" rel="noreferrer">بازکردن فایل ذخیره‌شده</a> : <span className="artifact-pending">در انتظار Upload فایل به R2</span>}
              </div>
            </footer>
          </article>
        ))}
      </div>
    </>
  );
}
