import { api, jsonOk } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { SERVICE_CATALOG } from "@/lib/services";

export const dynamic = "force-dynamic";

export async function GET() {
  return api(async () => {
    await requireAuth();
    return jsonOk({ services: SERVICE_CATALOG });
  });
}
