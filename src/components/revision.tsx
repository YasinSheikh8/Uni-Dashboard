"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, Loader2, Pencil, Sparkles } from "lucide-react";
import { renderMarkdown } from "@/lib/markdown";
import { AiTag, cx } from "./ui";

export interface SessionView {
  key: string;
  label: string;
  kind: "lecture" | "seminar";
  courseId: number;
  week?: number;
  sectionName: string;
  moduleCode: string;
  materials: { title: string; url: string; kind: string }[];
  note: { id: string; body: string; origin: "personal" | "ai"; editedByUser?: boolean; updatedAt: number } | null;
}

/** One lecture or seminar with its concise revision note, editable in place. */
export function SessionNoteCard({ s, aiAvailable, reviewMode }: { s: SessionView; aiAvailable: boolean; reviewMode?: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState(s.note);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(s.note?.body ?? "");
  const [busy, setBusy] = useState<"save" | "ai" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  const save = async () => {
    setBusy("save");
    setError(null);
    const payload = { title: `${s.moduleCode} ${s.label} — ${s.sectionName}`, body: draft, courseId: s.courseId, week: s.week ?? null, lecture: s.label, topic: s.sectionName, tags: ["revision"], sessionKey: s.key };
    const res = await fetch(note ? `/api/notes/${note.id}` : "/api/notes", { method: note ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(null);
    if (!res?.ok) return setError(data.error ?? "Couldn't save.");
    setNote({ id: data.note.id, body: draft, origin: data.note.origin, editedByUser: data.note.editedByUser, updatedAt: Date.now() });
    setEditing(false);
  };

  const generate = async () => {
    if (note?.body.trim() && !confirm("Replace this note with AI-generated notes from the Moodle materials?")) return;
    setBusy("ai");
    setError(null);
    const res = await fetch("/api/ai/session-notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId: s.courseId, sessionKey: s.key }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(null);
    if (!res?.ok) return setError(data.error ?? "Couldn't generate notes.");
    setNote({ id: data.note.id, body: data.note.body, origin: "ai", updatedAt: Date.now() });
    setDraft(data.note.body);
    router.refresh();
  };

  return (
    <article className="depth-card rounded-2xl border border-line bg-surface">
      <header className="flex items-start gap-3 p-4">
        <span className={cx("chip-3d mt-0.5 shrink-0 rounded-lg px-2 py-1 text-[0.7rem] font-semibold uppercase tracking-wide", s.kind === "lecture" ? "bg-accent-soft text-accent" : "bg-ok-soft text-ok")}>
          {s.kind === "lecture" ? "Lecture" : "Seminar"}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-fg">{s.label}</h3>
          <p className="text-xs text-subtle">{s.sectionName}</p>
        </div>
        {note?.body.trim() ? <CheckCircle2 size={18} className="mt-0.5 text-ok" aria-label="Has notes" /> : null}
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? "Collapse" : "Expand"} className="flex size-9 items-center justify-center rounded-lg text-subtle hover:bg-surface-2">
          <ChevronDown size={18} className={cx("transition-transform", open && "rotate-180")} aria-hidden />
        </button>
      </header>
      {open && (
        <div className="border-t border-line px-4 pb-4 pt-3">
          {editing ? (
            <>
              <label htmlFor={`sn-${s.key}`} className="sr-only">Notes for {s.label}</label>
              <textarea
                id={`sn-${s.key}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={8}
                placeholder={"- Key point\n- Another key point\n**Key terms**\n- Term — meaning"}
                className="block w-full resize-y rounded-xl border border-line bg-surface-2 p-3 font-mono text-sm leading-relaxed text-fg placeholder:text-subtle"
              />
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={save} disabled={busy !== null} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent-strong disabled:opacity-60">
                  {busy === "save" && <Loader2 size={15} className="animate-spin" aria-hidden />} Save
                </button>
                <button type="button" onClick={() => { setEditing(false); setDraft(note?.body ?? ""); }} className="min-h-10 rounded-xl px-3 text-sm text-muted hover:text-fg">Cancel</button>
              </div>
            </>
          ) : note?.body.trim() ? (
            <>
              {note.origin === "ai" && <div className="mb-2"><AiTag label={note.editedByUser ? "AI · edited by you" : "AI from Moodle materials"} /></div>}
              <div className="prose-w1 text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(note.body) }} />
            </>
          ) : (
            <p className="text-sm text-subtle">No revision notes yet.</p>
          )}

          {!reviewMode && !editing && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => setEditing(true)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-sm text-muted hover:text-fg">
                <Pencil size={14} aria-hidden /> {note?.body.trim() ? "Edit" : "Write notes"}
              </button>
              {aiAvailable && (
                <button type="button" onClick={generate} disabled={busy !== null} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-dashed border-accent-line px-3 text-sm text-accent hover:bg-accent-soft disabled:opacity-60">
                  {busy === "ai" ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
                  {busy === "ai" ? "Reading materials…" : "Generate concise notes"}
                </button>
              )}
            </div>
          )}
          {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}

          {s.materials.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-medium text-subtle">Materials for this {s.kind} ({s.materials.length})</summary>
              <ul className="mt-1 flex flex-col">
                {s.materials.map((m) => (
                  <li key={m.url}>
                    <a href={m.url} target="_blank" rel="noopener noreferrer" className="flex min-h-9 items-center gap-2 text-sm text-muted hover:text-fg">
                      <span className="text-xs text-subtle">{m.kind}</span> {m.title}
                      <span className="sr-only"> (opens Moodle in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </article>
  );
}
