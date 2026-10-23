import { NextResponse } from "next/server";
import { AppError, toUserMessage } from "./errors";

const NO_STORE = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
} as const;

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, {
    ...init,
    headers: { ...NO_STORE, ...(init?.headers ?? {}) },
  });
}

export function jsonError(err: unknown): NextResponse {
  const info = toUserMessage(err);
  const detail = err instanceof AppError ? err.details : undefined;
  return NextResponse.json(
    {
      error: {
        code: info.code,
        message: info.message,
        hint: info.hint,
        details: detail,
      },
    },
    { status: info.status, headers: NO_STORE },
  );
}

/** پوشش یکنواخت خطاها برای همه‌ی Route Handler ها */
export async function api(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (err) {
    if (!(err instanceof AppError)) {
      console.error("[api]", err);
    }
    return jsonError(err);
  }
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new AppError("بدنه‌ی درخواست JSON معتبر نیست.", { status: 400, code: "bad_json" });
  }
}

export function searchParams(req: Request): URLSearchParams {
  return new URL(req.url).searchParams;
}
