import "server-only";
import { z } from "zod/v4";
import { htmlToText } from "@/lib/classify";
import type { Assessment, ModuleDetail, Resource, Section } from "@/lib/data/model";
import type { StudySource } from "@/lib/data/source";
import type { Session } from "@/lib/sessions";

/**
 * AI study help, using an open-weight model (default: openai/gpt-oss-120b)
 * through any OpenAI-compatible chat-completions API — OpenRouter by default,
 * or Groq / Together / a self-hosted server via AI_BASE_URL.
 *
 * Rules that the code (not just the prompt) enforces:
 * - Only text from the student's own Moodle is sent. PDFs are converted to
 *   text on this server first (gpt-oss reads text only).
 * - Every output item must cite source ids; ids that weren't supplied are dropped.
 * - The reply must match a schema; anything that doesn't is rejected.
 * - Whatever couldn't be read (e.g. PowerPoint files) is reported, not guessed at.
 */
function aiKey() {
  return process.env.AI_API_KEY || process.env.OPENROUTER_API_KEY || process.env.GROQ_API_KEY;
}
function aiBaseUrl() {
  if (process.env.AI_BASE_URL) return process.env.AI_BASE_URL.replace(/\/+$/, "");
  if (!process.env.AI_API_KEY && !process.env.OPENROUTER_API_KEY && process.env.GROQ_API_KEY) return "https://api.groq.com/openai/v1";
  return "https://openrouter.ai/api/v1";
}
export function aiModel() {
  return process.env.AI_MODEL || "openai/gpt-oss-120b";
}
export function aiConfigured() {
  return !!aiKey();
}
export function aiProviderLabel() {
  return `${aiModel()} via ${new URL(aiBaseUrl()).hostname}`;
}

const MAX_PDF_BYTES = 12 * 1024 * 1024;
const MAX_PDFS = 4;
/**
 * Request-size and pacing limits. Groq's free plan allows roughly 8,000
 * tokens per minute for gpt-oss-120b, so on Groq each request is kept to
 * ~15k characters of source text and ~3k output tokens, sent one at a time
 * about a minute apart. Every value can be overridden with an env var.
 */
export function aiLimits() {
  const groq = new URL(aiBaseUrl()).hostname.endsWith("groq.com");
  const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
  const maxInputChars = num(process.env.AI_MAX_INPUT_CHARS, groq ? 10_000 : 110_000);
  return {
    maxInputChars,
    maxSourceChars: Math.min(30_000, maxInputChars),
    maxOutputTokens: num(process.env.AI_MAX_OUTPUT_TOKENS, groq ? 2_500 : 12_000),
    concurrency: num(process.env.AI_CONCURRENCY, groq ? 1 : 3),
    minIntervalMs: num(process.env.AI_MIN_INTERVAL_MS, groq ? 62_000 : 0),
  };
}

/** The provider's rate limit was hit; stop for now and carry on in a later run. */
export class AiRateLimited extends Error {}

export class AiUnavailable extends Error {}

interface Material {
  id: string;
  title: string;
  url: string;
  text: string;
}

export async function pdfToText(data: Buffer): Promise<string | null> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(data));
    const { text } = await extractText(pdf, { mergePages: true });
    const clean = (Array.isArray(text) ? text.join("\n") : text).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    // Scanned/image-only PDFs have no text layer: treat as unreadable rather than guess.
    return clean.length > 80 ? clean : null;
  } catch {
    return null;
  }
}

const RULES = `You help a University of Warwick student study, using ONLY the numbered source materials provided from their Moodle course.

Hard rules:
- Use only facts stated in the sources. Do not add outside knowledge, examples, readings, dates, deadlines, weightings, word counts, marking criteria or lecturer instructions that are not in the sources.
- Every item must cite the ids (e.g. "S2") of the sources it is based on. If nothing in the sources supports an item, leave it out.
- If the sources are thin, produce fewer items. An empty list is better than an invented one.
- Put anything a student would need but the sources don't give into "gaps".
- British English. Plain, direct study language.
- Reply with a single JSON object only, matching the given JSON Schema exactly. No prose, no code fences.`;

function sourceText(materials: Material[], maxChars: number) {
  const maxSource = Math.min(aiLimits().maxSourceChars, maxChars);
  let budget = maxChars;
  return materials
    .map((m) => {
      const body = m.text.slice(0, Math.min(maxSource, Math.max(0, budget)));
      budget -= body.length;
      const cut = body.length < m.text.length ? "\n[…source shortened to fit]" : "";
      return `<source id="${m.id}" title="${m.title.replace(/"/g, "'")}">\n${body}${cut}\n</source>`;
    })
    .join("\n\n");
}

function parseJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  return JSON.parse(start >= 0 && end > start ? t.slice(start, end + 1) : t);
}

async function chat(body: Record<string, unknown>) {
  const res = await fetch(`${aiBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${aiKey()}`,
      "Content-Type": "application/json",
      // OpenRouter attribution header (ignored by other providers).
      "X-Title": "Study dashboard",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(240_000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    choices?: { message?: { content?: string | null }; finish_reason?: string }[];
    error?: { message?: string };
  };
  return { ok: res.ok, status: res.status, data, message: data.error?.message ?? "", retryAfter: res.headers.get("retry-after") };
}

/**
 * Read a provider's limit error. Groq, for example, says:
 * "Limit 8000, Used 0, Requested 9512" (this one request is bigger than the
 * per-minute allowance — it must shrink) or "Please try again in 7.5s"
 * (a short wait is enough).
 */
export function readLimitError(status: number, message: string, retryAfter?: string | null) {
  const limit = Number(/Limit\s+(\d+)/i.exec(message)?.[1]);
  const requested = Number(/Requested\s+(\d+)/i.exec(message)?.[1]);
  const tooLarge =
    status === 413 ||
    (limit > 0 && requested > limit) ||
    /request too large|too many tokens|reduce the length|maximum context length|context_length/i.test(message);
  const m = /try again in\s+(?:(\d+)m)?\s*([\d.]+)s/i.exec(message);
  let waitMs = m ? (Number(m[1] ?? 0) * 60 + Number(m[2])) * 1000 : NaN;
  if (Number.isNaN(waitMs) && retryAfter && /^\d+(\.\d+)?$/.test(retryAfter)) waitMs = Number(retryAfter) * 1000;
  return { tooLarge, waitMs: Number.isNaN(waitMs) ? null : Math.ceil(waitMs) };
}

async function call<T>(schema: z.ZodType<T>, materials: Material[], task: string, opts: { minOutputTokens?: number } = {}): Promise<T> {
  if (!aiConfigured()) throw new AiUnavailable("AI generation is not configured (set GROQ_API_KEY or AI_API_KEY).");
  const jsonSchema = z.toJSONSchema(schema);
  const limits = aiLimits();
  let scale = 1;
  let lastError = "The AI response couldn't be read.";
  for (let attempt = 0; attempt < 5; attempt++) {
    const inputChars = Math.max(2_000, Math.floor(limits.maxInputChars * scale));
    const maxTokens = Math.max(1_200, Math.floor(Math.max(limits.maxOutputTokens, opts.minOutputTokens ?? 0) * Math.max(scale, 0.5)));
    const messages = [
      { role: "system", content: RULES },
      { role: "user", content: `${sourceText(materials, inputChars)}\n\nTask: ${task}\n\nJSON Schema for your reply:\n${JSON.stringify(jsonSchema)}` },
    ];
    const base = { model: aiModel(), messages, temperature: 0.2, max_tokens: maxTokens };
    // Prefer strict schema output; fall back to plain JSON mode for providers that don't support it.
    let r = await chat({ ...base, response_format: { type: "json_schema", json_schema: { name: "study_output", strict: true, schema: jsonSchema } } });
    if (!r.ok && r.status === 400 && !readLimitError(400, r.message).tooLarge) r = await chat({ ...base, response_format: { type: "json_object" } });
    if (!r.ok) {
      const detail = r.message ? `: ${r.message.slice(0, 300)}` : "";
      if (r.status === 401 || r.status === 403) throw new AiUnavailable(`The AI provider rejected the API key (${r.status})${detail}`);
      if (r.status === 404) throw new AiUnavailable(`The AI provider doesn't offer the model "${aiModel()}"${detail}`);
      const lim = readLimitError(r.status, r.message, r.retryAfter);
      if (lim.tooLarge) {
        // This single request is over the plan's allowance: send less and try again.
        scale *= 0.55;
        lastError = `The materials were too long for the AI plan even after shortening${detail}`;
        continue;
      }
      if (r.status === 429) {
        if (lim.waitMs !== null && lim.waitMs <= 65_000) {
          await new Promise((res) => setTimeout(res, lim.waitMs! + 500));
          continue;
        }
        throw new AiRateLimited(`AI provider limit reached${detail}`);
      }
      lastError = `The AI provider returned an error (${r.status})${detail}`;
      if (r.status >= 500) continue;
      throw new Error(lastError);
    }
    const content = r.data.choices?.[0]?.message?.content ?? "";
    try {
      const parsed = schema.safeParse(parseJson(content));
      if (parsed.success) return parsed.data;
      lastError = "The AI reply didn't match the expected format.";
    } catch {
      lastError = r.data.choices?.[0]?.finish_reason === "length" ? "The AI reply was cut off — the materials may be too long." : "The AI reply wasn't valid JSON.";
    }
  }
  throw new Error(lastError);
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
      const text = file ? await pdfToText(file.data) : null;
      if (text) {
        pdfs++;
        materials.push({ id: id(), title: r.title, url: r.url, text });
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
  "There's nothing readable here yet (no text PDFs, pages or descriptions — PowerPoint files, scanned PDFs and videos can't be read), so nothing can be generated without guessing.";

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
    const text = file ? await pdfToText(file.data) : null;
    if (text) materials.push({ id: `S${materials.length + 1}`, title: f.name, url: a.url, text });
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
  flashcards: z.array(z.object({ front: z.string().describe("A question or term"), back: z.string().describe("A short answer, under 40 words"), sources: z.array(z.string()) })).describe("8-15 cards"),
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
    .describe("5-8 multiple-choice questions"),
  gaps: z.array(z.string()),
});

export async function generateStudySet(source: StudySource, mod: ModuleDetail, section: Section, resources: Resource[]) {
  const { materials, unread } = await gatherResources(source, mod, resources, section);
  if (!materials.length) throw new Error(NOTHING_READABLE);
  const out = await call(
    StudySetSchema,
    materials,
    `Make flashcards and a multiple-choice quiz for "${section.name}" in ${mod.code} ${mod.fullName}. Test understanding of what the sources actually teach. Wrong options must be plausible but clearly wrong according to the sources.`,
    { minOutputTokens: 4_000 },
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

/** Streaming chat completion for the Ask tab. Returns the provider's raw SSE response. */
export async function chatStream(messages: { role: "system" | "user" | "assistant"; content: string }[], maxTokens = 1200) {
  if (!aiConfigured()) throw new AiUnavailable("The chatbot needs an AI key on the server (GROQ_API_KEY or AI_API_KEY).");
  const groq = new URL(aiBaseUrl()).hostname.endsWith("groq.com");
  return fetch(`${aiBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${aiKey()}`, "Content-Type": "application/json", "X-Title": "Study dashboard" },
    body: JSON.stringify({
      model: aiModel(),
      messages,
      stream: true,
      temperature: 0.3,
      max_tokens: maxTokens,
      // Keep gpt-oss's hidden reasoning short on Groq's free plan.
      ...(groq ? { reasoning_effort: "low" } : {}),
    }),
    signal: AbortSignal.timeout(120_000),
  });
}
