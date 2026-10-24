import { NextResponse } from "next/server";
import { api } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return api(async () => {
    const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    res.cookies.set({
      name: SESSION_COOKIE,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(req.url).protocol === "https:",
      path: "/",
      maxAge: 0,
    });
    return res;
  });
}
