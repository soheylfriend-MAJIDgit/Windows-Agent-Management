import { api, jsonOk, readJson } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { normalizeAutomationSlug, rerunAutomation } from "@/lib/automations";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ name: string }> }) {
  return api(async () => {
    await requireAuth();
    const { name } = await params;
    let dryRun = false;
    try {
      const body = await readJson<{ dryRun?: boolean }>(req);
      dryRun = body?.dryRun === true;
    } catch {
      dryRun = false;
    }
    const result = await rerunAutomation(normalizeAutomationSlug(name), "manager:rerun", dryRun);
    if (result.dryRun) {
      return jsonOk({
        jobName: `job_${result.automation.slug}.py`,
        commitSha: result.automation.sourceSha256 ?? "",
        commitUrl: "",
        message: "پیش‌نمایش نسخه اجرای دوباره در PostgreSQL",
        marker: result.marker,
        fileUrl: null,
        dryRun: true,
        content: result.content,
      });
    }
    return jsonOk({
      jobName: `job_${result.automation.slug}.py`,
      commitSha: result.version?.sourceSha256 ?? "",
      commitUrl: "",
      message: `نسخه ${result.version?.version ?? ""} در PostgreSQL ثبت شد.`,
      marker: result.marker,
      fileUrl: null,
      commandId: result.commandId,
      storage: "d1",
    }, { status: 201 });
  });
}
