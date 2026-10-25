import { api, jsonOk, readJson } from "@/lib/api";
import { authenticateAgentRequest } from "@/lib/agent-keys";
import { appendCommandEvent } from "@/lib/commands";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  return api(async () => {
    const key = await authenticateAgentRequest(req, "events:write");
    const body = await readJson<{ seq?: unknown; stage?: unknown; level?: unknown; message?: unknown; data?: unknown; occurredAt?: unknown }>(req);
    return jsonOk(await appendCommandEvent(key, (await params).id, body));
  });
}
