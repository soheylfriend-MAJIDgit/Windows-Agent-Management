import { api, jsonOk } from "@/lib/api";
import { authenticateAgentRequest } from "@/lib/agent-keys";
import { getCommandDetail } from "@/lib/commands";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  return api(async () => {
    await authenticateAgentRequest(req, "automations:read");
    return jsonOk(await getCommandDetail((await params).id));
  });
}
