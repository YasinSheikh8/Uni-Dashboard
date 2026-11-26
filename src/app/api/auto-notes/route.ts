import { NextResponse } from "next/server";
import { autoNotesEnabled, planAutoNotes, runAutoNotesOnce } from "@/lib/ai/auto-notes";
import { getSource } from "@/lib/data/source";
import { bad, sameOrigin } from "@/lib/http";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET() {
  const source = await getSource();
  if (source.mode !== "live") return NextResponse.json({ enabled: false, reason: "demo" });
  let plan;
  try {
    plan = await planAutoNotes(source);
  } catch (e) {
    const { describeError } = await import("@/lib/data/source");
    return NextResponse.json({ enabled: autoNotesEnabled(), error: describeError(e).message }, { status: 502 });
  }
  const { items, state } = plan;
  const count = (d: string) => items.filter((i) => i.decision === d).length;
  return NextResponse.json({
    enabled: autoNotesEnabled(),
    total: items.length,
    upToDate: count("up-to-date"),
    yours: count("kept-yours"),
    unreadable: count("unreadable"),
    toDo: count("generate"),
    lastRunAt: state.lastRunAt ?? null,
    lastRunSummary: state.lastRunSummary ?? null,
  });
}

/** Run one batch now (the Settings button calls this repeatedly until nothing is left). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return bad("Forbidden", 403);
  const source = await getSource();
  try {
    return NextResponse.json(await runAutoNotesOnce(source, { budgetMs: 150_000, maxItems: 8 }));
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Failed", 409);
  }
}
