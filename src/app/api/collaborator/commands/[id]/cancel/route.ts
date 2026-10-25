import { api, jsonOk, readJson } from "@/lib/api";
import { authenticateAgentRequest } from "@/lib/agent-keys";
import { requestCommandCancellation } from "@/lib/commands";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  return api(async () => {
    const key = await authenticateAgentRequest(req, "automations:run");
    const body = await readJson<{ reason?: unknown }>(req);
    return jsonOk(await requestCommandCancellation((await params).id, body.reason ?? `توقف توسط ایجنت همکار ${key.id}`));
  });
}
