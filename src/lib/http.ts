import "server-only";
import { NextResponse } from "next/server";

/** Reject cross-site writes. Browsers always send Origin on POST/PUT/DELETE. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
