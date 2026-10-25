import { api, jsonOk } from "@/lib/api";
import { authenticateAgentRequest } from "@/lib/agent-keys";
import { automationSourceForAgent } from "@/lib/automations";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string; versionId: string }> };

export async function GET(req: Request, { params }: Params) {
  return api(async () => {
    await authenticateAgentRequest(req, "commands:read");
    const value = await params;
    return jsonOk(await automationSourceForAgent(value.id, value.versionId));
  });
}
