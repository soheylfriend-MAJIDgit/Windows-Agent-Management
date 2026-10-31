import { api, jsonOk, readJson, searchParams } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { deleteScreenshots, listScreenshots, saveScreenshotBudget } from "@/lib/screenshots";
import { AppError } from "@/lib/errors";

export const dynamic="force-dynamic";
export async function GET(req:Request){return api(async()=>{await requireAuth();const q=searchParams(req);return jsonOk(await listScreenshots({limit:Number(q.get("limit")||100),query:q.get("q")||undefined,commandId:q.get("commandId")||undefined}))})}
export async function PATCH(req:Request){return api(async()=>{await requireAuth();const body=await readJson<{budgetBytes?:unknown}>(req);const bytes=Number(body.budgetBytes);await saveScreenshotBudget(bytes);return jsonOk({ok:true,budgetBytes:Math.round(bytes)})})}
export async function DELETE(req:Request){return api(async()=>{await requireAuth();const body=await readJson<{ids?:unknown}>(req);if(!Array.isArray(body.ids))throw new AppError("فهرست تصاویر معتبر نیست.",{status:400,code:"screenshot_ids_invalid"});return jsonOk({ok:true,deleted:await deleteScreenshots(body.ids.filter((id):id is string=>typeof id==="string"))})})}
