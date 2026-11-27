import { z } from "zod";
import { QUICK_LINKS } from "@/config/links";
import { APP_NAME } from "@/config/app";
import { AiUnavailable, aiLimits, chatStream, readLimitError } from "@/lib/ai/generate";
import { getSource } from "@/lib/data/source";
import { bad, sameOrigin } from "@/lib/http";
import { listNotes } from "@/lib/store/user-data";
import { getTimetable } from "@/lib/timetable/source";
import { formatDateLong, formatDateTime, londonDateKey, londonDayRange, addDaysToKey } from "@/lib/time";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(6000) }))
    .min(1)
    .max(40),
});

const RULES = `You are the assistant inside ${APP_NAME}, a personal study app for a University of Warwick student. Help with anything related to university: their modules and notes, revision, explaining course concepts, planning work, study skills, and how to find Warwick services.

Rules:
- For facts about THIS student (deadlines, test dates, timetable, rooms, module content), use only the "Student data" and "Notes" below. If it isn't there, say you don't have it and point to the right official service (Moodle, Tabula, the exams pages, etc.). Never invent dates, rooms, word counts, marks or rules.
- For Warwick policies and services, don't state specifics you aren't sure of; give the relevant official link from the list below.
- You may explain general academic concepts from your own knowledge, but say when an explanation is general rather than from their course materials.
- When you use a note, mention which one (by its title).
- British English. Be concise and practical. Use short paragraphs or bullet lists. Use Markdown links for URLs.`;

function relevantNotes(notes: Awaited<ReturnType<typeof listNotes>>, query: string, budget: number) {
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  const scored = notes
    .map((n) => {
      const hay = `${n.title} ${n.topic ?? ""} ${n.lecture ?? ""} ${n.tags.join(" ")} ${n.body}`.toLowerCase();
      return { n, score: terms.reduce((s, t) => s + (hay.includes(t) ? (n.title.toLowerCase().includes(t) ? 3 : 1) : 0), 0) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.n.updatedAt - a.n.updatedAt)
    .slice(0, 4);
  let left = budget;
  const out: string[] = [];
  for (const { n } of scored) {
    if (left < 300) break;
    const body = n.body.replace(/\n\*\*Sources\*\*[\s\S]*$/, "").slice(0, Math.min(1500, left));
    left -= body.length;
    out.push(`### ${n.title}\n${body}`);
  }
  return out.join("\n\n");
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return bad("Forbidden", 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Invalid message");
  const source = await getSource();
  const now = Date.now();
  const today = londonDateKey(now);
  const small = aiLimits().maxInputChars < 20_000; // free plans: keep the context tight

  const [modules, assessments, tt, notes] = await Promise.all([
    source.modules().catch(() => []),
    source.assessments().catch(() => []),
    getTimetable(source, londonDayRange(today).start, londonDayRange(addDaysToKey(today, 7)).end).catch(() => null),
    source.userKey().then(listNotes).catch(() => []),
  ]);
  const hidden = await source.hiddenIds().catch(() => new Set<number>());
  const visibleNotes = notes.filter((n) => !n.courseId || !hidden.has(n.courseId));

  const deadlines = assessments
    .filter((a) => !a.done && a.dueAt && a.dueAt > now - 86400000)
    .sort((a, b) => a.dueAt! - b.dueAt!)
    .slice(0, 8)
    .map((a) => `- ${a.moduleCode}: ${a.title} — ${a.kind === "quiz" ? "closes" : "due"} ${formatDateTime(a.dueAt!)} (${a.statusLabel})`);
  const classes = (tt?.items ?? [])
    .filter((i) => i.category === "teaching")
    .slice(0, small ? 10 : 25)
    .map((i) => `- ${formatDateTime(i.start)}: ${i.title}${i.location ? ` (room ${i.location})` : ""}`);
  const lastUser = [...parsed.data.messages].reverse().find((m) => m.role === "user")?.content ?? "";

  const context = [
    `Today is ${formatDateLong(now)} (UK time). Data source: ${source.mode === "demo" ? "SAMPLE DEMO DATA, not the student's real data" : "the student's Moodle and Tabula"}.`,
    `Modules: ${modules.map((m) => `${m.code} ${m.fullName}`).join("; ") || "none"}`,
    `Upcoming Moodle deadlines and tests (Tabula coursework is not included):\n${deadlines.join("\n") || "- none on Moodle"}`,
    tt?.coverage.teachingSynced ? `Classes in the next 7 days:\n${classes.join("\n") || "- none"}` : "Timetable: not synced, so classes are unknown — point them to Tabula.",
    `Official Warwick links:\n${QUICK_LINKS.slice(0, small ? 10 : 17).map((l) => `- ${l.title}: ${l.url}`).join("\n")}`,
  ].join("\n\n");
  const noteText = relevantNotes(visibleNotes, lastUser, small ? 2500 : 9000);

  // Keep the recent conversation within budget.
  const history: { role: "user" | "assistant"; content: string }[] = [];
  let budget = small ? 4000 : 24000;
  for (const m of [...parsed.data.messages].reverse()) {
    const content = m.content.slice(0, budget);
    if (!content) break;
    history.unshift({ role: m.role, content });
    budget -= content.length;
    if (budget <= 0 || history.length >= 10) break;
  }
  if (history[0]?.role === "assistant") history.shift();

  let upstream: Response;
  try {
    upstream = await chatStream(
      [{ role: "system", content: `${RULES}\n\n## Student data\n${context}\n\n## Notes\n${noteText || "(no matching notes)"}` }, ...history],
      small ? 1200 : 2500,
    );
  } catch (e) {
    if (e instanceof AiUnavailable) return bad(e.message, 503);
    return bad("Couldn't reach the AI service.", 502);
  }
  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    let message = "";
    try {
      message = JSON.parse(text).error?.message ?? "";
    } catch {}
    const lim = readLimitError(upstream.status, message, upstream.headers.get("retry-after"));
    if (upstream.status === 429 || lim.tooLarge)
      return bad(lim.waitMs && lim.waitMs < 120_000 ? `The free AI plan is busy — try again in ${Math.ceil(lim.waitMs / 1000)} seconds.` : "The free AI plan's limit has been reached for now. Try again later.", 429);
    if (upstream.status === 401 || upstream.status === 403) return bad("The AI provider rejected the API key.", 503);
    return bad(`The AI service returned an error (${upstream.status}).`, 502);
  }

  // Convert the provider's SSE into a plain text stream of the answer.
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let buf = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith("data:")) continue;
            const data = t.slice(5).trim();
            if (data === "[DONE]") continue;
            try {
              const delta = JSON.parse(data).choices?.[0]?.delta?.content;
              if (delta) controller.enqueue(encoder.encode(delta));
            } catch {}
          }
        }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
