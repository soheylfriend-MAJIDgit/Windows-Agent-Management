import { api, jsonOk, searchParams } from "@/lib/api";
import { authenticateAgentRequest } from "@/lib/agent-keys";
import { deleteScreenshots, listScreenshots, uploadScreenshot } from "@/lib/screenshots";
import { AppError } from "@/lib/errors";

export const dynamic="force-dynamic";
export async function POST(req:Request){return api(async()=>{const key=await authenticateAgentRequest(req,"artifacts:write");let form:FormData;try{form=await req.formData()}catch{throw new AppError("درخواست Upload باید multipart/form-data باشد.",{status:400,code:"screenshot_form_invalid"})}return jsonOk({ok:true,screenshot:await uploadScreenshot(key,form)},{status:201})})}
export async function GET(req:Request){return api(async()=>{await authenticateAgentRequest(req,"artifacts:read");const q=searchParams(req);return jsonOk(await listScreenshots({limit:Number(q.get("limit")||80),query:q.get("q")||undefined,commandId:q.get("commandId")||undefined}))})}
export async function DELETE(req:Request){return api(async()=>{await authenticateAgentRequest(req,"artifacts:delete");const body=await req.json().catch(()=>({})) as {ids?:unknown};if(!Array.isArray(body.ids))throw new AppError("فهرست تصاویر معتبر نیست.",{status:400,code:"screenshot_ids_invalid"});return jsonOk({ok:true,deleted:await deleteScreenshots(body.ids.filter((id):id is string=>typeof id==="string"))})})}
