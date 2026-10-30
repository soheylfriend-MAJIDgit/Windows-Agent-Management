"use client";

import { type KeyboardEvent, useMemo, useState } from "react";
import { CommandMonitorModal } from "./CommandMonitorModal";
import { Banner, ErrorBanner, LoadingState } from "./ui";
import { useToast } from "./ToastProvider";
import { postJson, useApi } from "@/hooks/useApi";

type ExecutionMode = "blocking" | "background";
type Transition = "manual" | "on_success";
interface Cell { id:string; title:string; language:string; content:string; notes:string; transition:Transition; executionMode:ExecutionMode; executable:boolean; commandId:string|null }
interface Notebook { id:string; title:string; goal:string; chatbotGuide:string; cells:Cell[] }

export function StageNotebooksWorkspace() {
  const api = useApi<{notebooks:Notebook[]}>("/api/stage-notebooks");
  const notify = useToast();
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [title,setTitle]=useState("");
  const [goal,setGoal]=useState("");
  const [busy,setBusy]=useState(false);
  const [busyCell,setBusyCell]=useState<string|null>(null);
  const [commandId,setCommandId]=useState<string|null>(null);
  const selected=useMemo(()=>api.data?.notebooks.find(n=>n.id===selectedId)??api.data?.notebooks[0]??null,[api.data,selectedId]);
  const firstRunnable=selected?.cells.find(cell=>cell.executable&&cell.content.trim())??null;
  const runnableCount=selected?.cells.filter(cell=>cell.executable&&cell.content.trim()).length??0;
  const backgroundCount=selected?.cells.filter(cell=>cell.executable&&cell.executionMode==="background").length??0;

  async function create(){if(!title.trim())return;setBusy(true);try{const r=await postJson<{notebook:Notebook}>("/api/stage-notebooks",{action:"create",title,goal});setTitle("");setGoal("");await api.reload();setSelectedId(r.notebook.id);notify.ok("دفترچه ساخته شد.");}catch(e){notify.error(message(e,"ساخت دفترچه ممکن نشد."));}finally{setBusy(false)}}
  async function update(body:Record<string,unknown>,quiet=false){if(!selected)return;setBusy(true);try{await postJson("/api/stage-notebooks",{action:"update",id:selected.id,...body});await api.reload();if(!quiet)notify.ok("تغییرها در D1 ذخیره شد.");}catch(e){notify.error(message(e,"ذخیره ممکن نشد."));}finally{setBusy(false)}}
  async function remove(){if(!selected||!window.confirm(`دفترچه «${selected.title}» حذف شود؟`))return;setBusy(true);try{await postJson("/api/stage-notebooks",{action:"delete",id:selected.id});setSelectedId(null);await api.reload();notify.ok("دفترچه حذف شد.");}catch(e){notify.error(message(e,"حذف ممکن نشد."));}finally{setBusy(false)}}
  async function run(cell:Cell,runAll=false){if(!selected)return;setBusyCell(cell.id);try{await postJson("/api/stage-notebooks",{action:"update",id:selected.id,cell});const r=await postJson<{commandId:string}>("/api/stage-notebooks",{action:"run",id:selected.id,cellId:cell.id,runAll});setCommandId(r.commandId);await api.reload();notify.ok(runAll?"اجرای ترتیبی دفترچه ارسال شد.":cell.executionMode==="background"?"پایش پس‌زمینه روی Windows راه‌اندازی می‌شود.":"سلول برای Windows Agent ارسال شد.");}catch(e){notify.error(message(e,"اجرای مرحله ممکن نشد."));}finally{setBusyCell(null)}}
  async function pause(cell:Cell){if(!selected)return;setBusyCell(cell.id);try{const r=await postJson<{commandId:string}>("/api/stage-notebooks",{action:"pause",id:selected.id,cellId:cell.id});setCommandId(r.commandId);await api.reload();notify.ok(cell.executionMode==="background"?"فرمان توقف پردازش پایشی ارسال شد.":"درخواست توقف امن اجرای سلول ثبت شد.");}catch(e){notify.error(message(e,"توقف مرحله ممکن نشد."));}finally{setBusyCell(null)}}
  async function copyPackage(cell:Cell){if(!selected)return;const text=`${selected.chatbotGuide}\n\nهدف نهایی:\n${selected.goal}\n\nمرحله جاری: ${cell.title}\nزبان: ${cell.language}\nنوع اجرا: ${cell.executionMode==="background"?"پایش مستقل پس‌زمینه":"ترتیبی و منتظر نتیجه"}\n\nکد/محتوا:\n${cell.content}\n\nیادداشت و نتیجه مرحله:\n${cell.notes||"هنوز نتیجه‌ای ثبت نشده است."}\n\nلطفاً فقط مرحله بعدی لازم، کد کامل آن، معیار موفقیت و مواردی را که باید در اسکرین‌شات بررسی کنم ارائه کن.`;await navigator.clipboard.writeText(text);notify.ok("بسته راهنما برای چت‌بات کپی شد.")}

  return <>
    <div className="stage-topbar">
      <div className="stage-topbar-copy"><strong>دفترچه‌های اجرایی Windows</strong><span>سلول‌های ترتیبی منتظر پایان می‌مانند؛ سلول‌های پایشی مستقل راه‌اندازی می‌شوند و مسیر ادامه پیدا می‌کند.</span><div className="stage-stats"><span><b>{runnableCount.toLocaleString("fa-IR")}</b> سلول آماده</span><span><b>{backgroundCount.toLocaleString("fa-IR")}</b> پایش مستقل</span><span className={firstRunnable?"ready":"idle"}>{firstRunnable?"آماده اجرا":"منتظر کد"}</span></div></div>
      <div className="actions-inline"><button type="button" className="button primary stage-run-all" disabled={!firstRunnable||busy||Boolean(busyCell)} onClick={()=>firstRunnable&&void run(firstRunnable,true)}>{busyCell?"در حال ارسال…":"▶ اجرای کل دفترچه"}</button>{commandId?<button type="button" className="button" onClick={()=>setCommandId(commandId)}>نمایش آخرین اجرا</button>:null}</div>
    </div>
    {api.loading&&!api.data?<LoadingState label="در حال دریافت دفترچه‌ها…"/>:null}{api.error?<ErrorBanner error={api.error} onRetry={()=>void api.reload()}/>:null}
    <section className="stage-layout stage-layout-modal">
      <aside className="stage-sidebar">
        <div className="stage-sidebar-title"><h3>دفترچه‌ها</h3><span>{(api.data?.notebooks.length??0).toLocaleString("fa-IR")}</span></div>
        <input className="input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="نام دفترچه جدید" maxLength={120}/>
        <textarea className="input textarea" value={goal} onChange={e=>setGoal(e.target.value)} placeholder="هدف نهایی" rows={2}/>
        <button type="button" className="button primary" disabled={busy||title.trim().length<2} onClick={()=>void create()}>+ ساخت دفترچه</button>
        <div className="stage-book-list">{api.data?.notebooks.map(n=><button type="button" key={n.id} className={`stage-book ${selected?.id===n.id?"active":""}`} onClick={()=>setSelectedId(n.id)}><strong>{n.title}</strong><span>{n.cells.length.toLocaleString("fa-IR")} سلول</span></button>)}</div>
      </aside>
      <main className="stage-workspace">
        {!selected?<div className="empty-state stage-empty"><span>⌘</span><strong>هنوز دفترچه‌ای انتخاب نشده است</strong><p>یک دفترچه تازه بسازید یا از فهرست کناری انتخاب کنید.</p></div>:<>
          <div className="stage-head"><div><h3>{selected.title}</h3><p>{selected.goal||"هدف نهایی هنوز نوشته نشده است."}</p></div><div className="actions-inline"><button type="button" className="button" disabled={busy} onClick={()=>void update({addCell:true})}>+ سلول کد</button><button type="button" className="button danger" disabled={busy} onClick={()=>void remove()}>حذف دفترچه</button></div></div>
          <details className="advanced-settings"><summary>تنظیمات و راهنمای ثابت چت‌بات</summary><div className="stage-settings-grid"><label className="field"><span className="field-label">نام دفترچه</span><input className="input" defaultValue={selected.title} onBlur={e=>void update({title:e.target.value},true)}/></label><label className="field"><span className="field-label">هدف نهایی</span><textarea className="input textarea" rows={3} defaultValue={selected.goal} onBlur={e=>void update({goal:e.target.value},true)}/></label></div><label className="field"><span className="field-label">راهنمای ثابت چت‌بات</span><textarea className="input textarea" rows={5} defaultValue={selected.chatbotGuide} onBlur={e=>void update({chatbotGuide:e.target.value},true)}/></label></details>
          <Banner tone="info" title="دو نوع اجرای سلول">«ترتیبی» تا پایان کد صبر می‌کند. «پایش پس‌زمینه» پردازش را مستقل با PID و فایل log محلی راه می‌اندازد؛ بنابراین سلول بعدی بدون انتظار اجرا می‌شود و دکمه مکث همان process tree را متوقف می‌کند.</Banner>
          <div className="stage-cells">{selected.cells.map((cell,index)=><StageCellCard key={`${cell.id}-${cell.content}-${cell.notes}-${cell.executionMode}-${cell.commandId??"idle"}`} cell={cell} index={index} count={selected.cells.length} busy={busy||busyCell===cell.id} onSave={cell=>update({cell})} onRun={run} onPause={pause} onMonitor={setCommandId} onCopy={copyPackage} onDelete={id=>update({deleteCell:id})} onMove={(id,direction)=>update({moveCell:{id,direction}})}/>)}</div>
        </>}
      </main>
    </section>
    {commandId?<CommandMonitorModal commandId={commandId} onClose={()=>setCommandId(null)}/>:null}
  </>;
}

function StageCellCard({cell,index,count,busy,onSave,onRun,onPause,onMonitor,onCopy,onDelete,onMove}:{cell:Cell;index:number;count:number;busy:boolean;onSave:(c:Cell)=>void;onRun:(c:Cell,all?:boolean)=>void;onPause:(c:Cell)=>void;onMonitor:(id:string)=>void;onCopy:(c:Cell)=>void;onDelete:(id:string)=>void;onMove:(id:string,direction:"up"|"down")=>void}){
  const [draft,setDraft]=useState<Cell>({...cell,executionMode:cell.executionMode??"blocking"});
  const set=<K extends keyof Cell>(key:K,value:Cell[K])=>setDraft(d=>({...d,[key]:value}));
  function editorKeyDown(event:KeyboardEvent<HTMLTextAreaElement>){
    if((event.ctrlKey||event.metaKey)&&event.key==="Enter"){event.preventDefault();if(!busy&&draft.executable&&draft.content.trim())onRun(draft);return;}
    if(event.key!=="Tab")return;
    event.preventDefault();
    const target=event.currentTarget,start=target.selectionStart,end=target.selectionEnd;
    const next=draft.content.slice(0,start)+"    "+draft.content.slice(end);
    set("content",next);
    requestAnimationFrame(()=>{target.selectionStart=target.selectionEnd=start+4;});
  }
  return <article className={`stage-cell-card ${draft.executionMode==="background"?"is-background":""}`}>
    <header className="stage-cell-toolbar"><div className="stage-cell-identity"><span className="stage-cell-no">{(index+1).toLocaleString("fa-IR")}</span><span className={`stage-status-dot ${busy?"sending":draft.commandId?"submitted":"draft"}`} aria-hidden="true"/><input className="stage-title-input" value={draft.title} onChange={e=>set("title",e.target.value)} aria-label="نام مرحله"/><span className="stage-line-count">{draft.content.split("\n").length.toLocaleString("fa-IR")} خط</span></div><div className="stage-run-controls"><button type="button" className="stage-icon-button play" disabled={busy||!draft.executable||!draft.content.trim()} onClick={()=>onRun(draft)} title="اجرای این سلول روی Windows">{busy?"…":"▶"}</button><button type="button" className="stage-icon-button pause" disabled={busy||!draft.commandId} onClick={()=>onPause(draft)} title="توقف امن اجرای این سلول">Ⅱ</button>{draft.commandId?<button type="button" className="stage-icon-button monitor" onClick={()=>onMonitor(draft.commandId!)} title="نمایش مانیتور، خروجی و تصاویر">●</button>:null}</div></header>
    <div className="stage-cell-options"><select className="input stage-language" value={draft.language} onChange={e=>set("language",e.target.value)}><option value="python">Python</option><option value="powershell">PowerShell</option><option value="cmd">CMD</option></select><div className="stage-segment" role="group" aria-label="نوع اجرا"><button type="button" className={draft.executionMode==="blocking"?"active":""} onClick={()=>set("executionMode","blocking")}>ترتیبی</button><button type="button" className={draft.executionMode==="background"?"active":""} onClick={()=>set("executionMode","background")}>پایش پس‌زمینه</button></div><div className="stage-segment" role="group" aria-label="ادامه بعدی"><button type="button" className={draft.transition==="manual"?"active":""} onClick={()=>set("transition","manual")}>توقف بعد از این</button><button type="button" className={draft.transition==="on_success"?"active":""} onClick={()=>set("transition","on_success")}>ادامه در موفقیت</button></div><label className="stage-enabled"><input type="checkbox" checked={draft.executable} onChange={e=>set("executable",e.target.checked)}/><span>فعال</span></label></div>
    <div className="stage-editor-shell"><div className="stage-editor-gutter">{Array.from({length:Math.max(8,draft.content.split("\n").length)},(_,i)=><span key={i}>{i+1}</span>)}</div><textarea className="stage-code" dir="ltr" rows={Math.max(8,Math.min(20,draft.content.split("\n").length+2))} value={draft.content} onChange={e=>set("content",e.target.value)} onKeyDown={editorKeyDown} spellCheck={false} placeholder={'# Python code\nprint("Hello from Windows Agent")'} aria-label={`کد ${draft.title}`}/></div>
    <details className="stage-cell-notes"><summary>یادداشت، نتیجه و همکاری با چت‌بات</summary><textarea className="input textarea" rows={3} value={draft.notes} onChange={e=>set("notes",e.target.value)} placeholder="خروجی مورد انتظار، نتیجه مرحله، خطا یا تصمیم بعدی…"/></details>
    <footer><span className={`stage-mode-badge ${draft.executionMode}`}>{draft.executionMode==="background"?"پایش مستقل؛ بدون انتظار":"اجرای ترتیبی؛ منتظر پایان"}</span><span className="stage-shortcut" dir="ltr">Ctrl + Enter = Run</span>{draft.commandId?<code title={draft.commandId}>اجرا: {draft.commandId.slice(0,8)}</code>:<span className="muted">هنوز اجرا نشده</span>}<div className="stage-cell-actions"><button type="button" className="button" disabled={busy||index===0} onClick={()=>onMove(cell.id,"up")}>↑</button><button type="button" className="button" disabled={busy||index===count-1} onClick={()=>onMove(cell.id,"down")}>↓</button><button type="button" className="button" disabled={busy} onClick={()=>onSave(draft)}>ذخیره</button><button type="button" className="button" disabled={busy} onClick={()=>void onCopy(draft)}>کپی برای چت‌بات</button><button type="button" className="button danger" disabled={busy} onClick={()=>window.confirm("این سلول حذف شود؟")&&onDelete(cell.id)}>حذف</button></div></footer>
  </article>;
}

function message(error:unknown,fallback:string){return error instanceof Error?error.message:fallback;}
