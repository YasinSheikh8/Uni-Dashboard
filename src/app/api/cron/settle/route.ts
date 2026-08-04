import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { settleDueBookings } from "@/lib/split";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Settlement endpoint, driven by the Netlify scheduled function (or any cron).
 *
 * Guarded by a shared secret rather than a session: there is no user here, and
 * this route moves money. Compared in constant time so the check cannot be
 * turned into an oracle, and it refuses to run at all when CRON_SECRET is
 * unset — an unauthenticated settlement endpoint is worse than none.
 */
function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function run(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await settleDueBookings();
    return NextResponse.json({
      settled: results.length,
      results,
    });
  } catch (error) {
    console.error("Scheduled settlement failed:", error);
    return NextResponse.json({ error: "Settlement failed" }, { status: 500 });
  }
}

export const POST = run;
// GET is allowed so the schedule can be verified from a browser or curl.
export const GET = run;
