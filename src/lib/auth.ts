import { cookies } from "next/headers";
import { envVar } from "./db";
import { AppError } from "./errors";
import { timingSafeEqual } from "./crypto";

export const SESSION_COOKIE = "wam_session";
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

export interface AuthConfig {
  enabled: boolean;
  secret: string | null;
  passcode: string | null;
}

export async function getAuthConfig(): Promise<AuthConfig> {
  const passcode = (await envVar("MANAGER_PASSCODE")) ?? null;
  const secret = (await envVar("AUTH_SECRET")) ?? passcode;
  return { enabled: Boolean(passcode), secret, passcode };
}

async function hmac(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret) as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload) as unknown as BufferSource);
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function createSessionToken(): Promise<string> {
  const config = await getAuthConfig();
  if (!config.secret) throw new AppError("کلید نشست تنظیم نشده است.", { status: 503, code: "auth_misconfigured" });
  const payload = btoa(JSON.stringify({ v: 1, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const signature = await hmac(config.secret, payload);
  return `${payload}.${signature}`;
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const config = await getAuthConfig();
  if (!config.enabled) return true;
  if (!config.secret) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = await hmac(config.secret, payload);
  if (!timingSafeEqual(expected, signature)) return false;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const parsed = JSON.parse(atob(padded)) as { exp?: number };
    return typeof parsed.exp === "number" && parsed.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export async function readSession(): Promise<{ enabled: boolean; authed: boolean }> {
  const config = await getAuthConfig();
  if (!config.enabled) return { enabled: false, authed: true };
  try {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    return { enabled: true, authed: await verifySessionToken(token) };
  } catch {
    return { enabled: true, authed: false };
  }
}

export async function requireAuth(): Promise<void> {
  const session = await readSession();
  if (!session.authed) {
    throw new AppError("برای این کار باید وارد شوید.", {
      status: 401,
      code: "unauthorized",
      hint: "کد مدیریت را در صفحه‌ی ورود وارد کنید.",
    });
  }
}

export async function verifyPasscode(input: string): Promise<boolean> {
  const config = await getAuthConfig();
  if (!config.passcode) return true;
  return timingSafeEqual(input.trim(), config.passcode);
}

export async function authEnabled(): Promise<boolean> {
  return (await getAuthConfig()).enabled;
}
