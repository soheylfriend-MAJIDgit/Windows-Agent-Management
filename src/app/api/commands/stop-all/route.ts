import { api, jsonOk, readJson } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { createStopAllControl, latestEmergencyControl, selectEmergencyControlTarget } from "@/lib/agent-controls";
import { requestAllCommandCancellationsForAgent } from "@/lib/commands";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  return api(async () => {
    await requireAuth();
    return jsonOk({ control: await latestEmergencyControl() });
  });
}

export async function POST(request: Request) {
  return api(async () => {
    await requireAuth();
    const body = await readJson<Record<string, unknown>>(request);
    if (body.confirmation !== "STOP_ALL_AGENT_EXECUTIONS") {
      throw new AppError("تأیید توقف فوری همه اجراها معتبر نیست.", { status: 422, code: "stop_all_confirmation_required" });
    }
    const target = await selectEmergencyControlTarget();
    const reason = "توقف فوری همه اجراهای Windows Agent از پنل سایت مدیریت";
    const [{ control, reused }, commands] = await Promise.all([
      createStopAllControl({ keyId: target.keyId, agentId: target.agentId }, "manager:web:stop-all", reason),
      requestAllCommandCancellationsForAgent(target.agentId, reason),
    ]);
    return jsonOk({
      ok: true,
      control,
      reused,
      target,
      commands,
      message: target.online
        ? `درخواست اضطراری برای ${target.agentName} ثبت شد و با Heartbeat بعدی تحویل می‌شود.`
        : `درخواست اضطراری برای ${target.agentName} ذخیره شد؛ به‌محض بازگشت Heartbeat تحویل می‌شود.`,
    }, { status: reused ? 200 : 201 });
  });
}
