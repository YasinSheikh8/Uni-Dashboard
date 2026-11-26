import "server-only";
import { createHash } from "node:crypto";
import type { StudySource } from "@/lib/data/source";
import { unitsFor, type Session } from "@/lib/sessions";
import { getAutoNotesState, listNotes, saveAutoNotesState, upsertSessionNote, type AutoNotesState, type Note } from "@/lib/store/user-data";
import { aiConfigured, generateSessionNotes } from "./generate";

/**
 * Keeps concise revision notes up to date for every lecture, seminar and
 * week that has materials on Moodle.
 *
 * - A session is (re)generated when it has no notes, or when its Moodle
 *   materials changed since the notes were made (fingerprint of item ids,
 *   files and modification times).
 * - Notes you wrote, or AI notes you edited, are never overwritten.
 * - Sessions with nothing readable (PowerPoint/video only) are remembered and
 *   retried only when their materials change.
 */
export function autoNotesEnabled() {
  return aiConfigured() && process.env.AUTO_NOTES !== "0";
}

export function sessionFingerprint(s: Session): string {
  const parts = s.resources
    .map((r) => `${r.id}:${r.updatedAt ?? 0}:${r.files.map((f) => `${f.name}@${f.timeModified ?? 0}`).join(",")}`)
    .sort();
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 16);
}

export type Decision = "generate" | "up-to-date" | "kept-yours" | "unreadable";

export function decide(fp: string, note: Note | undefined, state: AutoNotesState["sessions"][string] | undefined): Decision {
  if (note && (note.origin === "personal" || note.editedByUser) && note.body.trim()) return "kept-yours";
  if (note?.autoFingerprint === fp) return "up-to-date";
  if (state && state.fp === fp && state.status === "unreadable") return "unreadable";
  return "generate";
}

export interface PlanItem {
  session: Session;
  moduleCode: string;
  fp: string;
  decision: Decision;
  newest: number;
}

export async function planAutoNotes(source: StudySource): Promise<{ items: PlanItem[]; state: AutoNotesState; user: string }> {
  const user = await source.userKey();
  const [modules, notes, state] = await Promise.all([source.modules(), listNotes(user), getAutoNotesState(user)]);
  const now = Date.now();
  const current = modules.filter((m) => !m.endDate || m.endDate > now - 30 * 86400000);
  const byKey = new Map(notes.filter((n) => n.sessionKey).map((n) => [n.sessionKey!, n]));
  const items: PlanItem[] = [];
  for (const m of current) {
    const detail = await source.module(m.id).catch(() => null);
    if (!detail) continue;
    for (const u of unitsFor(detail)) {
      for (const s of u.sessions) {
        if (!s.resources.some((r) => !r.restricted)) continue;
        const fp = sessionFingerprint(s);
        items.push({
          session: s,
          moduleCode: m.code,
          fp,
          decision: decide(fp, byKey.get(s.key), state.sessions[s.key]),
          newest: Math.max(0, ...s.resources.map((r) => r.addedAt ?? r.updatedAt ?? 0)),
        });
      }
    }
  }
  // Newest material first, so this week's notes appear before the backlog.
  items.sort((a, b) => b.newest - a.newest);
  return { items, state, user };
}

export interface RunResult {
  generated: number;
  unreadable: number;
  failed: number;
  remaining: number;
  total: number;
  withNotes: number;
  message: string;
}

/** Generate notes for sessions that need them, within a time budget. */
export async function runAutoNotes(source: StudySource, opts: { budgetMs?: number; maxItems?: number; concurrency?: number } = {}): Promise<RunResult> {
  if (source.mode !== "live") throw new Error("Automatic notes need a live Moodle connection.");
  if (!autoNotesEnabled()) throw new Error("Automatic notes are off: set AI_API_KEY on the server (and don't set AUTO_NOTES=0).");
  const started = Date.now();
  const budget = opts.budgetMs ?? 240_000;
  const { items, state, user } = await planAutoNotes(source);
  const queue = items.filter((i) => i.decision === "generate").slice(0, opts.maxItems ?? 50);
  let generated = 0;
  let unreadable = 0;
  let failed = 0;

  const worker = async () => {
    while (queue.length && Date.now() - started < budget) {
      const item = queue.shift()!;
      const mod = await source.module(item.session.courseId);
      if (!mod) continue;
      try {
        const out = await generateSessionNotes(source, mod, item.session);
        await upsertSessionNote(
          user,
          item.session.key,
          {
            title: `${item.moduleCode} ${item.session.label} — ${item.session.sectionName}`,
            body: out.markdown,
            courseId: mod.id,
            week: item.session.week ?? null,
            lecture: item.session.label,
            topic: item.session.sectionName,
            tags: ["revision", "auto"],
          },
          out.sources,
          item.fp,
        );
        state.sessions[item.session.key] = { fp: item.fp, status: "done", at: Date.now() };
        generated++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const isUnreadable = /nothing readable/i.test(msg);
        state.sessions[item.session.key] = { fp: item.fp, status: isUnreadable ? "unreadable" : "error", at: Date.now(), error: isUnreadable ? undefined : msg.slice(0, 200) };
        if (isUnreadable) unreadable++;
        else failed++;
      }
      // Save progress as we go so a timeout never loses finished work.
      await saveAutoNotesState(user, state);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 3) }, worker));

  const remaining = items.filter((i) => i.decision === "generate").length - generated - unreadable - failed;
  const withNotes = items.filter((i) => i.decision === "up-to-date" || i.decision === "kept-yours").length + generated;
  const message = `${generated} written, ${unreadable} unreadable, ${failed} failed, ${Math.max(0, remaining)} still to do`;
  state.lastRunAt = Date.now();
  state.lastRunSummary = message;
  await saveAutoNotesState(user, state);
  return { generated, unreadable, failed, remaining: Math.max(0, remaining), total: items.length, withNotes, message };
}

// One run at a time per server instance; background triggers no more than every 6 hours.
let running: Promise<RunResult> | null = null;
export function runAutoNotesOnce(source: StudySource, opts?: Parameters<typeof runAutoNotes>[1]) {
  running ??= runAutoNotes(source, opts).finally(() => (running = null));
  return running;
}

export async function maybeRunInBackground(source: StudySource) {
  if (source.mode !== "live" || !autoNotesEnabled() || running) return;
  const state = await getAutoNotesState(await source.userKey());
  if (state.lastRunAt && Date.now() - state.lastRunAt < 6 * 3_600_000) return;
  await runAutoNotesOnce(source, { budgetMs: 200_000, maxItems: 12 }).catch((e) =>
    console.error("[dashboard] background notes failed:", e instanceof Error ? e.message : e),
  );
}
