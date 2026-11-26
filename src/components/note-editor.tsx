"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Eye, Loader2, Pencil, Pin, Save, Trash2 } from "lucide-react";
import { renderMarkdown } from "@/lib/markdown";
import { cx } from "./ui";

export interface EditableNote {
  id?: string;
  title: string;
  body: string;
  courseId?: number | null;
  week?: number | null;
  lecture?: string | null;
  topic?: string | null;
  tags: string[];
  pinned?: boolean;
}

const field = "min-h-11 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-fg placeholder:text-subtle";

export function NoteEditor({ note, modules, startInPreview = false }: { note: EditableNote; modules: { id: number; code: string; name: string }[]; startInPreview?: boolean }) {
  const router = useRouter();
  const [n, setN] = useState(note);
  const [preview, setPreview] = useState(startInPreview);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = <K extends keyof EditableNote>(k: K, v: EditableNote[K]) => {
    setN((x) => ({ ...x, [k]: v }));
    setDirty(true);
  };

  const save = async () => {
    if (!n.title.trim()) {
      setError("Give the note a title.");
      titleRef.current?.focus();
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch(n.id ? `/api/notes/${n.id}` : "/api/notes", {
      method: n.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...n, id: undefined }),
    }).catch(() => null);
    setSaving(false);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) return setError(data.error ?? "Couldn't save. Check your connection and try again.");
    setDirty(false);
    setSavedAt(Date.now());
    if (!n.id) router.replace(`/notes/${data.note.id}`);
    else router.refresh();
  };

  const remove = async () => {
    if (!n.id || !confirm("Delete this note? This can't be undone.")) return;
    const res = await fetch(`/api/notes/${n.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) return setError("Couldn't delete the note.");
    setDirty(false);
    router.push("/notes");
    router.refresh();
  };

  return (
    <div
      className="flex flex-col gap-4"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "s") {
          e.preventDefault();
          save();
        }
      }}
    >
      <div>
        <label htmlFor="n-title" className="mb-1 block text-sm font-medium text-muted">Title</label>
        <input id="n-title" ref={titleRef} value={n.title} onChange={(e) => set("title", e.target.value)} maxLength={200} className={cx(field, "text-base font-medium")} placeholder="e.g. Week 6 — supply and demand" />
      </div>
      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="sr-only">Organise</legend>
        <div>
          <label htmlFor="n-mod" className="mb-1 block text-xs text-subtle">Module</label>
          <select id="n-mod" value={n.courseId ?? ""} onChange={(e) => set("courseId", e.target.value ? Number(e.target.value) : null)} className={field}>
            <option value="">No module</option>
            {modules.map((m) => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="n-week" className="mb-1 block text-xs text-subtle">Week</label>
          <input id="n-week" type="number" inputMode="numeric" min={0} max={60} value={n.week ?? ""} onChange={(e) => set("week", e.target.value === "" ? null : Number(e.target.value))} className={field} placeholder="e.g. 6" />
        </div>
        <div>
          <label htmlFor="n-lecture" className="mb-1 block text-xs text-subtle">Lecture</label>
          <input id="n-lecture" value={n.lecture ?? ""} onChange={(e) => set("lecture", e.target.value)} maxLength={120} className={field} placeholder="e.g. Lecture 11" />
        </div>
        <div>
          <label htmlFor="n-topic" className="mb-1 block text-xs text-subtle">Topic</label>
          <input id="n-topic" value={n.topic ?? ""} onChange={(e) => set("topic", e.target.value)} maxLength={200} className={field} placeholder="e.g. Elasticity" />
        </div>
      </fieldset>
      <div>
        <label htmlFor="n-tags" className="mb-1 block text-xs text-subtle">Tags (comma-separated)</label>
        <input id="n-tags" value={n.tags.join(", ")} onChange={(e) => set("tags", e.target.value.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20))} className={field} placeholder="revision, exam" />
      </div>

      <div className="rounded-2xl border border-line bg-surface">
        <div className="flex items-center gap-1 border-b border-line p-1.5" role="tablist" aria-label="Editor mode">
          <button type="button" role="tab" aria-selected={!preview} onClick={() => setPreview(false)} className={cx("inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm", !preview ? "bg-surface-2 text-fg" : "text-muted")}>
            <Pencil size={15} aria-hidden /> Write
          </button>
          <button type="button" role="tab" aria-selected={preview} onClick={() => setPreview(true)} className={cx("inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm", preview ? "bg-surface-2 text-fg" : "text-muted")}>
            <Eye size={15} aria-hidden /> Preview
          </button>
          <span className="ml-auto hidden px-2 text-xs text-subtle sm:block">Markdown: ## heading, - list, - [ ] task, **bold**</span>
        </div>
        {preview ? (
          <div className="prose-w1 min-h-72 p-4" dangerouslySetInnerHTML={{ __html: renderMarkdown(n.body) || '<p class="muted">Nothing written yet.</p>' }} />
        ) : (
          <>
            <label htmlFor="n-body" className="sr-only">Note</label>
            <textarea id="n-body" value={n.body} onChange={(e) => set("body", e.target.value)} className="block min-h-72 w-full resize-y rounded-b-2xl bg-transparent p-4 font-mono text-[0.92rem] leading-relaxed text-fg outline-none placeholder:text-subtle" placeholder="Write your notes…" />
          </>
        )}
      </div>

      <div className="sticky bottom-20 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface/95 p-2 backdrop-blur lg:bottom-4">
        <button type="button" onClick={save} disabled={saving} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent-strong disabled:opacity-60">
          {saving ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Save size={16} aria-hidden />} Save
        </button>
        <button type="button" aria-pressed={!!n.pinned} onClick={() => set("pinned", !n.pinned)} className={cx("inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-sm", n.pinned ? "border-accent-line text-accent" : "border-line text-muted")}>
          <Pin size={15} aria-hidden /> {n.pinned ? "Pinned" : "Pin"}
        </button>
        <span className="text-xs text-subtle" role="status">
          {dirty ? "Unsaved changes" : savedAt ? "Saved" : ""}
        </span>
        {n.id && (
          <button type="button" onClick={remove} className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm text-muted hover:text-danger">
            <Trash2 size={15} aria-hidden /> Delete
          </button>
        )}
        {error && <p className="w-full px-1 text-sm text-danger" role="alert">{error}</p>}
      </div>
    </div>
  );
}
