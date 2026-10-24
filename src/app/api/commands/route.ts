import { api, jsonOk } from "@/lib/api";
import { listCommands } from "@/lib/commands";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return api(async () => {
    await requireAuth();
    const url = new URL(req.url);
    return jsonOk({ commands: await listCommands(Number(url.searchParams.get("limit") ?? 30)) });
  });
}
