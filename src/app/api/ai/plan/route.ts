import { NextResponse } from "next/server";
import { z } from "zod";
import { AiUnavailable, generateActionPlan } from "@/lib/ai/generate";
import { getSource } from "@/lib/data/source";
import { bad, sameOrigin } from "@/lib/http";
import { genericChecklist, getChecklist, saveChecklist, type Checklist } from "@/lib/store/user-data";

export const maxDuration = 300;
const Body = z.object({ key: z.string().regex(/^(assign|quiz|event)-\d+$/) });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return bad("Forbidden", 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Invalid request");
  const source = await getSource();
  if (source.mode === "demo") return bad("AI action plans need a real Moodle connection, so they can be based on the actual brief.", 409);
  const a = (await source.assessments()).find((x) => x.key === parsed.data.key);
  if (!a) return bad("That assessment wasn't found on Moodle.", 404);
  try {
    const plan = await generateActionPlan(source, a);
    const user = await source.userKey();
    const prev = (await getChecklist(user, a.key)) ?? { items: genericChecklist(a.kind), updatedAt: 0 };
    const keep = prev.items.filter((i) => i.origin === "custom");
    const checklist: Checklist = {
      items: [
        ...plan.steps.map((s, i) => ({
          id: `a${Date.now()}${i}`,
          text: s.title,
          detail: s.sources.length ? `${s.detail} (from the brief)` : `${s.detail} (general advice)`,
          done: false,
          origin: "ai" as const,
        })),
        ...keep,
      ],
      aiMissingInfo: plan.missingInfo,
      aiGeneratedAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveChecklist(user, a.key, checklist);
    return NextResponse.json({ checklist });
  } catch (e) {
    if (e instanceof AiUnavailable) return bad(e.message, 503);
    console.error("[dashboard] plan failed:", e instanceof Error ? e.message : e);
    return bad("The action plan couldn't be generated.", 502);
  }
}
