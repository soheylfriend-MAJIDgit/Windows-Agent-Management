import { api, jsonOk, readJson } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { deleteArenaTarget, listArenaSavedTargets, saveArenaTarget } from "@/lib/arena-targets";

export const dynamic = "force-dynamic";

export async function GET() {
  return api(async () => {
    await requireAuth();
    return jsonOk({ targets: await listArenaSavedTargets() });
  });
}

export async function POST(req: Request) {
  return api(async () => {
    await requireAuth();
    const body = await readJson<{ name?: unknown; url?: unknown }>(req);
    return jsonOk({ targets: await saveArenaTarget(body) });
  });
}

export async function DELETE(req: Request) {
  return api(async () => {
    await requireAuth();
    const body = await readJson<{ id?: unknown }>(req);
    return jsonOk({ targets: await deleteArenaTarget(body.id) });
  });
}
