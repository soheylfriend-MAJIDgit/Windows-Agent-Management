import { api, jsonOk, readJson } from "@/lib/api";
import { authenticateAgentRequest } from "@/lib/agent-keys";
import { listAutomations, saveAutomationVersion } from "@/lib/automations";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return api(async () => {
    await authenticateAgentRequest(req, "automations:read");
    return jsonOk({ automations: await listAutomations(), sourceOfTruth: "cloudflare_d1" });
  });
}

export async function POST(req: Request) {
  return api(async () => {
    const key = await authenticateAgentRequest(req, "automations:write");
    const body = await readJson<Record<string, unknown>>(req);
    return jsonOk(await saveAutomationVersion({ ...body, actor: `collaborator:${key.id}`, activate: body.activate !== false }), { status: 201 });
  });
}
