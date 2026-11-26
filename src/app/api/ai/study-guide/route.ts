import { NextResponse } from "next/server";
import { z } from "zod";
import { AiUnavailable, generateStudyGuide } from "@/lib/ai/generate";
import { getSource } from "@/lib/data/source";
import { bad, sameOrigin } from "@/lib/http";
import { createNote } from "@/lib/store/user-data";

export const maxDuration = 300;
const Body = z.object({ courseId: z.number().int(), sectionId: z.number().int() });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return bad("Forbidden", 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Invalid request");
  const source = await getSource();
  if (source.mode === "demo") return bad("AI study guides need a real Moodle connection, so they can be based on your actual materials.", 409);
  const mod = await source.module(parsed.data.courseId);
  const section = mod?.sections.find((s) => s.id === parsed.data.sectionId);
  if (!mod || !section) return bad("That module week wasn't found on Moodle.", 404);
  try {
    const guide = await generateStudyGuide(source, mod, section);
    const note = await createNote(
      await source.userKey(),
      { title: `Study guide: ${section.name}`, body: guide.markdown, courseId: mod.id, week: section.week ?? null, topic: section.topic ?? section.name, tags: ["study-guide"] },
      { origin: "ai", sources: guide.sources },
    );
    return NextResponse.json({ id: note.id });
  } catch (e) {
    if (e instanceof AiUnavailable) return bad(e.message, 503);
    console.error("[dashboard] study guide failed:", e instanceof Error ? e.message : e);
    return bad(e instanceof Error && !/api[_ ]?key|token/i.test(e.message) ? e.message : "The study guide couldn't be generated.", 502);
  }
}
