import { api, jsonOk, readJson } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { ingestManualFile } from "@/lib/drive";
import { insertEvent } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return api(async () => {
    await requireAuth();
    const body = await readJson<{
      fileName?: string;
      content?: string;
      kind?: "result" | "error";
      modifiedAt?: string | null;
    }>(req);
    const result = await ingestManualFile({
      fileName: body.fileName ?? "manual_result.txt",
      content: body.content ?? "",
      kind: body.kind,
      modifiedAt: body.modifiedAt ?? null,
    });
    await insertEvent({
      kind: "ingest",
      title: `ثبت دستی ${result.kind === "error" ? "فایل خطا" : "نتیجه‌ی اجرا"}`,
      detail: result.jobName ? `${result.jobName} — ${result.results} نتیجه` : `${result.errors} بلوک خطا`,
      jobName: result.jobName ?? null,
    });
    return jsonOk(result, { status: 201 });
  });
}
