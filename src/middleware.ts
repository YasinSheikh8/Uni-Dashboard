import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, lockBypassed, verifySessionValue } from "@/lib/auth/session";

const PUBLIC = [/^\/login$/, /^\/api\/auth\/login$/, /^\/manifest\.webmanifest$/, /^\/sw\.js$/, /^\/icons\//, /^\/offline$/];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  if (lockBypassed()) return NextResponse.next();

  const ok = await verifySessionValue(req.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon).*)"],
};
