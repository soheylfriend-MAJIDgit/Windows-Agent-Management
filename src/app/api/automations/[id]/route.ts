import { api, jsonOk, readJson } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { getAutomation, saveAutomationVersion, setAutomationEnabled } from "@/lib/automations";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  return api(async () => {
    await requireAuth();
    return jsonOk(await getAutomation((await params).id, true));
  });
}

export async function POST(req: Request, { params }: Params) {
  return api(async () => {
    await requireAuth();
    const body = await readJson<Record<string, unknown>>(req);
    if (body.action === "set_enabled") return jsonOk(await setAutomationEnabled((await params).id, body.enabled));
    if (!body.action || body.action === "new_version") {
      return jsonOk(await saveAutomationVersion({ ...body, automationId: (await params).id, actor: "manager", activate: body.activate !== false }), { status: 201 });
    }
    throw new AppError("عملیات اتوماسیون شناخته‌شده نیست.", { status: 400, code: "automation_action_invalid" });
  });
}
