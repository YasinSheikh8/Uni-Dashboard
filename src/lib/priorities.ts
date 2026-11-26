import type { Assessment } from "@/lib/data/model";
import { formatDateTime, relativeTo } from "@/lib/time";

export interface Priority {
  assessment: Assessment;
  urgency: "overdue" | "today" | "soon" | "upcoming" | "no-date";
  reason: string;
  stepsDone: number;
  stepsTotal: number;
  score: number;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * Rank unfinished work. Transparent on purpose: the score is driven by the
 * official Moodle date, nudged by how much of your checklist is left, and the
 * reason shown to you says exactly why it's on the list.
 */
export function rankWork(
  assessments: Assessment[],
  progress: Map<string, { done: number; total: number }>,
  now = Date.now(),
  limit = 5,
): Priority[] {
  const out: Priority[] = [];
  for (const a of assessments) {
    if (a.done) continue;
    const p = progress.get(a.key) ?? { done: 0, total: 0 };
    if (p.total > 0 && p.done === p.total) continue;
    const due = a.dueAt;
    // Not open yet and not due within 3 days: not something to work on now.
    if (a.opensAt && a.opensAt > now + 3 * DAY && (!due || due > now + 3 * DAY)) continue;
    let urgency: Priority["urgency"];
    let score: number;
    if (!due) {
      urgency = "no-date";
      score = 10;
    } else if (due < now) {
      if (now - due > 7 * DAY) continue; // closed a while ago — not actionable any more
      if (a.cutoffAt && a.cutoffAt < now) continue;
      if (a.kind === "quiz") continue; // a closed quiz can't be attempted
      urgency = "overdue";
      score = 1000;
    } else {
      const hours = (due - now) / HOUR;
      urgency = hours <= 24 ? "today" : hours <= 72 ? "soon" : "upcoming";
      if (hours > 21 * 24) continue;
      score = 500 - Math.min(hours, 480);
    }
    const remaining = p.total ? (p.total - p.done) / p.total : 1;
    score += remaining * 20;
    const stepsText = p.total ? ` · ${p.done}/${p.total} steps done` : "";
    const reason =
      urgency === "overdue"
        ? `Past the Moodle due date${a.cutoffAt ? " — late submission may still be open" : ""}${stepsText}`
        : urgency === "no-date"
          ? `No due date on Moodle${stepsText}`
          : `${a.opensAt && a.opensAt > now ? `Opens ${formatDateTime(a.opensAt)} · ` : ""}${a.kind === "quiz" ? "Closes" : "Due"} ${relativeTo(due!, now)}${stepsText}`;
    out.push({ assessment: a, urgency, reason, stepsDone: p.done, stepsTotal: p.total, score });
  }
  return out.sort((x, y) => y.score - x.score).slice(0, limit);
}
