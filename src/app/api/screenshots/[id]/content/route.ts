import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { screenshotContent } from "@/lib/screenshots";
export const dynamic="force-dynamic";
type Params={params:Promise<{id:string}>};
export async function GET(_req:Request,{params}:Params){return api(async()=>{await requireAuth();const {row,object}=await screenshotContent((await params).id);return new Response(object.body,{headers:{"Content-Type":row.mime_type,"Content-Length":String(object.size),"Cache-Control":"private, max-age=300","Content-Disposition":`inline; filename*=UTF-8''${encodeURIComponent(row.name)}`,"X-Content-Type-Options":"nosniff"}})})}
