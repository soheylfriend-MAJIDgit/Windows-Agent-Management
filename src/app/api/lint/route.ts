import { api, jsonOk, readJson } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { validateCode } from "@/lib/actions";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return api(async () => {
    await requireAuth();
    const body = await readJson<{ name?: string; code?: string }>(req);
    if (typeof body.code !== "string" || !body.code.trim()) {
      throw new AppError("برای بررسی، کد پایتون را وارد کنید.", { status: 422, code: "empty_code" });
    }
    return jsonOk(await validateCode(body.name ?? "job_sample.py", body.code));
  });
}
