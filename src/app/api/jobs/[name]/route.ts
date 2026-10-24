import { api, jsonOk } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { getJobDetail } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  return api(async () => {
    await requireAuth();
    const { name } = await params;
    return jsonOk(await getJobDetail(name));
  });
}
