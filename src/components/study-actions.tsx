"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import type { Checklist, ChecklistItem } from "@/lib/store/user-data";
import { AiTag, cx } from "./ui";

export function GenerateGuideButton({ courseId, sectionId }: { courseId: number; sectionId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await fetch("/api/ai/study-guide", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ courseId, sectionId }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Couldn't create the study guide");
            router.push(`/notes/${data.id}`);
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm text-accent hover:bg-accent-soft disabled:opacity-60"
      >
        {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Sparkles size={15} aria-hidden />}
        {busy ? "Reading materials… (up to a minute)" : "Create AI study guide"}
      </button>
      {error && <span className="px-2.5 text-xs text-danger" role="alert">{error}</span>}
    </span>
  );
}

const ORIGIN_NOTE: Record<ChecklistItem["origin"], string | null> = {
  generic: "Generic step",
  ai: "AI suggestion",
  custom: null,
};

export function AssessmentChecklist({ assessmentKey, initial, aiAvailable, hasBrief }: { assessmentKey: string; initial: Checklist; aiAvailable: boolean; hasBrief: boolean }) {
  const [list, setList] = useState(initial);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const router = useRouter();

  const persist = async (next: Checklist) => {
    setList(next);
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/checklist/${encodeURIComponent(assessmentKey)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: next.items }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) setError("Couldn't save — your change may not be kept.");
  };

  const done = list.items.filter((i) => i.done).length;
  const hasAi = list.items.some((i) => i.origin === "ai");

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">
            {done} of {list.items.length} done
          </span>
          {saving && <span className="text-xs text-subtle">Saving…</span>}
        </div>
        {aiAvailable && (
          <button
            type="button"
            disabled={generating}
            onClick={async () => {
              setGenerating(true);
              setError(null);
              const res = await fetch(`/api/ai/plan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: assessmentKey }) }).catch(() => null);
              const data = res ? await res.json().catch(() => ({})) : {};
              setGenerating(false);
              if (!res?.ok) return setError(data.error ?? "Couldn't generate a plan.");
              setList(data.checklist);
              router.refresh();
            }}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-dashed border-accent-line px-3 text-sm text-accent hover:bg-accent-soft disabled:opacity-60"
          >
            {generating ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Sparkles size={15} aria-hidden />}
            {generating ? "Reading the brief…" : hasAi ? "Regenerate from brief" : hasBrief ? "Tailor steps to the brief" : "Suggest steps"}
          </button>
        )}
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={list.items.length} aria-valuenow={done} aria-label="Checklist progress">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${list.items.length ? (done / list.items.length) * 100 : 0}%` }} />
      </div>
      <ul className="flex flex-col gap-1.5">
        {list.items.map((item, idx) => (
          <li key={item.id} className={cx("group flex items-start gap-3 rounded-xl border px-3 py-2.5", item.origin === "custom" ? "border-line bg-surface-2" : "border-dashed border-line bg-surface-2/60")}>
            <input
              id={`chk-${item.id}`}
              type="checkbox"
              checked={item.done}
              onChange={() => persist({ ...list, items: list.items.map((x, i) => (i === idx ? { ...x, done: !x.done } : x)) })}
              className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
            />
            <label htmlFor={`chk-${item.id}`} className="min-w-0 flex-1 cursor-pointer">
              <span className={cx("block text-sm", item.done ? "text-subtle line-through" : "text-fg")}>{item.text}</span>
              {item.detail && <span className="mt-0.5 block text-xs text-subtle">{item.detail}</span>}
              {ORIGIN_NOTE[item.origin] && <span className="mt-1 block text-[0.7rem] uppercase tracking-wide text-subtle">{ORIGIN_NOTE[item.origin]}</span>}
            </label>
            <button
              type="button"
              aria-label={`Remove “${item.text}”`}
              onClick={() => persist({ ...list, items: list.items.filter((_, i) => i !== idx) })}
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-subtle opacity-100 hover:bg-surface-3 hover:text-danger sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
            >
              <Trash2 size={15} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const text = draft.trim();
          if (!text) return;
          setDraft("");
          persist({ ...list, items: [...list.items, { id: `c${Date.now()}`, text, done: false, origin: "custom" }] });
        }}
      >
        <label htmlFor="new-step" className="sr-only">Add your own step</label>
        <input
          id="new-step"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add your own step"
          maxLength={500}
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 text-sm text-fg placeholder:text-subtle"
        />
        <button type="submit" className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-line bg-surface-2 px-3 text-sm font-medium hover:bg-surface-3">
          <Plus size={16} aria-hidden /> Add
        </button>
      </form>
      {list.aiMissingInfo && list.aiMissingInfo.length > 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-accent-line p-3">
          <div className="mb-1"><AiTag label="AI: information the brief doesn't give" /></div>
          <ul className="list-disc pl-5 text-sm text-muted">
            {list.aiMissingInfo.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}
