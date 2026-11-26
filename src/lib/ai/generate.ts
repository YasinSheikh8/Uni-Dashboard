import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import { htmlToText } from "@/lib/classify";
import type { Assessment, ModuleDetail, Resource, Section } from "@/lib/data/model";
import type { Session } from "@/lib/sessions";
import type { StudySource } from "@/lib/data/source";

/**
 * AI study help. Rules that the code (not just the prompt) enforces:
 * - Only text and PDFs that come from the student's own Moodle are sent.
 * - Every output item must cite source ids; ids that weren't supplied are dropped.
 * - Whatever couldn't be read (e.g. PowerPoint files) is reported, not guessed at.
 */
export function aiConfigured() {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}
const MODEL = () => process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const MAX_PDF_BYTES = 12 * 1024 * 1024;
const MAX_PDFS = 4;

export class AiUnavailable extends Error {}

interface Material {
  id: string;
  title: string;
  url: string;
  text?: string;
  pdf?: Buffer;
}

const RULES = `You help a University of Warwick student study, using ONLY the numbered source materials provided from their Moodle course.

Hard rules:
- Use only facts stated in the sources. Do not add outside knowledge, examples, readings, dates, deadlines, weightings, word counts, marking criteria or lecturer instructions that are not in the sources.
- Every item must cite the ids (e.g. "S2") of the sources it is based on. If nothing in the sources supports an item, leave it out.
- If the sources are thin, produce fewer items. An empty list is better than an invented one.
- Put anything a student would need but the sources don't give into "gaps" (e.g. "The slides for this week weren't readable", "No reading list is included").
- British English. Plain, direct study language.`;

function sourceBlock(materials: Material[]) {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const m of materials) {
    if (m.pdf) {
      content.push({ type: "text", text: `Source ${m.id}: "${m.title}" (PDF follows)` });
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: m.pdf.toString("base64") }, title: `${m.id}: ${m.title}` });
    } else if (m.text) {
      content.push({ type: "text", text: `Source ${m.id}: "${m.title}"\n${m.text.slice(0, 40_000)}` });
    }
  }
  return content;
}

async function call<T>(schema: z.ZodType<T>, materials: Material[], task: string): Promise<T> {
  if (!aiConfigured()) throw new AiUnavailable("AI generation is not configured (ANTHROPIC_API_KEY).");
  const client = new Anthropic();
  const response = await client.beta.messages.parse({
    model: MODEL(),
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(schema) },
    system: RULES,
    messages: [{ role: "user", content: [...sourceBlock(materials), { type: "text", text: task }] }],
  });
  if (response.stop_reason === "refusal") throw new Error("The AI declined to generate this. Try again or write your own notes.");
  if (!response.parsed_output) throw new Error("The AI response couldn't be read. Try again.");
  return response.parsed_output;
}

async function gatherResources(source: StudySource, mod: ModuleDetail, resources: Resource[], section?: Section) {
  const materials: Material[] = [];
  const unread: string[] = [];
  let n = 0;
  const id = () => `S${++n}`;
  const sectionText = section ? htmlToText(section.summaryHtml) : "";
  if (section && sectionText) materials.push({ id: id(), title: `${section.name} — section description`, url: `${mod.url}#section-${section.number}`, text: sectionText });
  let pdfs = 0;
  for (const r of resources) {
    if (r.restricted) continue;
    if (r.modName === "page") {
      const text = await source.pageText(mod.id, r.id);
      if (text) materials.push({ id: id(), title: r.title, url: r.url, text });
      else unread.push(r.title);
      continue;
    }
    const pdf = r.files.find((f) => f.mimeType === "application/pdf");
    if (pdf && pdfs < MAX_PDFS && (pdf.size ?? 0) <= MAX_PDF_BYTES) {
      const file = await source.download(pdf, MAX_PDF_BYTES);
      if (file) {
        pdfs++;
        materials.push({ id: id(), title: r.title, url: r.url, pdf: file.data });
        continue;
      }
    }
    const desc = htmlToText(r.descriptionHtml);
    if (desc) materials.push({ id: id(), title: `${r.title} (description only)`, url: r.url, text: desc });
    if (r.files.length || r.kind === "recording" || r.kind === "tool" || r.kind === "link") unread.push(r.title);
  }
  return { materials, unread };
}

const gatherSection = (source: StudySource, mod: ModuleDetail, section: Section) => gatherResources(source, mod, section.resources, section);

const NOTHING_READABLE =
  "There's nothing readable here yet (no PDFs, pages or descriptions — PowerPoint files and videos can't be read), so nothing can be generated without guessing.";

const Cited = z.object({ text: z.string(), sources: z.array(z.string()) });
const GuideSchema = z.object({
  overview: z.string().describe("2-4 sentences on what this week/topic covers, only from the sources. Empty string if unclear."),
  keyConcepts: z.array(z.object({ term: z.string(), explanation: z.string(), sources: z.array(z.string()) })),
  summary: z.array(Cited).describe("Main points, in teaching order."),
  revisionChecklist: z.array(Cited).describe("Concrete things to be able to do or explain."),
  selfTestQuestions: z.array(Cited).describe("Short questions answerable from the sources."),
  gaps: z.array(z.string()),
});

export interface StudyGuideResult {
  markdown: string;
  sources: { title: string; url: string }[];
  unread: string[];
}

function keepCited<T extends { sources: string[] }>(items: T[], valid: Set<string>): T[] {
  return items
    .map((i) => ({ ...i, sources: i.sources.filter((s) => valid.has(s)) }))
    .filter((i) => i.sources.length > 0);
}

export async function generateStudyGuide(source: StudySource, mod: ModuleDetail, section: Section): Promise<StudyGuideResult> {
  const { materials, unread } = await gatherSection(source, mod, section);
  if (!materials.length)
    throw new Error(NOTHING_READABLE);
  const out = await call(
    GuideSchema,
    materials,
    `Create study notes for "${section.name}" in ${mod.code} ${mod.fullName}.`,
  );
  const valid = new Set(materials.map((m) => m.id));
  const cite = (ids: string[]) => ids.map((i) => `[${i}]`).join("");
  const lines: string[] = [];
  lines.push(`> AI-generated from ${materials.length} Moodle source${materials.length === 1 ? "" : "s"}. Check against the originals — links below.`, "");
  if (out.overview.trim()) lines.push("## Overview", out.overview.trim(), "");
  const concepts = keepCited(out.keyConcepts, valid);
  if (concepts.length) lines.push("## Key concepts", ...concepts.map((c) => `- **${c.term}** — ${c.explanation} ${cite(c.sources)}`), "");
  const summary = keepCited(out.summary, valid);
  if (summary.length) lines.push("## Summary", ...summary.map((s) => `- ${s.text} ${cite(s.sources)}`), "");
  const check = keepCited(out.revisionChecklist, valid);
  if (check.length) lines.push("## Revision checklist", ...check.map((s) => `- [ ] ${s.text} ${cite(s.sources)}`), "");
  const qs = keepCited(out.selfTestQuestions, valid);
  if (qs.length) lines.push("## Test yourself", ...qs.map((s) => `- ${s.text} ${cite(s.sources)}`), "");
  const gaps = [...out.gaps, ...unread.map((u) => `Couldn't read "${u}" (not a PDF or page) — open it on Moodle.`)];
  if (gaps.length) lines.push("## Missing or unclear", ...gaps.map((g) => `- ${g}`), "");
  lines.push("## Sources", ...materials.map((m) => `- [${m.id}] [${m.title}](${m.url})`));
  return { markdown: lines.join("\n"), sources: materials.map((m) => ({ title: m.title, url: m.url })), unread };
}

const PlanSchema = z.object({
  steps: z.array(
    z.object({
      title: z.string().describe("A short action, e.g. 'Outline your argument'"),
      detail: z.string().describe("One or two sentences tying the step to the brief."),
      sources: z.array(z.string()).describe("Source ids from the brief that this step is based on. Empty if it is general good practice."),
    }),
  ),
  missingInfo: z.array(z.string()).describe("Information the student needs that the brief does not give (word count, criteria, format…)."),
});

export async function generateActionPlan(source: StudySource, a: Assessment) {
  const materials: Material[] = [];
  const brief = htmlToText(a.briefHtml);
  if (brief) materials.push({ id: "S1", title: `${a.title} — brief on Moodle`, url: a.url, text: brief });
  const facts = [
    a.dueAt ? `Due/closes (official, Europe/London): ${new Date(a.dueAt).toISOString()}` : "No due date in Moodle.",
    ...a.officialFacts.map((f) => `${f.label}: ${f.value}`),
  ].join("\n");
  materials.push({ id: `S${materials.length + 1}`, title: "Moodle settings for this activity", url: a.url, text: facts });
  for (const f of a.attachments.filter((x) => x.mimeType === "application/pdf").slice(0, 2)) {
    const file = await source.download(f, MAX_PDF_BYTES);
    if (file) materials.push({ id: `S${materials.length + 1}`, title: f.name, url: a.url, pdf: file.data });
  }
  const out = await call(
    PlanSchema,
    materials,
    `Turn this ${a.kind} ("${a.title}", ${a.moduleCode}) into a practical checklist of 4-9 steps from reading the brief to ${a.kind === "quiz" ? "attempting the quiz" : "submitting"}. Steps grounded in the brief must cite it; general study steps may have no sources. Never state a word count, deadline, criteria or submission method unless a source states it.`,
  );
  const valid = new Set(materials.map((m) => m.id));
  return {
    steps: out.steps.map((s) => ({ ...s, sources: s.sources.filter((x) => valid.has(x)) })),
    missingInfo: out.missingInfo,
  };
}

// ---- Concise revision notes for one lecture or seminar -------------------------
const SessionNotesSchema = z.object({
  points: z.array(Cited).describe("6-12 short revision bullet points, most important first. One idea per bullet, under 25 words."),
  keyTerms: z.array(z.object({ term: z.string(), meaning: z.string(), sources: z.array(z.string()) })).describe("Up to 8 essential terms with one-line meanings."),
  gaps: z.array(z.string()),
});

export async function generateSessionNotes(source: StudySource, mod: ModuleDetail, session: Session) {
  const { materials, unread } = await gatherResources(source, mod, session.resources);
  if (!materials.length) throw new Error(NOTHING_READABLE);
  const out = await call(
    SessionNotesSchema,
    materials,
    `Write CONCISE revision notes for ${session.label} of "${session.sectionName}" (${mod.code} ${mod.fullName}). They will be skimmed before an exam, so keep every bullet short.`,
  );
  const valid = new Set(materials.map((m) => m.id));
  const cite = (ids: string[]) => ids.map((i) => `[${i}]`).join("");
  const lines: string[] = [];
  lines.push(...keepCited(out.points, valid).map((p) => `- ${p.text} ${cite(p.sources)}`));
  const terms = keepCited(out.keyTerms, valid);
  if (terms.length) lines.push("", "**Key terms**", ...terms.map((t) => `- **${t.term}** — ${t.meaning} ${cite(t.sources)}`));
  const gaps = [...out.gaps, ...unread.map((u) => `Couldn't read "${u}" — open it on Moodle.`)];
  if (gaps.length) lines.push("", "**Not covered (couldn't read or unclear)**", ...gaps.map((g) => `- ${g}`));
  lines.push("", "**Sources**", ...materials.map((m) => `- [${m.id}] [${m.title}](${m.url})`));
  return { markdown: lines.join("\n"), sources: materials.map((m) => ({ title: m.title, url: m.url })) };
}

// ---- Flashcards + quiz for a unit ----------------------------------------------
const StudySetSchema = z.object({
  flashcards: z.array(z.object({ front: z.string().describe("A question or term"), back: z.string().describe("A short answer, under 40 words"), sources: z.array(z.string()) })).describe("10-20 cards"),
  quiz: z
    .array(
      z.object({
        question: z.string(),
        options: z.array(z.string()).describe("Exactly 4 options"),
        answerIndex: z.number().int().describe("0-3"),
        explanation: z.string().describe("Why the answer is right, citing the material"),
        sources: z.array(z.string()),
      }),
    )
    .describe("6-10 multiple-choice questions"),
  gaps: z.array(z.string()),
});

export async function generateStudySet(source: StudySource, mod: ModuleDetail, section: Section, resources: Resource[]) {
  const { materials, unread } = await gatherResources(source, mod, resources, section);
  if (!materials.length) throw new Error(NOTHING_READABLE);
  const out = await call(
    StudySetSchema,
    materials,
    `Make flashcards and a multiple-choice quiz for "${section.name}" in ${mod.code} ${mod.fullName}. Test understanding of what the sources actually teach. Wrong options must be plausible but clearly wrong according to the sources.`,
  );
  const valid = new Set(materials.map((m) => m.id));
  const title = (ids: string[]) => ids.filter((i) => valid.has(i)).map((i) => materials.find((m) => m.id === i)!.title);
  const stamp = Date.now().toString(36);
  const cards = out.flashcards
    .filter((c) => c.sources.some((s) => valid.has(s)))
    .map((c, i) => ({ id: `ai${stamp}${i}`, front: c.front.slice(0, 500), back: c.back.slice(0, 2000), sources: title(c.sources), origin: "ai" as const }));
  const quiz = out.quiz
    .filter((q) => q.options.length === 4 && q.answerIndex >= 0 && q.answerIndex < 4 && q.sources.some((s) => valid.has(s)))
    .map((q, i) => ({ id: `q${stamp}${i}`, question: q.question, options: q.options, answer: q.answerIndex, explanation: q.explanation, sources: title(q.sources), origin: "ai" as const }));
  return {
    cards,
    quiz,
    sourceLinks: materials.map((m) => ({ title: m.title, url: m.url })),
    gaps: [...out.gaps, ...unread.map((u) => `Couldn't read "${u}" (not a PDF or page).`)],
  };
}
