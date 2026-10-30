import { api, jsonOk, readJson } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { createStageNotebook, deleteStageNotebook, listStageNotebooks, runStageNotebookCell, updateStageNotebook } from "@/lib/stage-notebooks";

export const dynamic = "force-dynamic";

export async function GET() {
  return api(async () => { await requireAuth(); return jsonOk({ notebooks: await listStageNotebooks() }); });
}

export async function POST(request: Request) {
  return api(async () => {
    await requireAuth();
    const body = await readJson<Record<string, unknown>>(request);
    const action = body.action;
    if (action === "create") return jsonOk({ notebook: await createStageNotebook(body) }, { status: 201 });
    if (action === "update" && typeof body.id === "string") return jsonOk({ notebook: await updateStageNotebook(body.id, body) });
    if (action === "delete" && typeof body.id === "string") { await deleteStageNotebook(body.id); return jsonOk({ deleted: true }); }
    if (action === "run" && typeof body.id === "string" && typeof body.cellId === "string") return jsonOk(await runStageNotebookCell(body.id, body.cellId), { status: 201 });
    return jsonOk({ error: "action_invalid" }, { status: 400 });
  });
}
