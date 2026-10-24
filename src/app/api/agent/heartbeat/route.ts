import { api, jsonOk, readJson } from "@/lib/api";
import { authenticateAgentRequest } from "@/lib/agent-keys";
import { recordHeartbeat } from "@/lib/agent-control";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return api(async () => {
    const key = await authenticateAgentRequest(req, "heartbeat:write");
    const body = await readJson<{
      agentId?: unknown;
      name?: unknown;
      platform?: unknown;
      version?: unknown;
      commit?: unknown;
      status?: unknown;
      capabilities?: unknown;
      state?: unknown;
      message?: unknown;
    }>(req);
    return jsonOk(await recordHeartbeat(key, body));
  });
}
