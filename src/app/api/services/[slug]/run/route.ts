import { api, jsonOk, readJson } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { runService } from "@/lib/services";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  return api(async () => {
    await requireAuth();
    const { slug } = await context.params;
    const body = await readJson<{ input?: unknown }>(request);
    return jsonOk(await runService(slug, body.input ?? {}), { status: 201 });
  });
}
