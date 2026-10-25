import { api, jsonOk, readJson } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { adminAgentConnectionBundle, startAgentConnectionTest } from "@/lib/agent-control";

export const dynamic = "force-dynamic";

export async function GET() {
  return api(async () => {
    await requireAuth();
    return jsonOk(await adminAgentConnectionBundle());
  });
}

export async function POST(req: Request) {
  return api(async () => {
    await requireAuth();
    const body = await readJson<{ keyId?: unknown }>(req);
    return jsonOk(await startAgentConnectionTest(body.keyId), { status: 201 });
  });
}
