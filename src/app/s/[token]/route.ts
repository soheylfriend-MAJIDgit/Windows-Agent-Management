import { api } from "@/lib/api";
import { publicScreenshot } from "@/lib/screenshots";
export const dynamic="force-dynamic";
type Params={params:Promise<{token:string}>};
export async function GET(_req:Request,{params}:Params){return api(async()=>{const {row,object}=await publicScreenshot((await params).token);return new Response(object.body,{headers:{"Content-Type":row.mime_type,"Content-Length":String(row.size),"Cache-Control":"public, max-age=3600","Content-Disposition":`inline; filename*=UTF-8''${encodeURIComponent(row.name)}`,"X-Content-Type-Options":"nosniff","X-Robots-Tag":"noindex, nofollow"}})})}
