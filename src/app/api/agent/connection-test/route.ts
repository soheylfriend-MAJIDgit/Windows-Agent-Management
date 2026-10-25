import { api, jsonOk, readJson } from "@/lib/api";
import { authenticateAgentRequest } from "@/lib/agent-keys";
import { answerConnectionTest, claimConnectionTest } from "@/lib/agent-control";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return api(async () => {
    const key = await authenticateAgentRequest(req, "commands:read");
    return jsonOk(await claimConnectionTest(key));
  });
}

export async function POST(req: Request) {
  return api(async () => {
    const key = await authenticateAgentRequest(req, "events:write");
    const body = await readJson<{ testId?: unknown; message?: unknown }>(req);
    return jsonOk(await answerConnectionTest(key, body));
  });
}
