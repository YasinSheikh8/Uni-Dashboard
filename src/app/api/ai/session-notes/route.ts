import { NextResponse } from "next/server";
import { z } from "zod";
import { AiUnavailable, generateSessionNotes } from "@/lib/ai/generate";
import { getSource } from "@/lib/data/source";
import { bad, sameOrigin } from "@/lib/http";
import { unitsFor } from "@/lib/sessions";
import { upsertSessionNote } from "@/lib/store/user-data";

export const maxDuration = 300;
const Body = z.object({ courseId: z.number().int(), sessionKey: z.string().regex(/^\d+-(lecture|seminar|week)-\d+$/) });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return bad("Forbidden", 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Invalid request");
  const source = await getSource();
  if (source.mode === "demo") return bad("AI revision notes need a real Moodle connection, so they're based on your actual lecture materials. Write your own here instead.", 409);
  const mod = await source.module(parsed.data.courseId);
  const session = mod && unitsFor(mod).flatMap((u) => u.sessions).find((s) => s.key === parsed.data.sessionKey);
  if (!mod || !session) return bad("That lecture or seminar wasn't found on Moodle.", 404);
  try {
    const out = await generateSessionNotes(source, mod, session);
    const note = await upsertSessionNote(
      await source.userKey(),
      session.key,
      { title: `${mod.code} ${session.label} — ${session.sectionName}`, body: out.markdown, courseId: mod.id, week: session.week ?? null, lecture: session.label, topic: session.sectionName, tags: ["revision"] },
      out.sources,
    );
    return NextResponse.json({ note });
  } catch (e) {
    if (e instanceof AiUnavailable) return bad("AI isn't set up on the server. You can still write your own notes here.", 503);
    console.error("[dashboard] session notes failed:", e instanceof Error ? e.message : e);
    return bad(e instanceof Error && !/api[_ ]?key|token/i.test(e.message) ? e.message : "Couldn't generate notes.", 502);
  }
}
