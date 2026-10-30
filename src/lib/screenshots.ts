import { AppError } from "./errors";
import type { AuthenticatedAgentKey } from "./agent-keys";
import { dbAll, dbBatch, dbFirst, dbRun, getScreenshotBucket } from "./db";
import { sha256Hex } from "./crypto";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const DEFAULT_BUDGET_BYTES = 8 * 1024 * 1024 * 1024;
const MIME_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

interface ScreenshotRow {
  id:string; object_key:string; command_id:string|null; execution_id:string|null; agent_key_id:string; agent_id:string|null;
  stage:string|null; name:string; mime_type:string; size:number; sha256:string; width:number|null; height:number|null;
  occurred_at:string|null; visibility:"private"|"public"; share_token:string|null; created_at:string; deleted_at:string|null;
}

export interface ScreenshotView {
  id:string; commandId:string|null; executionId:string|null; agentKeyId:string; agentId:string|null; stage:string|null;
  name:string; mimeType:string; size:number; sha256:string; width:number|null; height:number|null; occurredAt:string|null;
  visibility:"private"|"public"; createdAt:string; contentUrl:string; shareUrl:string|null;
}

function view(row:ScreenshotRow):ScreenshotView {
  return { id:row.id,commandId:row.command_id,executionId:row.execution_id,agentKeyId:row.agent_key_id,agentId:row.agent_id,
    stage:row.stage,name:row.name,mimeType:row.mime_type,size:Number(row.size),sha256:row.sha256,width:row.width,height:row.height,
    occurredAt:row.occurred_at,visibility:row.visibility,createdAt:row.created_at,contentUrl:`/api/screenshots/${row.id}/content`,
    shareUrl:row.visibility==="public"&&row.share_token?`/s/${row.share_token}`:null };
}

function value(input:FormDataEntryValue|null,max:number):string|null {
  if(typeof input!=="string")return null;
  const result=input.trim();
  return result?result.slice(0,max):null;
}
function integer(input:FormDataEntryValue|null,max:number):number|null {
  const result=Number(typeof input==="string"?input:NaN);
  return Number.isInteger(result)&&result>0&&result<=max?result:null;
}
function randomId(prefix:string,bytes=12):string {
  const data=new Uint8Array(bytes);crypto.getRandomValues(data);
  return `${prefix}_${Array.from(data,b=>b.toString(16).padStart(2,"0")).join("")}`;
}
function safeName(name:string,ext:string):string {
  const base=name.replace(/[^A-Za-z0-9._-]+/g,"_").replace(/^\.+/,"").slice(0,120);
  return base||`screenshot.${ext}`;
}
function validOccurredAt(value:string|null):string|null {
  if(!value)return null;
  const timestamp=Date.parse(value);
  if(!Number.isFinite(timestamp))throw new AppError("زمان ثبت تصویر معتبر نیست.",{status:400,code:"screenshot_time_invalid"});
  return new Date(timestamp).toISOString();
}

export async function uploadScreenshot(key:AuthenticatedAgentKey,form:FormData):Promise<ScreenshotView> {
  const file=form.get("file");
  if(!(file instanceof File))throw new AppError("فایل تصویر ارسال نشده است.",{status:400,code:"screenshot_file_missing"});
  const mime=file.type.toLowerCase();
  const ext=MIME_EXT[mime];
  if(!ext)throw new AppError("فقط تصویر PNG، JPEG یا WebP پذیرفته می‌شود.",{status:415,code:"screenshot_type_invalid"});
  if(file.size<1||file.size>MAX_IMAGE_BYTES)throw new AppError("حجم هر تصویر باید حداکثر ۱۰ مگابایت باشد.",{status:413,code:"screenshot_too_large"});
  const commandId=value(form.get("commandId"),80);
  if(commandId){
    const command=await dbFirst<{id:string}>("SELECT id FROM commands WHERE id = ? AND agent_key_id = ?",[commandId,key.id]);
    if(!command)throw new AppError("فرمان متعلق به این Agent پیدا نشد.",{status:404,code:"screenshot_command_not_found"});
  }
  const now=new Date().toISOString();
  const id=randomId("shot");
  const agentId=value(form.get("agentId"),120);
  const stage=value(form.get("stage"),120);
  const executionId=value(form.get("executionId"),120);
  const name=safeName(value(form.get("name"),180)||file.name,ext);
  const occurredAt=validOccurredAt(value(form.get("occurredAt"),60));
  const width=integer(form.get("width"),50_000);
  const height=integer(form.get("height"),50_000);
  const objectKey=`${now.slice(0,10).replaceAll("-","/")}/${key.id}/${id}.${ext}`;
  const bytes=await file.arrayBuffer();
  const hash=await sha256Hex(new Uint8Array(bytes));
  const duplicate=await dbFirst<ScreenshotRow>(`SELECT * FROM screenshots WHERE agent_key_id = ? AND COALESCE(command_id,'') = COALESCE(?,'') AND COALESCE(stage,'') = COALESCE(?,'') AND sha256 = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,[key.id,commandId,stage,hash]);
  if(duplicate)return view(duplicate);
  const bucket=await getScreenshotBucket();
  await bucket.put(objectKey,bytes,{httpMetadata:{contentType:mime,cacheControl:"private, max-age=3600"},customMetadata:{id,agentKeyId:key.id,sha256:hash}});
  try {
    const queries=[{sql:`INSERT INTO screenshots
      (id,object_key,command_id,execution_id,agent_key_id,agent_id,stage,name,mime_type,size,sha256,width,height,occurred_at,visibility,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'private',?)`,params:[id,objectKey,commandId,executionId,key.id,agentId,stage,name,mime,file.size,hash,width,height,occurredAt,now]}];
    if(commandId){
      queries.push({sql:`INSERT INTO command_artifacts
        (id,command_id,kind,stage,name,local_path,drive_url,mime_type,size,created_at)
        VALUES (?,?,?,?,?,NULL,?,?,?,?) ON CONFLICT(id) DO UPDATE SET stage=excluded.stage,name=excluded.name,drive_url=excluded.drive_url,mime_type=excluded.mime_type,size=excluded.size`,
        params:[`art_${id}`,commandId,"screenshot",stage,name,`/api/screenshots/${id}/content`,mime,file.size,now]});
      queries.push({sql:"UPDATE commands SET last_event_at = ? WHERE id = ?",params:[now,commandId]});
    }
    await dbBatch(queries);
  }catch(error){await bucket.delete(objectKey);throw error}
  const row=await dbFirst<ScreenshotRow>("SELECT * FROM screenshots WHERE id = ?",[id]);
  return view(row!);
}

export async function listScreenshots(options:{limit?:number;query?:string;commandId?:string;agentKeyId?:string}={}):Promise<{items:ScreenshotView[];usage:{bytes:number;count:number;budgetBytes:number;remainingBytes:number;percent:number}}> {
  const clauses=["deleted_at IS NULL"];const params:unknown[]=[];
  if(options.commandId){clauses.push("command_id = ?");params.push(options.commandId)}
  if(options.agentKeyId){clauses.push("agent_key_id = ?");params.push(options.agentKeyId)}
  if(options.query){clauses.push("(name LIKE ? OR stage LIKE ? OR command_id LIKE ? OR agent_id LIKE ?)");const q=`%${options.query.slice(0,100)}%`;params.push(q,q,q,q)}
  const limit=Math.min(Math.max(Number(options.limit)||80,1),200);
  const rows=await dbAll<ScreenshotRow>(`SELECT * FROM screenshots WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC LIMIT ?`,[...params,limit]);
  const totals=await dbFirst<{bytes:number;count:number}>("SELECT COALESCE(SUM(size),0) AS bytes, COUNT(*) AS count FROM screenshots WHERE deleted_at IS NULL");
  const budgetSetting=await dbFirst<{value:string}>("SELECT value FROM settings WHERE key = 'screenshots.budget_bytes'");
  const budget=Math.max(Number(budgetSetting?.value)||DEFAULT_BUDGET_BYTES,1);
  const bytes=Number(totals?.bytes||0);
  return {items:rows.map(view),usage:{bytes,count:Number(totals?.count||0),budgetBytes:budget,remainingBytes:Math.max(0,budget-bytes),percent:Math.min(100,(bytes/budget)*100)}};
}

export async function screenshotRow(id:string):Promise<ScreenshotRow> {
  if(!/^shot_[a-f0-9]{24}$/.test(id))throw new AppError("شناسه تصویر معتبر نیست.",{status:400,code:"screenshot_id_invalid"});
  const row=await dbFirst<ScreenshotRow>("SELECT * FROM screenshots WHERE id = ? AND deleted_at IS NULL",[id]);
  if(!row)throw new AppError("تصویر پیدا نشد یا قبلاً حذف شده است.",{status:404,code:"screenshot_not_found"});
  return row;
}
export async function screenshotContent(id:string){const row=await screenshotRow(id);const object=await (await getScreenshotBucket()).get(row.object_key);if(!object)throw new AppError("فایل تصویر در R2 پیدا نشد.",{status:404,code:"screenshot_object_missing"});return {row,object}}

export async function deleteScreenshots(ids:string[]):Promise<number>{
  const unique=[...new Set(ids)].filter(id=>/^shot_[a-f0-9]{24}$/.test(id)).slice(0,100);
  if(!unique.length)throw new AppError("حداقل یک تصویر برای حذف انتخاب کنید.",{status:400,code:"screenshots_delete_empty"});
  const placeholders=unique.map(()=>"?").join(",");
  const rows=await dbAll<ScreenshotRow>(`SELECT * FROM screenshots WHERE id IN (${placeholders}) AND deleted_at IS NULL`,unique);
  if(!rows.length)return 0;
  await (await getScreenshotBucket()).delete(rows.map(row=>row.object_key));
  const now=new Date().toISOString();
  await dbRun(`UPDATE screenshots SET deleted_at = ?, visibility = 'private', share_token = NULL WHERE id IN (${placeholders})`,[now,...unique]);
  await dbRun(`DELETE FROM command_artifacts WHERE id IN (${rows.map(()=>"?").join(",")})`,rows.map(row=>`art_${row.id}`));
  await dbRun("INSERT INTO events(kind,title,detail,created_at) VALUES('screenshots_deleted','حذف تصاویر R2',?,?)",[JSON.stringify({count:rows.length,ids:rows.map(row=>row.id)}),now]);
  return rows.length;
}

export async function setScreenshotSharing(id:string,enabled:boolean):Promise<ScreenshotView>{
  await screenshotRow(id);const token=enabled?randomId("share",18):null;
  await dbRun("UPDATE screenshots SET visibility = ?, share_token = ? WHERE id = ?",[enabled?"public":"private",token,id]);
  return view((await screenshotRow(id)));
}
export async function publicScreenshot(token:string){
  if(!/^share_[a-f0-9]{36}$/.test(token))throw new AppError("لینک عمومی معتبر نیست.",{status:404,code:"share_not_found"});
  const row=await dbFirst<ScreenshotRow>("SELECT * FROM screenshots WHERE share_token = ? AND visibility = 'public' AND deleted_at IS NULL",[token]);
  if(!row)throw new AppError("لینک عمومی وجود ندارد یا لغو شده است.",{status:404,code:"share_not_found"});
  const object=await (await getScreenshotBucket()).get(row.object_key);if(!object)throw new AppError("فایل عمومی پیدا نشد.",{status:404,code:"share_object_missing"});return {row,object};
}
export async function saveScreenshotBudget(bytes:number){if(!Number.isFinite(bytes)||bytes<100*1024*1024||bytes>10*1024*1024*1024*1024)throw new AppError("بودجه فضا باید بین ۱۰۰ مگابایت و ۱۰ ترابایت باشد.",{status:400,code:"screenshot_budget_invalid"});await dbRun(`INSERT INTO settings(key,value,updated_at) VALUES('screenshots.budget_bytes',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`,[String(Math.round(bytes)),new Date().toISOString()])}
