"use client";

import { type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { CommandMonitorModal } from "./CommandMonitorModal";
import { Banner, ErrorBanner, LoadingState } from "./ui";
import { useToast } from "./ToastProvider";
import { postJson, useApi } from "@/hooks/useApi";

type ExecutionMode = "blocking" | "background";
type Transition = "manual" | "on_success";
interface Cell { id:string; title:string; language:string; content:string; notes:string; transition:Transition; executionMode:ExecutionMode; executable:boolean; commandId:string|null }
interface Notebook { id:string; title:string; goal:string; chatbotGuide:string; cells:Cell[] }
interface ExecutionAgent { name:string; version:string|null; autoMode:boolean; busyAtDispatch:string|null }
interface PreflightResult { ok:true; ready:boolean; checkedAt:string; agent:{name:string;version:string|null;heartbeatAt:string;autoMode:boolean;busy:string|null};queue:{activeCommands:number;latest:{id:string;title:string;status:string;createdAt:string;lastEventAt:string}|null};checks:Array<{key:string;ok:boolean;label:string}> }
interface ExecutionAttempt { id:string;notebookId:string;cellId:string;runAll:boolean;status:"preparing"|"queued"|"failed";phase:string;message:string;commandId:string|null;automationVersion:number|null;agentName:string|null;agentVersion:string|null;createdAt:string;updatedAt:string;steps:Array<{at:string;phase:string;level:"info"|"success"|"error";message:string}>;commandStatus?:string|null;commandError?:string|null;commandLastEventAt?:string|null }

export function StageNotebooksWorkspace() {
  const api = useApi<{notebooks:Notebook[];attempts:ExecutionAttempt[]}>("/api/stage-notebooks");
  const notify = useToast();
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [title,setTitle]=useState("");
  const [goal,setGoal]=useState("");
  const [busy,setBusy]=useState(false);
  const [busyCell,setBusyCell]=useState<string|null>(null);
  const [commandId,setCommandId]=useState<string|null>(null);
  const [monitorCommandId,setMonitorCommandId]=useState<string|null>(null);
  const [expandedCellId,setExpandedCellId]=useState<string|null>(null);
  const [editingCellId,setEditingCellId]=useState<string|null>(null);
  const [lastAgent,setLastAgent]=useState<ExecutionAgent|null>(null);
  const [requireManualConfirmation,setRequireManualConfirmation]=useState(true);
  const [viewMode,setViewMode]=useState<"cells"|"whole">("cells");
  const [wholeText,setWholeText]=useState("");
  const [preflight,setPreflight]=useState<PreflightResult|null>(null);
  const [preflightError,setPreflightError]=useState("");
  const [checkingPreflight,setCheckingPreflight]=useState(false);
  const [preflightExpanded,setPreflightExpanded]=useState(false);
  const [workspaceTab,setWorkspaceTab]=useState<"notebooks"|"cells"|"connection"|"logs">("notebooks");
  const [executionLogExpanded,setExecutionLogExpanded]=useState(true);
  const [editingNotebookId,setEditingNotebookId]=useState<string|null>(null);
  const [editingNotebookTitle,setEditingNotebookTitle]=useState("");
  const [editingNotebookGoal,setEditingNotebookGoal]=useState("");
  const [cellDrafts,setCellDrafts]=useState<Record<string,Cell>>({});
  const selected=useMemo(()=>api.data?.notebooks.find(n=>n.id===selectedId)??api.data?.notebooks[0]??null,[api.data,selectedId]);
  const effectiveCells=useMemo(()=>selected?.cells.map(cell=>cellDrafts[cell.id]??cell)??[],[selected,cellDrafts]);
  const dirtyCellCount=Object.keys(cellDrafts).length;
  const attempts=useMemo(()=>selected?api.data?.attempts.filter(item=>item.notebookId===selected.id)??[]:[],[api.data,selected]);
  const latestAttempt=attempts[0]??null;
  const firstRunnable=effectiveCells.find(cell=>cell.executable&&cell.content.trim())??null;
  const runnableCount=effectiveCells.filter(cell=>cell.executable&&cell.content.trim()).length;
  const backgroundCount=effectiveCells.filter(cell=>cell.executable&&cell.executionMode==="background").length;
  const attemptByCell=useMemo(()=>{const latest=new Map<string,ExecutionAttempt>();for(const attempt of attempts)if(!latest.has(attempt.cellId))latest.set(attempt.cellId,attempt);return latest},[attempts]);
  const shouldPollExecution=Array.from(attemptByCell.values()).some(attempt=>attempt.status!=="failed"&&(!attempt.commandStatus||["pending","claimed","waiting_confirmation","running"].includes(attempt.commandStatus)));

  async function runPreflight(){setCheckingPreflight(true);setPreflightError("");try{const result=await postJson<PreflightResult>("/api/stage-notebooks",{action:"preflight"});setPreflight(result);if(!result.ready)setPreflightExpanded(true);}catch(error){setPreflight(null);setPreflightError(message(error,"آزمون آمادگی Windows Agent ناموفق بود."));setPreflightExpanded(true);}finally{setCheckingPreflight(false)}}
  async function copyPreflightReport(){if(!preflight)return;const report=["گزارش آزمون آمادگی دفترچه",`زمان: ${tehranDate(preflight.checkedAt)}`,`Agent: ${preflight.agent.name}`,`نسخه: ${preflight.agent.version??"نامشخص"}`,`Heartbeat: ${tehranDate(preflight.agent.heartbeatAt)}`,`حالت: ${preflight.agent.autoMode?"Automatic":"Manual"}`,`مشغول: ${preflight.agent.busy??"خیر"}`,`فرمان‌های فعال/صف: ${preflight.queue.activeCommands}`,...preflight.checks.map(check=>`${check.ok?"OK":"WARN"} — ${check.label}`),preflight.queue.latest?`آخرین فرمان: ${preflight.queue.latest.id} | ${preflight.queue.latest.status} | ${preflight.queue.latest.title}`:"آخرین فرمان: وجود ندارد"].join("\n");await navigator.clipboard.writeText(report);notify.ok("گزارش آمادگی کپی شد.")}
  async function copyExecutionLog(){if(!latestAttempt)return;const report=["گزارش اجرای دفترچه",`Attempt: ${latestAttempt.id}`,`زمان: ${tehranDate(latestAttempt.createdAt)}`,`وضعیت مدیریت: ${latestAttempt.status}`,`مرحله: ${latestAttempt.phase}`,`پیام: ${latestAttempt.message}`,`Agent: ${latestAttempt.agentName??"انتخاب نشده"} ${latestAttempt.agentVersion??""}`,`Automation version: ${latestAttempt.automationVersion??"ساخته نشده"}`,`Command: ${latestAttempt.commandId??"ساخته نشده"}`,`Command status: ${latestAttempt.commandStatus??"وجود ندارد"}`,`Command error: ${latestAttempt.commandError??"ندارد"}`,"",...latestAttempt.steps.map(step=>`${tehranDate(step.at)} | ${step.level.toUpperCase()} | ${step.phase} | ${step.message}`)].join("\n");await navigator.clipboard.writeText(report);notify.ok("لاگ اجرای دفترچه کپی شد.")}
  useEffect(()=>{void runPreflight()},[]);
  useEffect(()=>{if(!shouldPollExecution)return;const timer=window.setInterval(()=>void api.reload(),4000);return()=>window.clearInterval(timer)},[shouldPollExecution,api.reload]);

  async function create(){if(!title.trim())return;setBusy(true);try{const r=await postJson<{notebook:Notebook}>("/api/stage-notebooks",{action:"create",title,goal});setTitle("");setGoal("");await api.reload();setSelectedId(r.notebook.id);notify.ok("دفترچه ساخته شد.");}catch(e){notify.error(message(e,"ساخت دفترچه ممکن نشد."));}finally{setBusy(false)}}
  async function saveNotebook(id:string,body:Record<string,unknown>){setBusy(true);try{await postJson("/api/stage-notebooks",{action:"update",id,...body});await api.reload();notify.ok("مشخصات دفترچه ذخیره شد.");return true;}catch(e){notify.error(message(e,"ذخیره دفترچه ممکن نشد."));return false;}finally{setBusy(false)}}
  function beginNotebookEdit(notebook:Notebook){setEditingNotebookId(notebook.id);setEditingNotebookTitle(notebook.title);setEditingNotebookGoal(notebook.goal)}
  function cancelNotebookEdit(){setEditingNotebookId(null);setEditingNotebookTitle("");setEditingNotebookGoal("")}
  async function finishNotebookEdit(notebook:Notebook){const title=editingNotebookTitle.trim();if(title.length<2){notify.error("نام دفترچه باید حداقل دو نویسه باشد.");return}if(await saveNotebook(notebook.id,{title,goal:editingNotebookGoal}))cancelNotebookEdit()}
  async function deleteNotebook(notebook:Notebook){if(!window.confirm(`دفترچه «${notebook.title}» حذف شود؟`))return;setBusy(true);try{await postJson("/api/stage-notebooks",{action:"delete",id:notebook.id});if(selectedId===notebook.id){setSelectedId(null);setCellDrafts({})}if(editingNotebookId===notebook.id)cancelNotebookEdit();await api.reload();notify.ok("دفترچه حذف شد.");}catch(e){notify.error(message(e,"حذف دفترچه ممکن نشد."));}finally{setBusy(false)}}
  function openNotebook(notebook:Notebook,mode:"cells"|"whole"="cells"){setSelectedId(notebook.id);setCellDrafts({});setViewMode(mode);if(mode==="whole")setWholeText(formatWholeNotebook(notebook));setWorkspaceTab("cells")}
  async function update(body:Record<string,unknown>,quiet=false){if(!selected)return false;setBusy(true);try{await postJson("/api/stage-notebooks",{action:"update",id:selected.id,...body});await api.reload();if(!quiet)notify.ok("تغییرها در PostgreSQL ذخیره شد.");return true;}catch(e){notify.error(message(e,"ذخیره ممکن نشد."));return false;}finally{setBusy(false)}}
  function rememberCellDraft(cell:Cell){setCellDrafts(current=>({...current,[cell.id]:cell}))}
  function forgetCellDraft(cellId:string){setCellDrafts(current=>{const next={...current};delete next[cellId];return next})}
  async function saveCellDraft(cell:Cell){if(await update({cell}))forgetCellDraft(cell.id)}
  async function saveAllCellDrafts(){if(!selected||dirtyCellCount===0)return;if(await update({replaceCells:effectiveCells}))setCellDrafts({})}
  async function deleteCell(cellId:string){if(await update({deleteCell:cellId}))forgetCellDraft(cellId)}
  async function remove(){if(!selected||!window.confirm(`دفترچه «${selected.title}» حذف شود؟`))return;setBusy(true);try{await postJson("/api/stage-notebooks",{action:"delete",id:selected.id});setSelectedId(null);setCellDrafts({});await api.reload();notify.ok("دفترچه حذف شد.");}catch(e){notify.error(message(e,"حذف ممکن نشد."));}finally{setBusy(false)}}
  async function run(cell:Cell,runAll=false){if(!selected)return;setBusyCell(cell.id);try{await postJson("/api/stage-notebooks",{action:"update",id:selected.id,cell});forgetCellDraft(cell.id);const r=await postJson<{commandId:string;attemptId:string;agent:ExecutionAgent}>("/api/stage-notebooks",{action:"run",id:selected.id,cellId:cell.id,runAll,requireManualConfirmation});setLastAgent(r.agent);setCommandId(r.commandId);await api.reload();await runPreflight();if(r.agent.busyAtDispatch)notify.ok(`فرمان در صف ${r.agent.name} ثبت شد؛ ایجنت هنگام ارسال مشغول «${r.agent.busyAtDispatch}» بود.`);else if(r.agent.autoMode)notify.ok(`فرمان به ${r.agent.name} رسید؛ حالت محلی Automatic است و پنجره تأیید نمایش داده نمی‌شود.`);else notify.ok(`فرمان به ${r.agent.name} رسید؛ مانیتور روی «در انتظار تأیید ویندوز» قرار می‌گیرد.`);}catch(e){setExecutionLogExpanded(true);setWorkspaceTab("logs");await api.reload();notify.error(message(e,"اجرای مرحله ممکن نشد."));}finally{setBusyCell(null)}}
  async function pause(cell:Cell){if(!selected)return;setBusyCell(cell.id);try{const r=await postJson<{commandId:string}>("/api/stage-notebooks",{action:"pause",id:selected.id,cellId:cell.id});setCommandId(r.commandId);await api.reload();notify.ok(cell.executionMode==="background"?"فرمان توقف پردازش پایشی ارسال شد.":"درخواست توقف امن اجرای سلول ثبت شد.");}catch(e){notify.error(message(e,"توقف مرحله ممکن نشد."));}finally{setBusyCell(null)}}
  async function copyPackage(cell:Cell){if(!selected)return;const text=`${selected.chatbotGuide}\n\nهدف نهایی:\n${selected.goal}\n\nمرحله جاری: ${cell.title}\nزبان: ${cell.language}\nنوع اجرا: ${cell.executionMode==="background"?"پایش مستقل پس‌زمینه":"ترتیبی و منتظر نتیجه"}\n\nکد/محتوا:\n${cell.content}\n\nیادداشت و نتیجه مرحله:\n${cell.notes||"هنوز نتیجه‌ای ثبت نشده است."}\n\nلطفاً فقط مرحله بعدی لازم، کد کامل آن، معیار موفقیت و مواردی را که باید در اسکرین‌شات بررسی کنم ارائه کن.`;await navigator.clipboard.writeText(text);notify.ok("بسته راهنما برای چت‌بات کپی شد.")}
  function changeView(mode:"cells"|"whole"){if(mode==="whole"&&selected)setWholeText(formatWholeNotebook(selected));setViewMode(mode)}
  async function copyWhole(){if(!wholeText)return;await navigator.clipboard.writeText(wholeText);notify.ok("متن کامل دفترچه برای چت‌بات کپی شد.")}
  async function applyWhole(){if(!selected)return;try{const parsed=parseWholeNotebook(wholeText);setBusy(true);await postJson("/api/stage-notebooks",{action:"update",id:selected.id,title:parsed.title,goal:parsed.goal,chatbotGuide:parsed.chatbotGuide,replaceCells:parsed.cells});await api.reload();setViewMode("cells");notify.ok(`${parsed.cells.length.toLocaleString("fa-IR")} سلول از نمای یکجا اعمال شد.`);}catch(e){notify.error(message(e,"قالب نمای یکجا معتبر نیست."));}finally{setBusy(false)}}

  return <div className={`stage-workspace-root tab-${workspaceTab}`}>
    <div className="stage-topbar">
      <div className="stage-topbar-copy"><strong>دفترچه‌های اجرایی Windows</strong><span>سلول‌های ترتیبی منتظر پایان می‌مانند؛ سلول‌های پایشی مستقل راه‌اندازی می‌شوند و مسیر ادامه پیدا می‌کند.</span><div className="stage-stats"><span><b>{runnableCount.toLocaleString("fa-IR")}</b> سلول آماده</span><span><b>{backgroundCount.toLocaleString("fa-IR")}</b> پایش مستقل</span><span className={firstRunnable?"ready":"idle"}>{firstRunnable?"آماده اجرا":"منتظر کد"}</span></div></div>
      <div className="actions-inline">{workspaceTab==="cells"?<><button type="button" className={`button stage-save-all ${dirtyCellCount?"dirty":""}`} disabled={busy||Boolean(busyCell)||dirtyCellCount===0} onClick={()=>void saveAllCellDrafts()}><span aria-hidden="true">✓</span>{busy?"در حال ذخیره…":dirtyCellCount?`ذخیره ${dirtyCellCount.toLocaleString("fa-IR")} سلول`:"تغییری برای ذخیره نیست"}</button><button type="button" className="button primary stage-run-all" disabled={!firstRunnable||busy||Boolean(busyCell)} onClick={()=>firstRunnable&&void run(cellDrafts[firstRunnable.id]??firstRunnable,true)}><span aria-hidden="true">▶</span>{busyCell?"در حال ارسال…":"اجرای دفترچه"}</button></>:null}{commandId?<button type="button" className="button stage-monitor-action" onClick={()=>setMonitorCommandId(commandId)}><span aria-hidden="true">●</span>نمایش آخرین اجرا</button>:null}</div>
    </div>
    <nav className="stage-main-tabs" aria-label="بخش‌های دفترچه"><button type="button" className={workspaceTab==="notebooks"?"active":""} onClick={()=>setWorkspaceTab("notebooks")}><span>دفترچه‌ها</span><b>{(api.data?.notebooks.length??0).toLocaleString("fa-IR")}</b></button><button type="button" className={workspaceTab==="cells"?"active":""} onClick={()=>setWorkspaceTab("cells")}><span>سلول‌ها</span><b>{(selected?.cells.length??0).toLocaleString("fa-IR")}</b></button><button type="button" className={workspaceTab==="connection"?"active":""} onClick={()=>setWorkspaceTab("connection")}><span>آمادگی اتصال</span><b className={preflightError?"warn":preflight?.ready?"ok":preflight?"warn":""}>{preflightError?"قطع":preflight?.ready?"آماده":preflight?"هشدار":"…"}</b></button><button type="button" className={workspaceTab==="logs"?"active":""} onClick={()=>setWorkspaceTab("logs")}><span>لاگ اجرا</span><b className={latestAttempt?.status==="failed"?"warn":latestAttempt?"ok":""}>{latestAttempt?attemptStatusFa(latestAttempt):"بدون اجرا"}</b></button></nav>
    {workspaceTab==="notebooks"?<section className="stage-notebooks-tab">
      <aside className="stage-create-notebook"><div><span className="eyebrow">دفترچه تازه</span><h3>ساخت دفترچه جدید</h3><p>هدف کلی را بنویسید؛ سپس دفترچه را در نمای سلول‌ها یا نمای یکجا باز کنید.</p></div><label className="field"><span className="field-label">نام دفترچه</span><input className="input" value={title} onChange={event=>setTitle(event.target.value)} placeholder="مثلاً اتوماسیون سایت" maxLength={120}/></label><label className="field stage-create-goal"><span className="field-label">هدف نهایی</span><textarea className="input textarea" value={goal} onChange={event=>setGoal(event.target.value)} placeholder="این دفترچه در پایان باید چه کاری انجام دهد؟"/></label><button type="button" className="button primary stage-create-action" disabled={busy||title.trim().length<2} onClick={()=>void create()}><span aria-hidden="true">＋</span>ساخت دفترچه</button></aside>
      <div className="stage-notebook-catalog"><header><div><h3>دفترچه‌های ذخیره‌شده</h3><p>برای تغییر نام یا هدف، دکمه ویرایش همان دفترچه را بزنید.</p></div><b>{(api.data?.notebooks.length??0).toLocaleString("fa-IR")} دفترچه</b></header>
        <div className="stage-notebook-cards">{api.data?.notebooks.map(notebook=>{const editing=editingNotebookId===notebook.id;const controlled=notebook.id==="controlled-windows-ui-diagnostic-v1";return <article className={`stage-notebook-card ${selected?.id===notebook.id?"selected":""} ${editing?"editing":""}`} key={notebook.id}>
          <div className="stage-notebook-card-head"><span>{notebook.cells.length.toLocaleString("fa-IR")} سلول</span>{controlled?<b className="stage-controlled-badge">تست کنترل‌شده</b>:<small>{notebook.id.slice(0,8)}</small>}</div>
          {editing?<div className="stage-notebook-edit-form"><label className="field"><span className="field-label">نام دفترچه</span><input className="input" value={editingNotebookTitle} onChange={event=>setEditingNotebookTitle(event.target.value)} maxLength={120} autoFocus/></label><label className="field stage-card-goal"><span className="field-label">هدف نهایی</span><textarea className="input textarea" value={editingNotebookGoal} onChange={event=>setEditingNotebookGoal(event.target.value)} placeholder="هدف این دفترچه…" maxLength={4000}/></label><div className="stage-notebook-edit-actions"><button type="button" className="button stage-card-action stage-card-save" disabled={busy||editingNotebookTitle.trim().length<2} onClick={()=>void finishNotebookEdit(notebook)}><span aria-hidden="true">✓</span>{busy?"در حال ذخیره…":"ذخیره تغییرات"}</button><button type="button" className="button stage-card-action stage-card-cancel" disabled={busy} onClick={cancelNotebookEdit}>انصراف</button></div></div>:<div className="stage-notebook-summary"><h4>{notebook.title}</h4><p>{notebook.goal||"برای این دفترچه هنوز هدفی ثبت نشده است."}</p></div>}
          {!editing?<div className="stage-notebook-card-actions"><button type="button" className="button stage-card-action stage-card-open" onClick={()=>openNotebook(notebook,"cells")}><span aria-hidden="true">▶</span>بازکردن سلول‌ها</button><button type="button" className="button stage-card-action stage-card-whole" onClick={()=>openNotebook(notebook,"whole")}><span aria-hidden="true">▤</span>نمای یکجا</button><button type="button" className="button stage-card-action stage-card-edit" disabled={busy} onClick={()=>beginNotebookEdit(notebook)}><span aria-hidden="true">✎</span>ویرایش</button><button type="button" className="button danger stage-danger-action stage-card-action" disabled={busy||controlled} title={controlled?"دفترچه تشخیصی کنترل‌شده حذف نمی‌شود.":"حذف دفترچه"} onClick={()=>void deleteNotebook(notebook)}><span aria-hidden="true">×</span>حذف</button></div>:null}
        </article>})}</div>
      </div>
    </section>:null}
    {workspaceTab==="connection"?<>
    <div className={`stage-agent-contract ${lastAgent?.busyAtDispatch?"busy":lastAgent?.autoMode?"automatic":lastAgent?"manual":""}`}><span>{lastAgent?.busyAtDispatch?"فرمان در صف":lastAgent?.autoMode?"حالت Automatic":lastAgent?"حالت Manual":"تأیید اجرای ویندوز"}</span><p>{lastAgent?.busyAtDispatch?<>ایجنت <b>{lastAgent.name}</b> هنگام ارسال مشغول «{lastAgent.busyAtDispatch}» بود؛ فرمان بعد از آزادشدن claim می‌شود.</>:lastAgent?.autoMode?<>ایجنت <b>{lastAgent.name}</b>{lastAgent.version?` نسخه ${lastAgent.version}`:""} حالت خودکار را در آخرین Heartbeat گزارش کرده است؛ طبق قرارداد مادر پنجره Yes/No نمایش داده نمی‌شود.</>:lastAgent?<>ایجنت <b>{lastAgent.name}</b>{lastAgent.version?` نسخه ${lastAgent.version}`:""} حالت دستی را گزارش کرده است؛ پس از claim باید پنجره Yes/No نمایش داده شود. وضعیت را در مانیتور فرمان ببینید.</>:<>فرمان‌ها با نیاز به تأیید ارسال می‌شوند؛ در حالت محلی <b>Manual</b> پنجره Yes/No نمایش داده می‌شود و در حالت <b>Automatic</b> ایجنت بدون سؤال ادامه می‌دهد.</>}</p><label className="stage-confirm-toggle"><input type="checkbox" checked={requireManualConfirmation} onChange={event=>setRequireManualConfirmation(event.target.checked)}/><span>الزام تأیید محلی؛ اگر Agent روی Automatic است اجرا متوقف شود</span></label></div>
    <section className={`stage-preflight ${preflightError?"failed":preflight?.ready?"ready":preflight?"warning":"checking"}`}>
      <div className="stage-preflight-head"><div className="stage-preflight-title"><span className="stage-preflight-light"/><div><strong>آزمون آمادگی اجرای دفترچه</strong><p>{checkingPreflight?"در حال بررسی Heartbeat، قابلیت‌ها، scopeها و صف فرمان…":preflightError||(!preflight?"هنوز بررسی نشده است.":preflight.ready?`آماده · ${preflight.agent.name} · ${preflight.agent.autoMode?"Automatic":"Manual"} · صف ${preflight.queue.activeCommands.toLocaleString("fa-IR")}`:"ارتباط برقرار است، اما هشدارهای آمادگی را بررسی کنید.")}</p></div></div><div className="actions-inline">{preflight?<button type="button" className="button" onClick={()=>setPreflightExpanded(value=>!value)}>{preflightExpanded?"بستن جزئیات":"نمایش جزئیات"}</button>:null}<button type="button" className="button" disabled={checkingPreflight} onClick={()=>void runPreflight()}>{checkingPreflight?"در حال بررسی…":"بررسی دوباره"}</button><button type="button" className="button" disabled={!preflight} onClick={()=>void copyPreflightReport()}>کپی گزارش</button></div></div>
      {preflight&&preflightExpanded?<div className="stage-preflight-details"><div className="stage-preflight-meta"><span><b>{preflight.agent.name}</b>{preflight.agent.version?` · نسخه ${preflight.agent.version}`:""}</span><span>Heartbeat: {tehranDate(preflight.agent.heartbeatAt)}</span><span>حالت: <b>{preflight.agent.autoMode?"Automatic":"Manual"}</b></span><span>صف فعال: <b>{preflight.queue.activeCommands.toLocaleString("fa-IR")}</b></span><span>بررسی: {tehranDate(preflight.checkedAt)}</span></div><div className="stage-preflight-checks">{preflight.checks.map(check=><span key={check.key} className={check.ok?"ok":"warn"}>{check.ok?"✓":"!"} {check.label}</span>)}</div>{preflight.queue.latest?<div className="stage-preflight-latest"><span>آخرین فرمان</span><code dir="ltr">{preflight.queue.latest.id}</code><b>{commandStatusFa(preflight.queue.latest.status)}</b><small>{preflight.queue.latest.title}</small></div>:null}</div>:null}
    </section>
    </>:null}
    {workspaceTab==="logs"?<section className={`stage-execution-log ${latestAttempt?.commandStatus??latestAttempt?.status??"empty"}`}><div className="stage-execution-log-head"><div><strong>لاگ واقعی اجرای دفترچه</strong><p>{latestAttempt?`${attemptStatusFa(latestAttempt)} · ${latestAttempt.message}`:"هنوز Play ثبت نشده است؛ پس از کلیک، تمام مراحل حتی خطاهای قبل از ساخت فرمان اینجا ثبت می‌شوند."}</p></div><div className="actions-inline"><button type="button" className="button" onClick={()=>void api.reload()}>تازه‌سازی لاگ</button><button type="button" className="button" disabled={!latestAttempt} onClick={()=>void copyExecutionLog()}>کپی لاگ</button>{latestAttempt?<button type="button" className="button" onClick={()=>setExecutionLogExpanded(value=>!value)}>{executionLogExpanded?"بستن جزئیات":"نمایش جزئیات"}</button>:null}</div></div>{latestAttempt?<div className="stage-execution-summary"><span>Attempt: <code dir="ltr">{latestAttempt.id.slice(0,8)}</code></span><span>مرحله: <b>{attemptPhaseFa(latestAttempt.phase)}</b></span><span>نسخه: <b>{latestAttempt.automationVersion??"—"}</b></span><span>Command: <code dir="ltr">{latestAttempt.commandId?.slice(0,12)??"ساخته نشده"}</code></span><span>وضعیت فرمان: <b>{latestAttempt.commandStatus?commandStatusFa(latestAttempt.commandStatus):"هنوز فرمانی نیست"}</b></span><span>{tehranDate(latestAttempt.updatedAt)}</span></div>:null}{latestAttempt&&executionLogExpanded?<div className="stage-execution-steps">{latestAttempt.steps.map((step,index)=><div className={`stage-execution-step ${step.level}`} key={`${step.at}-${index}`}><span>{step.level==="success"?"✓":step.level==="error"?"×":"•"}</span><time>{tehranDate(step.at)}</time><b>{attemptPhaseFa(step.phase)}</b><p>{step.message}</p></div>)}{latestAttempt.commandError?<div className="stage-command-error">خطای فرمان: {latestAttempt.commandError}</div>:null}</div>:null}</section>:null}
    {api.loading&&!api.data?<LoadingState label="در حال دریافت دفترچه‌ها…"/>:null}{api.error?<ErrorBanner error={api.error} onRetry={()=>void api.reload()}/>:null}
    {workspaceTab==="cells"?<section className="stage-layout stage-layout-modal is-focus">
      <main className="stage-workspace">
        {!selected?<div className="empty-state stage-empty"><span>⌘</span><strong>هنوز دفترچه‌ای انتخاب نشده است</strong><p>یک دفترچه تازه بسازید یا از فهرست کناری انتخاب کنید.</p></div>:<>
          <div className="stage-head"><div><h3>{selected.title}</h3><p>{selected.goal||"هدف نهایی هنوز نوشته نشده است."}</p></div><div className="actions-inline"><div className="stage-view-tabs" role="tablist" aria-label="نحوه نمایش دفترچه"><button type="button" role="tab" aria-selected={viewMode==="cells"} className={viewMode==="cells"?"active":""} onClick={()=>changeView("cells")}>نمای سلولی</button><button type="button" role="tab" aria-selected={viewMode==="whole"} className={viewMode==="whole"?"active":""} onClick={()=>changeView("whole")}>نمای یکجا</button></div><button type="button" className="button stage-add-cell-action" disabled={busy||viewMode==="whole"} onClick={()=>void update({addCell:true})}><span aria-hidden="true">＋</span>سلول کد</button><button type="button" className="button danger stage-danger-action stage-delete-notebook-action" disabled={busy||selected.id==="controlled-windows-ui-diagnostic-v1"} title={selected.id==="controlled-windows-ui-diagnostic-v1"?"دفترچه تشخیصی کنترل‌شده حذف نمی‌شود.":"حذف دفترچه"} onClick={()=>void remove()}>حذف دفترچه</button></div></div>
          {viewMode==="cells"?<><details className="advanced-settings"><summary>تنظیمات و راهنمای ثابت چت‌بات</summary><div className="stage-settings-grid"><label className="field"><span className="field-label">نام دفترچه</span><input className="input" defaultValue={selected.title} onBlur={e=>void update({title:e.target.value},true)}/></label><label className="field"><span className="field-label">هدف نهایی</span><textarea className="input textarea" rows={3} defaultValue={selected.goal} onBlur={e=>void update({goal:e.target.value},true)}/></label></div><label className="field"><span className="field-label">راهنمای ثابت چت‌بات</span><textarea className="input textarea" rows={5} defaultValue={selected.chatbotGuide} onBlur={e=>void update({chatbotGuide:e.target.value},true)}/></label></details>
          <Banner tone="info" title="دو نوع اجرای سلول">«ترتیبی» تا پایان کد صبر می‌کند. «پایش پس‌زمینه» پردازش را مستقل با PID و فایل log محلی راه می‌اندازد؛ بنابراین سلول بعدی بدون انتظار اجرا می‌شود و دکمه مکث همان process tree را متوقف می‌کند.</Banner>
          <div className="stage-cells stage-cell-ledger"><div className="stage-cell-ledger-head"><span>سلول و کنترل مرحله</span><span>گزارش عملکرد همان سلول</span></div>{selected.cells.map((cell,index)=><StageCellCard key={`${cell.id}-${cell.content}-${cell.notes}-${cell.executionMode}-${cell.commandId??"idle"}`} cell={cellDrafts[cell.id]??cell} attempt={attemptByCell.get(cell.id)??null} index={index} count={selected.cells.length} busy={busy||busyCell===cell.id} expanded={expandedCellId===cell.id} editing={editingCellId===cell.id} onToggle={()=>{setExpandedCellId(current=>current===cell.id?null:cell.id);if(expandedCellId===cell.id)setEditingCellId(null)}} onEdit={()=>{setExpandedCellId(cell.id);setEditingCellId(current=>current===cell.id?null:cell.id)}} onDraftChange={rememberCellDraft} onSave={cell=>{void saveCellDraft(cell);setEditingCellId(null)}} onRun={run} onPause={pause} onMonitor={setMonitorCommandId} onCopy={copyPackage} onDelete={deleteCell} onMove={(id,direction)=>update({moveCell:{id,direction}})}/>)}</div></>:<section className="stage-whole-view"><div className="stage-whole-head"><div><h4>نمای متنی کامل دفترچه</h4><p>این متن را یکجا برای چت‌بات بفرستید. چت‌بات می‌تواند عنوان، هدف، تنظیمات و کد همه سلول‌ها را ویرایش کند؛ سپس پاسخ را اینجا Paste و اعمال کنید.</p></div><div className="actions-inline"><button type="button" className="button" onClick={()=>void copyWhole()}>کپی کل دفترچه</button><button type="button" className="button" onClick={()=>setWholeText(formatWholeNotebook(selected))}>بازنشانی از سلول‌ها</button><button type="button" className="button primary" disabled={busy} onClick={()=>void applyWhole()}>اعمال و تبدیل به سلول‌ها</button></div></div><div className="stage-whole-warning">خطوطی که با <code># @</code> شروع می‌شوند متادیتای ساختاری هستند. هر جداکننده را در یک خط مستقل نگه دارید؛ نشانگر شماره‌دار <code># %% [stage-notebook-cell:001]</code> مرز قطعی سلول است و شماره‌ها در خروجی بعدی خودکار بازسازی می‌شوند.</div><textarea className="stage-whole-editor" dir="ltr" value={wholeText} onChange={event=>setWholeText(event.target.value)} spellCheck={false} aria-label="متن کامل دفترچه"/></section>}
        </>}
      </main>
    </section>:null}
    {monitorCommandId?<CommandMonitorModal commandId={monitorCommandId} onClose={()=>setMonitorCommandId(null)}/>:null}
  </div>;
}

function StageCellCard({cell,attempt,index,count,busy,expanded,editing,onToggle,onEdit,onDraftChange,onSave,onRun,onPause,onMonitor,onCopy,onDelete,onMove}:{cell:Cell;attempt:ExecutionAttempt|null;index:number;count:number;busy:boolean;expanded:boolean;editing:boolean;onToggle:()=>void;onEdit:()=>void;onDraftChange:(c:Cell)=>void;onSave:(c:Cell)=>void;onRun:(c:Cell,all?:boolean)=>void;onPause:(c:Cell)=>void;onMonitor:(id:string)=>void;onCopy:(c:Cell)=>void;onDelete:(id:string)=>void;onMove:(id:string,direction:"up"|"down")=>void}){
  const [draft,setDraft]=useState<Cell>({...cell,executionMode:cell.executionMode??"blocking"});
  const set=<K extends keyof Cell>(key:K,value:Cell[K])=>setDraft(current=>{const next={...current,[key]:value};onDraftChange(next);return next});
  const reportStatus=attempt?attemptStatusFa(attempt):draft.commandId?"فرمان قبلی ثبت شده":"هنوز اجرا نشده";
  const reportMessage=attempt?.commandError||attempt?.message||draft.notes||"برای این سلول هنوز گزارشی ثبت نشده است.";
  function editorKeyDown(event:KeyboardEvent<HTMLTextAreaElement>){
    if((event.ctrlKey||event.metaKey)&&event.key==="Enter"){event.preventDefault();if(!busy&&draft.executable&&draft.content.trim())onRun(draft);return}
    if(event.key!=="Tab")return;event.preventDefault();const target=event.currentTarget,start=target.selectionStart,end=target.selectionEnd;set("content",draft.content.slice(0,start)+"    "+draft.content.slice(end));requestAnimationFrame(()=>{target.selectionStart=target.selectionEnd=start+4})
  }
  return <article className={`stage-compact-cell ${expanded?"expanded":""} ${attempt?.commandStatus??attempt?.status??"idle"}`}>
    <div className="stage-compact-row">
      <div className="stage-compact-primary">
        <button type="button" className="stage-row-toggle" onClick={onToggle} aria-expanded={expanded} title="نمایش جزئیات سلول"><span className="stage-cell-no">{(index+1).toLocaleString("fa-IR")}</span><span className={`stage-status-dot ${busy?"sending":draft.commandId?"submitted":"draft"}`}/><b>{draft.title}</b><code dir="ltr">{oneLine(draft.content,"سلول خالی است")}</code><small>{draft.content.split("\n").length.toLocaleString("fa-IR")} خط</small><span className="stage-row-chevron">{expanded?"⌃":"⌄"}</span></button>
        <div className="stage-row-actions"><button type="button" className="stage-mini-action play" disabled={busy||!draft.executable||!draft.content.trim()} onClick={()=>onRun(draft)} title="اجرای همین سلول">{busy?"…":"▶"}</button><button type="button" className="stage-mini-action" disabled={busy||!draft.commandId} onClick={()=>onPause(draft)} title="توقف امن">Ⅱ</button><button type="button" className={`stage-mini-action edit ${editing?"active":""}`} onClick={onEdit} title="ویرایش کد">✎</button></div>
      </div>
      <button type="button" className="stage-compact-report" onClick={onToggle} aria-expanded={expanded} title="نمایش گزارش کامل سلول"><span className={`stage-report-state ${attempt?.commandStatus??attempt?.status??"idle"}`}>{reportStatus}</span><p>{oneLine(reportMessage,"بدون گزارش")}</p><time>{attempt?tehranDate(attempt.updatedAt):"—"}</time><span>جزئیات {expanded?"⌃":"⌄"}</span></button>
    </div>
    {expanded?<div className="stage-cell-expanded">
      <section className="stage-cell-detail"><header><div><span>سلول {(index+1).toLocaleString("fa-IR")}</span><h4>{draft.title}</h4></div><button type="button" className={`button stage-cell-edit-toggle ${editing?"active":""}`} onClick={onEdit}>{editing?"بستن ویرایش":"ویرایش کد و تنظیمات"}</button></header>
        {editing?<><div className="stage-cell-options"><select className="input stage-language" value={draft.language} onChange={e=>set("language",e.target.value)}><option value="python">Python</option><option value="powershell">PowerShell</option><option value="cmd">CMD</option></select><div className="stage-segment"><button type="button" className={draft.executionMode==="blocking"?"active":""} onClick={()=>set("executionMode","blocking")}>ترتیبی</button><button type="button" className={draft.executionMode==="background"?"active":""} onClick={()=>set("executionMode","background")}>پایش پس‌زمینه</button></div><div className="stage-segment"><button type="button" className={draft.transition==="manual"?"active":""} onClick={()=>set("transition","manual")}>توقف بعد از این</button><button type="button" className={draft.transition==="on_success"?"active":""} onClick={()=>set("transition","on_success")}>ادامه در موفقیت</button></div><label className="stage-enabled"><input type="checkbox" checked={draft.executable} onChange={e=>set("executable",e.target.checked)}/>فعال</label></div><input className="input stage-expanded-title" value={draft.title} onChange={e=>set("title",e.target.value)} aria-label="نام مرحله"/><textarea className="stage-code stage-inline-editor" dir="ltr" rows={Math.max(10,Math.min(24,draft.content.split("\n").length+2))} value={draft.content} onChange={e=>set("content",e.target.value)} onKeyDown={editorKeyDown} spellCheck={false}/><textarea className="input textarea stage-inline-notes" rows={2} value={draft.notes} onChange={e=>set("notes",e.target.value)} placeholder="یادداشت و معیار موفقیت این سلول…"/><div className="stage-expanded-actions"><button type="button" className="button primary" disabled={busy} onClick={()=>onSave(draft)}>✓ ذخیره سلول</button><button type="button" className="button" disabled={busy} onClick={()=>void onCopy(draft)}>کپی برای چت‌بات</button><button type="button" className="button" disabled={busy||index===0} onClick={()=>onMove(cell.id,"up")}>↑ انتقال بالا</button><button type="button" className="button" disabled={busy||index===count-1} onClick={()=>onMove(cell.id,"down")}>↓ انتقال پایین</button><button type="button" className="button danger stage-danger-action" disabled={busy} onClick={()=>window.confirm("این سلول حذف شود؟")&&onDelete(cell.id)}>× حذف</button></div></>:<pre className="stage-code-preview" dir="ltr">{draft.content||"# سلول خالی است"}</pre>}
      </section>
      <section className="stage-cell-report-detail"><header><div><span>گزارش عملکرد</span><h4>{reportStatus}</h4></div>{draft.commandId?<button type="button" className="button stage-monitor-action" onClick={()=>onMonitor(draft.commandId!)}>مانیتور کامل</button>:null}</header>{attempt?<><div className="stage-report-meta"><span>Attempt <code dir="ltr">{attempt.id.slice(0,8)}</code></span><span>{attemptPhaseFa(attempt.phase)}</span><span>{tehranDate(attempt.updatedAt)}</span></div><p className="stage-report-message">{reportMessage}</p><div className="stage-cell-step-list">{attempt.steps.map((step,stepIndex)=><div className={`stage-cell-step ${step.level}`} key={`${step.at}-${stepIndex}`}><span>{step.level==="success"?"✓":step.level==="error"?"×":"•"}</span><time>{tehranDate(step.at)}</time><b>{attemptPhaseFa(step.phase)}</b><p>{step.message}</p></div>)}</div></>:<div className="stage-empty-report"><span>○</span><p>پس از اجرای این سلول، خلاصه وضعیت در ردیف بالا و گزارش کامل در همین ستون نمایش داده می‌شود.</p></div>}</section>
    </div>:null}
  </article>
}

function formatWholeNotebook(notebook:Notebook):string{
  const header=[
    "# STAGE NOTEBOOK FORMAT v1",
    `# @notebook-title ${JSON.stringify(notebook.title)}`,
    `# @goal ${JSON.stringify(notebook.goal)}`,
    `# @chatbot-guide ${JSON.stringify(notebook.chatbotGuide)}`,
    "# این قالب را می‌توان یکجا به چت‌بات داد و سپس دوباره در دفترچه اعمال کرد.",
  ];
  const cells=notebook.cells.map((cell,index)=>[
    `# %% [stage-notebook-cell:${String(index+1).padStart(3,"0")}]`,
    `# @id ${JSON.stringify(cell.id)}`,
    `# @title ${JSON.stringify(cell.title)}`,
    `# @language ${JSON.stringify(cell.language)}`,
    `# @execution ${JSON.stringify(cell.executionMode)}`,
    `# @transition ${JSON.stringify(cell.transition)}`,
    `# @enabled ${JSON.stringify(cell.executable)}`,
    `# @notes ${JSON.stringify(cell.notes)}`,
    "",
    cell.content,
  ].join("\n"));
  return [...header,...cells].join("\n\n").trimEnd()+"\n";
}

function parseWholeNotebook(source:string):{title:string;goal:string;chatbotGuide:string;cells:Cell[]}{
  const parts=splitWholeNotebook(source);
  const header=metadata(parts.shift()??"");
  if(parts.length===0)throw new Error("هیچ جداکننده سلولی شناخته نشد. هر سلول را با یک خط مستقل مانند # %% [stage-notebook-cell:001] جدا کنید.");
  const cells=parts.map((part,index)=>{
    const lines=part.replace(/^\n/,"").split("\n");
    const meta:Record<string,unknown>={};
    let cursor=0;
    while(cursor<lines.length){
      const line=lines[cursor];
      if(!line.trim()){cursor+=1;break;}
      const match=line.match(/^# @([a-z-]+)\s+(.+)$/);
      if(!match)break;
      meta[match[1]]=metadataValue(match[2]);
      cursor+=1;
    }
    const language=typeof meta.language==="string"?meta.language:"python";
    if(!["python","powershell","cmd"].includes(language))throw new Error(`زبان سلول ${(index+1).toLocaleString("fa-IR")} معتبر نیست.`);
    return {
      id:typeof meta.id==="string"?meta.id:"",
      title:typeof meta.title==="string"&&meta.title.trim()?meta.title:`مرحله ${index+1}`,
      language,
      content:lines.slice(cursor).join("\n").trimEnd(),
      notes:typeof meta.notes==="string"?meta.notes:"",
      executionMode:meta.execution==="background"?"background":"blocking",
      transition:meta.transition==="on_success"?"on_success":"manual",
      executable:meta.enabled!==false,
      commandId:null,
    } as Cell;
  });
  return {
    title:typeof header["notebook-title"]==="string"&&header["notebook-title"].trim()?header["notebook-title"]:"دفترچه بدون نام",
    goal:typeof header.goal==="string"?header.goal:"",
    chatbotGuide:typeof header["chatbot-guide"]==="string"?header["chatbot-guide"]:"",
    cells,
  };
}

function splitWholeNotebook(source:string):string[]{
  let normalized=source.replace(/\r\n?/g,"\n").trim();
  const fenced=normalized.match(/^```(?:python|py|text)?\s*\n([\s\S]*?)\n```\s*$/i);
  if(fenced)normalized=fenced[1];
  const formatAnchor=normalized.lastIndexOf("# STAGE NOTEBOOK FORMAT v1");
  if(formatAnchor>0)normalized=normalized.slice(formatAnchor);
  const lines=normalized.split("\n");
  const parts:string[]=[];
  let current:string[]=[];
  let found=false;
  for(const line of lines){
    if(isNotebookCellSeparator(line)){
      parts.push(current.join("\n"));
      current=[];
      found=true;
      continue;
    }
    current.push(line);
  }
  if(found)parts.push(current.join("\n"));
  return found?parts:[normalized];
}
function isNotebookCellSeparator(line:string):boolean{
  const value=line.trim();
  if(/^#\s*%%\s*\[\s*stage-notebook-cell(?:\s*[:#-]\s*[0-9۰-۹]+)?\s*\]\s*$/iu.test(value))return true;
  if(/^#\s*[-_=]{3,}\s*(?:(?:stage-notebook-)?cell|stage|سلول|مرحله)(?:\s*[:#-]?\s*[0-9۰-۹]+)?\s*[-_=]{3,}\s*$/iu.test(value))return true;
  if(/^(?:#\s*)?(?:"{3}|'{3})?\s*[-_=]{8,}\s*(?:"{3}|'{3})?\s*$/.test(value))return true;
  return false;
}

function metadata(source:string):Record<string,unknown>{
  const result:Record<string,unknown>={};
  for(const line of source.split("\n")){
    const match=line.match(/^# @([a-z-]+)\s+(.+)$/);
    if(match)result[match[1]]=metadataValue(match[2]);
  }
  return result;
}
function metadataValue(value:string):unknown{try{return JSON.parse(value)}catch{return value.trim()}}

function oneLine(value:string,fallback:string){const result=value.replace(/\s+/g," ").trim();return result||fallback}
function tehranDate(value:string){try{return new Intl.DateTimeFormat("fa-IR-u-ca-persian",{timeZone:"Asia/Tehran",year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(new Date(value))}catch{return value}}
function commandStatusFa(status:string){return ({pending:"در صف",claimed:"دریافت‌شده",waiting_confirmation:"منتظر تأیید",running:"در حال اجرا",succeeded:"موفق",failed:"ناموفق",cancelled:"لغوشده",timed_out:"پایان زمان",rejected:"ردشده"} as Record<string,string>)[status]??status}
function attemptPhaseFa(phase:string){return ({request_received:"دریافت Play",notebook_validated:"اعتبارسنجی سلول",agent_selection:"یافتن Agent آنلاین",agent_selected:"انتخاب Agent",source_built:"تولید کد",automation_saved:"ذخیره نسخه PostgreSQL",command_created:"ساخت فرمان"} as Record<string,string>)[phase]??phase}
function attemptStatusFa(attempt:ExecutionAttempt){if(attempt.commandStatus)return commandStatusFa(attempt.commandStatus);return ({preparing:"در حال آماده‌سازی",queued:"فرمان ساخته شد",failed:"شکست پیش از اجرا"} as Record<string,string>)[attempt.status]??attempt.status}
function message(error:unknown,fallback:string){if(!(error instanceof Error))return fallback;const extra=error as Error&{hint?:string;details?:unknown};const detail=Array.isArray(extra.details)?extra.details.map(item=>item&&typeof item==="object"&&"message" in item?String((item as {message:unknown}).message):"").filter(Boolean).slice(0,2).join("؛ "):"";return [error.message,extra.hint,detail].filter(Boolean).join(" — ");}
