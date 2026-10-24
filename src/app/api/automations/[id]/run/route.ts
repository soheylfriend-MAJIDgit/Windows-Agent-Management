import { api, jsonOk } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { requestAutomationRun } from "@/lib/automations";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  return api(async () => {
    await requireAuth();
    return jsonOk(await requestAutomationRun((await params).id, "manager"), { status: 201 });
  });
}
