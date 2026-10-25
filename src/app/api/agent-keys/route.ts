import { api, jsonOk, readJson } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { createAgentKey, listAgentKeys, revokeAgentKey, rotateAgentKey } from "@/lib/agent-keys";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  return api(async () => {
    await requireAuth();
    return jsonOk(await listAgentKeys());
  });
}

export async function POST(req: Request) {
  return api(async () => {
    await requireAuth();
    const body = await readJson<{
      action?: "create" | "rotate";
      id?: unknown;
      name?: unknown;
      note?: unknown;
      scopes?: unknown;
      expiresInDays?: unknown;
    }>(req);
    if (!body.action || body.action === "create") {
      return jsonOk(await createAgentKey(body), { status: 201 });
    }
    if (body.action === "rotate") {
      return jsonOk(await rotateAgentKey(body.id));
    }
    throw new AppError("عملیات کلید ایجنت شناخته‌شده نیست.", {
      status: 400,
      code: "agent_key_action_invalid",
    });
  });
}

export async function DELETE(req: Request) {
  return api(async () => {
    await requireAuth();
    const body = await readJson<{ id?: unknown }>(req);
    return jsonOk(await revokeAgentKey(body.id));
  });
}
