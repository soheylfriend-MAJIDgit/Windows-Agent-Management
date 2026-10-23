import { NextResponse } from "next/server";
import { api, readJson } from "@/lib/api";
import { createSessionToken, getAuthConfig, SESSION_COOKIE, SESSION_MAX_AGE, verifyPasscode } from "@/lib/auth";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const attempts = new Map<string, { count: number; resetAt: number }>();

function clientKey(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function tooMany(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry) return false;
  if (entry.resetAt < now) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= 10;
}

function recordFailure(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + 5 * 60_000 });
  } else {
    entry.count += 1;
  }
}

export async function POST(req: Request) {
  return api(async () => {
    const auth = await getAuthConfig();
    const key = clientKey(req);
    if (tooMany(key)) {
      throw new AppError("تلاش‌های ناموفق زیاد بود. چند دقیقه بعد دوباره تلاش کنید.", {
        status: 429,
        code: "rate_limited",
      });
    }
    const body = await readJson<{ passcode?: string }>(req);
    const ok = await verifyPasscode(body.passcode ?? "");
    if (!ok) {
      recordFailure(key);
      throw new AppError("کد مدیریت درست نیست.", { status: 401, code: "wrong_passcode" });
    }
    attempts.delete(key);
    const token = await createSessionToken();
    const res = NextResponse.json(
      { ok: true, enabled: auth.enabled },
      { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
    );
    res.cookies.set({
      name: SESSION_COOKIE,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      // در preview محلی با HTTP هم ورود کار کند؛ در کلادفلر همیشه https است.
      secure: new URL(req.url).protocol === "https:",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return res;
  });
}
