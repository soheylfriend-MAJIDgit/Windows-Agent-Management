import { api, jsonOk } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { getOverview } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return api(async () => {
    await requireAuth();
    const refresh = new URL(req.url).searchParams.get("refresh") === "1";
    return jsonOk(await getOverview({ force: refresh }));
  });
}
