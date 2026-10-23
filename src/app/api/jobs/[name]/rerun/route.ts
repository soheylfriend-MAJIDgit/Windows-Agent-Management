import { api, jsonOk, readJson } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { rerunJob } from "@/lib/actions";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ name: string }> }) {
  return api(async () => {
    await requireAuth();
    const { name } = await params;

    // بدنه اختیاری است؛ dryRun فقط پیش‌نمایش فایل و پیام کامیت را برمی‌گرداند.
    let dryRun = false;
    try {
      const body = await readJson<{ dryRun?: boolean }>(req);
      dryRun = body?.dryRun === true;
    } catch {
      dryRun = false;
    }

    const result = await rerunJob(name, { dryRun });
    return jsonOk(result, { status: dryRun ? 200 : 201 });
  });
}
