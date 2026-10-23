import { api, jsonOk } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { runHealthCheck } from "@/lib/health";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return api(async () => {
    await requireAuth();
    const deep = new URL(req.url).searchParams.get("deep") === "1";
    return jsonOk(await runHealthCheck(deep));
  });
}
