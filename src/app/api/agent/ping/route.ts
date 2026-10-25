import { api, jsonOk } from "@/lib/api";
import { authenticateAgentRequest } from "@/lib/agent-keys";

export const dynamic = "force-dynamic";

/** آزمون واقعی کلید؛ Windows Agent بعداً همین الگوی Bearer را برای Control Plane استفاده می‌کند. */
export async function GET(req: Request) {
  return api(async () => {
    const key = await authenticateAgentRequest(req, "heartbeat:write");
    return jsonOk({
      ok: true,
      agentKey: {
        id: key.id,
        name: key.name,
        scopes: key.scopes,
        expiresAt: key.expiresAt,
      },
      serverTime: new Date().toISOString(),
      controlPlaneVersion: 1,
    });
  });
}
