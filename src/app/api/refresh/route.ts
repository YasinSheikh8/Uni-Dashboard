import { NextResponse } from "next/server";
import { bustMoodleCache } from "@/lib/moodle/client";
import { bad, sameOrigin } from "@/lib/http";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return bad("Forbidden", 403);
  bustMoodleCache();
  return NextResponse.json({ ok: true });
}
