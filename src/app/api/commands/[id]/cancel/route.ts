import { api, jsonOk, readJson } from "@/lib/api";
import { requestCommandCancellation } from "@/lib/commands";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  return api(async () => {
    await requireAuth();
    const body = await readJson<{ reason?: unknown }>(req);
    return jsonOk(await requestCommandCancellation((await params).id, body.reason));
  });
}
