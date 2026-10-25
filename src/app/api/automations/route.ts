import { api, jsonOk, readJson } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { listAutomations, saveAutomationVersion } from "@/lib/automations";

export const dynamic = "force-dynamic";

export async function GET() {
  return api(async () => {
    await requireAuth();
    return jsonOk({ automations: await listAutomations(), sourceOfTruth: "cloudflare_d1" });
  });
}

export async function POST(req: Request) {
  return api(async () => {
    await requireAuth();
    const body = await readJson<Record<string, unknown>>(req);
    return jsonOk(await saveAutomationVersion({ ...body, actor: "manager", activate: body.activate !== false }), { status: 201 });
  });
}
