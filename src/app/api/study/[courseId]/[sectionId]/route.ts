import { NextResponse } from "next/server";
import { z } from "zod";
import { AiUnavailable, generateStudySet } from "@/lib/ai/generate";
import { getSource } from "@/lib/data/source";
import { bad, sameOrigin } from "@/lib/http";
import { unitsFor } from "@/lib/sessions";
import { FlashcardSchema, getStudyProgress, getStudySet, reviewCard, saveStudyProgress, saveStudySet } from "@/lib/store/user-data";

export const maxDuration = 300;

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate") }),
  z.object({ action: z.literal("saveCards"), cards: z.array(FlashcardSchema).max(300) }),
  z.object({ action: z.literal("review"), cardId: z.string().max(64), result: z.enum(["again", "good"]) }),
  z.object({ action: z.literal("quizResult"), score: z.number().int().min(0), total: z.number().int().min(1).max(100), mode: z.enum(["ai", "cards"]) }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ courseId: string; sectionId: string }> }) {
  if (!sameOrigin(req)) return bad("Forbidden", 403);
  const p = await params;
  const courseId = Number(p.courseId);
  const sectionId = Number(p.sectionId);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Invalid request");
  const source = await getSource();
  const mod = await source.module(courseId);
  const section = mod?.sections.find((s) => s.id === sectionId);
  if (!mod || !section) return bad("That unit wasn't found on Moodle.", 404);
  const user = await source.userKey();
  const body = parsed.data;
  const existing = await getStudySet(user, courseId, sectionId);

  if (body.action === "generate") {
    const custom = existing?.cards.filter((c) => c.origin === "custom") ?? [];
    try {
      let generated;
      if (source.mode === "demo") {
        const { demoStudySet } = await import("@/lib/data/demo-source");
        generated = demoStudySet(sectionId);
        if (!generated) return bad("Sample flashcards exist only for DEMO-EC101 Week 6 and DEMO-MA105 Week 6. Add your own cards here instead.", 409);
      } else {
        const unit = unitsFor(mod).find((u) => u.section.id === sectionId);
        generated = await generateStudySet(source, mod, section, unit?.studyResources ?? section.resources);
      }
      const set = { cards: [...generated.cards, ...custom], quiz: generated.quiz, sourceLinks: generated.sourceLinks, gaps: generated.gaps, generatedAt: Date.now(), updatedAt: Date.now() };
      await saveStudySet(user, courseId, sectionId, set);
      return NextResponse.json({ set });
    } catch (e) {
      if (e instanceof AiUnavailable) return bad("AI isn't set up on the server, so flashcards can't be generated. You can still add your own.", 503);
      console.error("[dashboard] study set failed:", e instanceof Error ? e.message : e);
      return bad(e instanceof Error && !/api[_ ]?key|token/i.test(e.message) ? e.message : "Couldn't generate flashcards.", 502);
    }
  }

  if (body.action === "saveCards") {
    const set = existing ?? { cards: [], quiz: [], updatedAt: Date.now() };
    await saveStudySet(user, courseId, sectionId, { ...set, cards: body.cards });
    return NextResponse.json({ ok: true });
  }

  const progress = await getStudyProgress(user, courseId, sectionId);
  if (body.action === "review") {
    await saveStudyProgress(user, courseId, sectionId, reviewCard(progress, body.cardId, body.result));
    return NextResponse.json({ ok: true });
  }
  progress.quizRuns = [...progress.quizRuns, { at: Date.now(), score: Math.min(body.score, body.total), total: body.total, mode: body.mode }].slice(-50);
  await saveStudyProgress(user, courseId, sectionId, progress);
  return NextResponse.json({ ok: true });
}
