import { api, jsonOk, readJson } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import type { PromptInput } from "@/lib/actions";
import { submitAutomationPrompt } from "@/lib/automation-prompts";
import { listPrompts } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return api(async () => {
    await requireAuth();
    return jsonOk({ prompts: await listPrompts(30) });
  });
}

export async function POST(req: Request) {
  return api(async () => {
    await requireAuth();
    const body = await readJson<PromptInput>(req);
    const result = await submitAutomationPrompt(body);
    return jsonOk(result, { status: 201 });
  });
}
