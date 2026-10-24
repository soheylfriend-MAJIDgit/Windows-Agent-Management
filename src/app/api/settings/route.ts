import { api, jsonOk, readJson } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { getSettingsBundle, updateSettings, type SettingsPayload } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  return api(async () => {
    await requireAuth();
    return jsonOk(await getSettingsBundle());
  });
}

export async function PUT(req: Request) {
  return api(async () => {
    await requireAuth();
    const body = await readJson<SettingsPayload>(req);
    return jsonOk(await updateSettings(body));
  });
}
