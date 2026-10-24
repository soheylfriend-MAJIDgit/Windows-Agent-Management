import { api, jsonOk } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { activateAutomationVersion } from "@/lib/automations";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string; versionId: string }> };

export async function POST(_req: Request, { params }: Params) {
  return api(async () => {
    await requireAuth();
    const value = await params;
    return jsonOk(await activateAutomationVersion(value.id, value.versionId, "manager"));
  });
}
