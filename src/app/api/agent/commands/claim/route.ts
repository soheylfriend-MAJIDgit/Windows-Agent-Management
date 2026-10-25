import { api, jsonOk } from "@/lib/api";
import { authenticateAgentRequest } from "@/lib/agent-keys";
import { claimNextCommand } from "@/lib/commands";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return api(async () => {
    const key = await authenticateAgentRequest(req, "commands:read");
    return jsonOk(await claimNextCommand(key));
  });
}
