import { NextResponse } from "next/server";
import { runAutoNotesOnce } from "@/lib/ai/auto-notes";
import { getSource } from "@/lib/data/source";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Called by Vercel Cron (see vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await runAutoNotesOnce(await getSource(), { budgetMs: 270_000, maxItems: 40 });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
