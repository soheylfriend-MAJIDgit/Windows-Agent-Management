import { api, jsonOk } from "@/lib/api";
import { readSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  return api(async () => {
    return jsonOk(await readSession());
  });
}
