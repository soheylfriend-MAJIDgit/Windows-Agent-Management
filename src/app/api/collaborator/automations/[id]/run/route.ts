import { api, jsonOk } from "@/lib/api";
import { authenticateAgentRequest } from "@/lib/agent-keys";
import { requestAutomationRun } from "@/lib/automations";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  return api(async () => {
    const key = await authenticateAgentRequest(req, "automations:run");
    return jsonOk(await requestAutomationRun((await params).id, `collaborator:${key.id}`), { status: 201 });
  });
}
