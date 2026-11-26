import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_DAYS, checkPasscode, createSessionValue, lockConfigured } from "@/lib/auth/session";

// Basic brute-force brake (per server instance).
const attempts = new Map<string, { n: number; at: number }>();

export async function POST(req: Request) {
  const form = await req.formData();
  const nextRaw = String(form.get("next") ?? "/");
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const now = Date.now();
  const rec = attempts.get(ip);
  const back = (error: string) => NextResponse.redirect(new URL(`/login?error=${error}&next=${encodeURIComponent(next)}`, req.url), 303);
  if (rec && now - rec.at < 60_000 && rec.n >= 8) return back("rate");
  if (!lockConfigured()) return back("config");
  if (!(await checkPasscode(String(form.get("passcode") ?? "")))) {
    attempts.set(ip, { n: rec && now - rec.at < 60_000 ? rec.n + 1 : 1, at: rec && now - rec.at < 60_000 ? rec.at : now });
    return back("wrong");
  }
  attempts.delete(ip);
  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.cookies.set(SESSION_COOKIE, await createSessionValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  return res;
}
