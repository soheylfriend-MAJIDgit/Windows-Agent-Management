"use client";

import { useMemo, useState } from "react";
import { CommandMonitorModal } from "@/components/CommandMonitorModal";
import { Banner, ErrorBanner, LoadingState, PageHeader } from "@/components/ui";
import { useToast } from "@/components/ToastProvider";
import { postJson, useApi } from "@/hooks/useApi";

interface Cell { id:string; title:string; language:string; content:string; notes:string; transition:"manual"|"on_success"; executable:boolean; commandId:string|null }
interface Notebook { id:string; title:string; goal:string; chatbotGuide:string; cells:Cell[] }

export default function StageNotebooksPage() {
  const api = useApi<{notebooks:Notebook[]}>("/api/stage-notebooks");
  const notify = useToast();
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [title,setTitle]=useState(""); const [goal,setGoal]=useState("");
  const [busy,setBusy]=useState(false); const [commandId,setCommandId]=useState<string|null>(null);
  const selected=useMemo(()=>api.data?.notebooks.find(n=>n.id===selectedId)??api.data?.notebooks[0]??null,[api.data,selectedId]);

  async function create(){ if(!title.trim()) return; setBusy(true); try{const r=await postJson<{notebook:Notebook}>("/api/stage-notebooks",{action:"create",title,goal}); setTitle("");setGoal(""); await api.reload();setSelectedId(r.notebook.id);notify.ok("دفترچه مرحله‌ای ساخته شد.");}catch(e){notify.error(e instanceof Error?e.message:"ساخت دفترچه ممکن نشد.");}finally{setBusy(false)} }
  async function update(body:Record<string,unknown>){if(!selected)return; setBusy(true);try{await postJson("/api/stage-notebooks",{action:"update",id:selected.id,...body});await api.reload();notify.ok("تغییرها در D1 ذخیره شد.");}catch(e){notify.error(e instanceof Error?e.message:"ذخیره ممکن نشد.");}finally{setBusy(false)}}
  async function run(cell:Cell){if(!selected)return; setBusy(true);try{await postJson("/api/stage-notebooks",{action:"update",id:selected.id,cell});const r=await postJson<{commandId:string}>("/api/stage-notebooks",{action:"run",id:selected.id,cellId:cell.id});setCommandId(r.commandId);await api.reload();notify.ok("مرحله ذخیره و برای Windows Agent ارسال شد.");}catch(e){notify.error(e instanceof Error?e.message:"اجرای مرحله ممکن نشد.");}finally{setBusy(false)}}
  async function copyPackage(cell:Cell){if(!selected)return;const text=`${selected.chatbotGuide}\n\nهدف نهایی:\n${selected.goal}\n\nمرحله جاری: ${cell.title}\nزبان: ${cell.language}\n\nکد/محتوا:\n${cell.content}\n\nیادداشت و نتیجه مرحله:\n${cell.notes||"هنوز نتیجه‌ای ثبت نشده است."}\n\nلطفاً فقط مرحله بعدی لازم، کد کامل آن، معیار موفقیت و مواردی را که باید در اسکرین‌شات بررسی کنم ارائه کن.`;await navigator.clipboard.writeText(text);notify.ok("بسته راهنما برای چت‌بات کپی شد.")}

  return <>
    <PageHeader eyebrow="یادگیری و ساخت تعاملی" title="دفترچه هدایت مرحله‌ای" subtitle="مراحل را مثل یک notebook ذخیره کنید، نتیجه و اسکرین‌شات را با چت‌بات واقعی بررسی کنید و کد مرحله بعد را برگردانید." />
    <Banner tone="info" title="بدون API مدل">این بخش چیزی را خودکار به LLM نمی‌فرستد. برای هر مرحله یک بسته آماده کپی می‌سازد؛ شما آن را در چت‌بات دلخواه می‌فرستید و پاسخ را در سلول بعدی ذخیره می‌کنید.</Banner>
    {api.loading&&!api.data?<LoadingState label="در حال دریافت دفترچه‌ها…"/>:null}{api.error?<ErrorBanner error={api.error} onRetry={()=>void api.reload()}/>:null}
    <section className="stage-layout">
      <aside className="stage-sidebar">
        <h2>دفترچه‌ها</h2>
        <input className="input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="نام دفترچه" maxLength={120}/>
        <textarea className="input textarea" value={goal} onChange={e=>setGoal(e.target.value)} placeholder="هدف نهایی" rows={3}/>
        <button className="button primary" disabled={busy||title.trim().length<2} onClick={()=>void create()}>ساخت دفترچه</button>
        <div className="stage-book-list">{api.data?.notebooks.map(n=><button key={n.id} className={`stage-book ${selected?.id===n.id?"active":""}`} onClick={()=>setSelectedId(n.id)}><strong>{n.title}</strong><span>{n.cells.length.toLocaleString("fa-IR")} مرحله</span></button>)}</div>
      </aside>
      <div className="stage-workspace">
        {!selected?<div className="empty-state">یک دفترچه تازه بسازید.</div>:<>
          <div className="stage-head"><div><h2>{selected.title}</h2><p>{selected.goal||"هدف هنوز نوشته نشده است."}</p></div><button className="button" disabled={busy} onClick={()=>void update({addCell:true})}>+ مرحله جدید</button></div>
          <details className="advanced-settings"><summary>راهنمای ثابت چت‌بات</summary><textarea className="input textarea" rows={6} defaultValue={selected.chatbotGuide} onBlur={e=>void update({chatbotGuide:e.target.value})}/></details>
          <div className="stage-cells">{selected.cells.map((cell,index)=><StageCellCard key={cell.id} cell={cell} index={index} busy={busy} onSave={cell=>update({cell})} onRun={run} onCopy={copyPackage}/>)}</div>
        </>}
      </div>
    </section>
    {commandId?<CommandMonitorModal commandId={commandId} onClose={()=>setCommandId(null)}/>:null}
  </>;
}

function StageCellCard({cell,index,busy,onSave,onRun,onCopy}:{cell:Cell;index:number;busy:boolean;onSave:(c:Cell)=>void;onRun:(c:Cell)=>void;onCopy:(c:Cell)=>void}){
 const [draft,setDraft]=useState(cell); const set=<K extends keyof Cell>(key:K,value:Cell[K])=>setDraft(d=>({...d,[key]:value}));
 return <article className="stage-cell-card"><header><span className="stage-cell-no">{(index+1).toLocaleString("fa-IR")}</span><input className="input" value={draft.title} onChange={e=>set("title",e.target.value)}/><select className="input" value={draft.language} onChange={e=>set("language",e.target.value)}><option value="python">Python</option><option value="powershell">PowerShell</option><option value="cmd">CMD</option><option value="javascript">JavaScript</option><option value="html">HTML</option><option value="sql">SQL</option><option value="text">متن عمومی</option></select></header>
 <textarea className="input stage-code" dir="ltr" rows={9} value={draft.content} onChange={e=>set("content",e.target.value)} placeholder="کد یا محتوای مرحله…"/>
 <textarea className="input textarea" rows={3} value={draft.notes} onChange={e=>set("notes",e.target.value)} placeholder="نتیجه، خطا، برداشت از اسکرین‌شات یا پاسخ چت‌بات…"/>
 <footer><label className="service-checkbox"><input type="checkbox" checked={draft.executable} onChange={e=>set("executable",e.target.checked)}/><span>قابل اجرا روی Windows</span></label><select className="input" value={draft.transition} onChange={e=>set("transition",e.target.value as Cell["transition"])}><option value="manual">توقف برای تأیید من</option><option value="on_success">ادامه پس از موفقیت</option></select><button className="button" disabled={busy} onClick={()=>onSave(draft)}>ذخیره</button><button className="button" disabled={busy} onClick={()=>void onCopy(draft)}>کپی برای چت‌بات</button><button className="button primary" disabled={busy||!draft.executable||!draft.content.trim()} onClick={()=>onRun(draft)}>اجرا</button></footer></article>
}
