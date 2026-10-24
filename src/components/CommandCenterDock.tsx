"use client";

import { useMemo, useState } from "react";
import { useApi } from "@/hooks/useApi";
import { faNumber, formatJalaliDateTime } from "@/lib/jalali";
import { CommandMonitorModal } from "./CommandMonitorModal";

type Status = "pending" | "claimed" | "waiting_confirmation" | "running" | "succeeded" | "failed" | "cancelled" | "timed_out" | "rejected";
interface CommandItem { id: string; title: string; status: Status; createdAt: string; cancelRequestedAt: string | null }

const activeStatuses: Status[] = ["pending", "claimed", "waiting_confirmation", "running"];
const labels: Record<Status, string> = {
  pending: "در صف",
  claimed: "دریافت‌شده",
  waiting_confirmation: "منتظر تأیید",
  running: "در حال اجرا",
  succeeded: "موفق",
  failed: "ناموفق",
  cancelled: "متوقف",
  timed_out: "پایان زمان",
  rejected: "ردشده",
};

export function CommandCenterDock() {
  const { data } = useApi<{ commands: CommandItem[] }>("/api/commands?limit=12", { refreshMs: 4000 });
  const [open, setOpen] = useState(false);
  const [commandId, setCommandId] = useState<string | null>(null);
  const commands = data?.commands ?? [];
  const active = useMemo(() => commands.filter((item) => activeStatuses.includes(item.status)), [commands]);

  if (!commands.length && !open) return null;

  return (
    <>
      <aside className={`command-dock ${open ? "is-open" : ""}`} aria-label="فرمان‌های Windows Agent">
        <button className="command-dock-toggle" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          <span className="pulse-dot" aria-hidden="true" />
          <span>فرمان‌های ویندوز</span>
          {active.length ? <b>{faNumber(active.length)}</b> : null}
        </button>
        {open ? (
          <div className="command-dock-panel">
            <div className="command-dock-head"><strong>تاریخچه فرمان‌ها</strong><span>برای بازکردن پایش انتخاب کنید</span></div>
            <div className="command-dock-list">
              {commands.map((command) => (
                <button type="button" key={command.id} onClick={() => setCommandId(command.id)}>
                  <span><strong>{command.title}</strong><small>{formatJalaliDateTime(command.createdAt, true)}</small></span>
                  <i className={`dock-status dock-${command.status}`}>{command.cancelRequestedAt && activeStatuses.includes(command.status) ? "در حال توقف" : labels[command.status]}</i>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </aside>
      {commandId ? <CommandMonitorModal commandId={commandId} onClose={() => setCommandId(null)} /> : null}
    </>
  );
}
