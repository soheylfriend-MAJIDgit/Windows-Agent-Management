"use client";

import { useMemo, useState } from "react";
import { postJson, useApi } from "@/hooks/useApi";
import { faNumber, formatJalaliDateTime } from "@/lib/jalali";
import { useToast } from "./ToastProvider";
import { CommandMonitorModal } from "./CommandMonitorModal";

type Status = "pending" | "claimed" | "waiting_confirmation" | "running" | "succeeded" | "failed" | "cancelled" | "timed_out" | "rejected";
type ControlStatus = "pending" | "delivered" | "succeeded" | "failed" | "expired" | "cancelled";
interface CommandItem { id: string; title: string; status: Status; createdAt: string; cancelRequestedAt: string | null }
interface EmergencyControl { id:string;agentId:string;status:ControlStatus;createdAt:string;deliveredAt:string|null;completedAt:string|null;result:Record<string,unknown> }

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
const controlLabels:Record<ControlStatus,string>={pending:"در انتظار Heartbeat",delivered:"تحویل Windows Agent شد",succeeded:"توقف همه تأیید شد",failed:"توقف کامل نشد",expired:"مهلت درخواست تمام شد",cancelled:"لغوشده"};

export function CommandCenterDock() {
  const commandsApi = useApi<{ commands: CommandItem[] }>("/api/commands?limit=12", { refreshMs: 4000 });
  const controlApi = useApi<{control:EmergencyControl|null}>("/api/commands/stop-all",{refreshMs:4000});
  const notify=useToast();
  const [open, setOpen] = useState(false);
  const [commandId, setCommandId] = useState<string | null>(null);
  const [stoppingAll,setStoppingAll]=useState(false);
  const commands = commandsApi.data?.commands ?? [];
  const active = useMemo(() => commands.filter((item) => activeStatuses.includes(item.status)), [commands]);
  const control=controlApi.data?.control??null;
  const controlActive=control?.status==="pending"||control?.status==="delivered";

  async function stopAll(){
    if(!window.confirm("همه اجراهای فعال و پایش‌های پس‌زمینه متعلق به Windows Agent فوراً متوقف شوند؟ برنامه‌های نامرتبط ویندوز بسته نمی‌شوند."))return;
    setStoppingAll(true);
    try{
      const result=await postJson<{message:string;commands:{requested:number}}>("/api/commands/stop-all",{confirmation:"STOP_ALL_AGENT_EXECUTIONS"});
      notify.ok(`${result.message} برای ${result.commands.requested.toLocaleString("fa-IR")} فرمان فعال نیز لغو ثبت شد.`);
      await Promise.all([commandsApi.reload(),controlApi.reload()]);
    }catch(error){
      const value=error as Error&{hint?:string};
      notify.error([value.message,value.hint].filter(Boolean).join(" — ")||"ثبت توقف فوری همه اجراها ممکن نشد.");
    }finally{setStoppingAll(false)}
  }

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
            <div className="command-dock-head"><strong>تاریخچه و کنترل اضطراری</strong><span>توقف همه از صف عادی مستقل است و با Heartbeat تحویل می‌شود.</span></div>
            <div className="command-emergency-stop">
              <button type="button" className="command-stop-all" disabled={stoppingAll||controlActive} onClick={()=>void stopAll()}><span aria-hidden="true">■</span>{stoppingAll?"در حال ثبت توقف…":controlActive?"توقف همه در حال انجام است":"توقف فوری همه اجراهای ایجنت"}</button>
              {control?<div className={`command-control-state is-${control.status}`}><strong>{controlLabels[control.status]}</strong><span>{formatJalaliDateTime(control.createdAt,true)} · <code dir="ltr">{control.id}</code></span></div>:<p>این فرمان فقط Processهای ثبت‌شده و متعلق به Windows Agent را هدف می‌گیرد.</p>}
            </div>
            <div className="command-dock-list">
              {!commands.length?<p className="command-empty">هنوز فرمانی ثبت نشده است.</p>:null}
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
