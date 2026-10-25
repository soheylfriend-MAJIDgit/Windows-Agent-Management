import { api, jsonOk, readJson } from "@/lib/api";
import { getCommandDetail, setCommandAutoStop } from "@/lib/commands";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  return api(async () => {
    await requireAuth();
    return jsonOk(await getCommandDetail((await params).id));
  });
}

export async function PATCH(req: Request, { params }: Params) {
  return api(async () => {
    await requireAuth();
    const body = await readJson<{ autoStopOnAnomaly?: unknown }>(req);
    return jsonOk(await setCommandAutoStop((await params).id, body.autoStopOnAnomaly));
  });
}
