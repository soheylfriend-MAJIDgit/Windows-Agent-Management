import { api, jsonOk, readJson } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { deleteScreenshots, setScreenshotSharing } from "@/lib/screenshots";
export const dynamic="force-dynamic";
type Params={params:Promise<{id:string}>};
export async function PATCH(req:Request,{params}:Params){return api(async()=>{await requireAuth();const body=await readJson<{public?:unknown}>(req);return jsonOk({ok:true,screenshot:await setScreenshotSharing((await params).id,body.public===true)})})}
export async function DELETE(_req:Request,{params}:Params){return api(async()=>{await requireAuth();return jsonOk({ok:true,deleted:await deleteScreenshots([(await params).id])})})}
