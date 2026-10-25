import { api, jsonOk, readJson } from "@/lib/api";
import { authenticateAgentRequest } from "@/lib/agent-keys";
import { getAutomation, saveAutomationVersion } from "@/lib/automations";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  return api(async () => {
    await authenticateAgentRequest(req, "automations:read");
    return jsonOk(await getAutomation((await params).id, true));
  });
}

export async function POST(req: Request, { params }: Params) {
  return api(async () => {
    const key = await authenticateAgentRequest(req, "automations:write");
    const body = await readJson<Record<string, unknown>>(req);
    return jsonOk(await saveAutomationVersion({ ...body, automationId: (await params).id, actor: `collaborator:${key.id}`, activate: body.activate !== false }), { status: 201 });
  });
}
