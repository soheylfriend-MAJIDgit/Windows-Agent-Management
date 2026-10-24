import { api, jsonOk, readJson } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { rerunJob } from "@/lib/actions";
import { createManagedCommand, findOnlineCommandAgent } from "@/lib/commands";

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

    const target = dryRun ? null : await findOnlineCommandAgent();
    const result = await rerunJob(name, { dryRun });
    if (dryRun || !target) return jsonOk(result);

    const command = await createManagedCommand({
      type: "sync_and_run_job",
      title: `اجرای دوباره ${name}`,
      source: "rerun",
      jobName: name,
      target,
      requiresConfirmation: true,
      autoStopOnAnomaly: true,
      timeoutSeconds: 900,
      noProgressSeconds: 120,
      payload: {
        jobName: name,
        commitSha: result.commitSha,
        commitUrl: result.commitUrl,
        executionPolicy: "respect_windows_agent_mode",
      },
    });
    return jsonOk({ ...result, commandId: command.id }, { status: 201 });
  });
}
