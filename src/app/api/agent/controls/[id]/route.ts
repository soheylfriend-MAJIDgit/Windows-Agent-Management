import { api, jsonOk, readJson } from "@/lib/api";
import { authenticateAgentRequest } from "@/lib/agent-keys";
import { completeEmergencyControl } from "@/lib/agent-controls";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  return api(async () => {
    const key = await authenticateAgentRequest(request, "results:write");
    const body = await readJson<Record<string, unknown>>(request);
    return jsonOk({ control: await completeEmergencyControl(key, (await params).id, body) });
  });
}
