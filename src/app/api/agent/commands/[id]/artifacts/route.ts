import { api, jsonOk, readJson } from "@/lib/api";
import { authenticateAgentRequest } from "@/lib/agent-keys";
import { appendCommandArtifact } from "@/lib/commands";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  return api(async () => {
    const key = await authenticateAgentRequest(req, "artifacts:write");
    const body = await readJson<{
      artifactId?: unknown;
      kind?: unknown;
      stage?: unknown;
      name?: unknown;
      localPath?: unknown;
      driveFileId?: unknown;
      driveUrl?: unknown;
      mimeType?: unknown;
      size?: unknown;
      occurredAt?: unknown;
    }>(req);
    return jsonOk(await appendCommandArtifact(key, (await params).id, body));
  });
}
