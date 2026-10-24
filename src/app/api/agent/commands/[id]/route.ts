import { api, jsonOk, readJson } from "@/lib/api";
import { authenticateAgentRequest } from "@/lib/agent-keys";
import { agentCommandControl, updateCommandState } from "@/lib/commands";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  return api(async () => {
    const key = await authenticateAgentRequest(req, "commands:read");
    return jsonOk(await agentCommandControl(key, (await params).id));
  });
}

export async function POST(req: Request, { params }: Params) {
  return api(async () => {
    const key = await authenticateAgentRequest(req, "results:write");
    const body = await readJson<{
      status?: unknown;
      error?: unknown;
      result?: unknown;
      message?: unknown;
      stage?: unknown;
      seq?: unknown;
    }>(req);
    return jsonOk(await updateCommandState(key, (await params).id, body));
  });
}
