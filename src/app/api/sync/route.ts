import { api, jsonOk } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { AppError } from "@/lib/errors";

export const dynamic="force-dynamic";

export async function GET(){return api(async()=>{await requireAuth();return jsonOk({configured:false,auto:false,lastSyncAt:null,lastError:null,retired:true,message:"همگام‌سازی Google Drive بازنشسته شده است؛ گزارش‌ها در PostgreSQL و تصاویر در Blob نگهداری می‌شوند."})})}
export async function POST(){return api(async()=>{await requireAuth();throw new AppError("همگام‌سازی Google Drive بازنشسته شده است.",{status:410,code:"drive_sync_retired",hint:"برای تصاویر از تب اسکرین‌شات‌ها و API جدید Blob/PostgreSQL استفاده کنید."})})}
