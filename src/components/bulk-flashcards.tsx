"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Layers, Loader2, Square } from "lucide-react";

export interface PendingUnit {
  courseId: number;
  sectionId: number;
  code: string;
  label: string;
}

/**
 * Generates flashcards + a quiz for every unit that doesn't have them yet, one
 * unit at a time. The server paces requests for free AI plans; if the daily
 * allowance runs out it stops and you can carry on later.
 */
export function BulkFlashcards({ pending, aiReady, demo }: { pending: PendingUnit[]; aiReady: boolean; demo: boolean }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [current, setCurrent] = useState<string | null>(null);
  const [total, setTotal] = useState(pending.length);
  const [message, setMessage] = useState<string | null>(null);
  const stop = useRef(false);

  if (!pending.length && !done && !skipped) return <p className="text-sm text-subtle">Every unit in your visible modules has flashcards.</p>;
  if (!aiReady && !demo) return <p className="text-sm text-subtle">Set up an AI key on the server to generate flashcards for all modules at once.</p>;

  const run = async () => {
    stop.current = false;
    setRunning(true);
    setMessage(null);
    let made = 0;
    let skip = 0;
    setTotal(pending.length);
    setDone(0);
    setSkipped(0);
    for (const u of pending) {
      if (stop.current) break;
      setCurrent(`${u.code} · ${u.label}`);
      const res = await fetch(`/api/study/${u.courseId}/${u.sectionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate" }),
      }).catch(() => null);
      const data = res ? await res.json().catch(() => ({})) : {};
      if (res?.ok) setDone(++made);
      else if (res?.status === 429 || res?.status === 503) {
        setMessage(`${res.status === 429 ? "Paused — the AI plan's limit was reached" : "Stopped"}: ${data.error ?? ""} Press the button again later to carry on.`);
        break;
      } else setSkipped(++skip); // nothing readable in that unit, or a one-off error
    }
    setCurrent(null);
    setRunning(false);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {!running && pending.length > 0 ? (
          <button type="button" onClick={run} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent-strong">
            <Layers size={16} aria-hidden /> {demo ? "Load sample flashcards for all modules" : `Generate flashcards for all ${pending.length} units`}
          </button>
        ) : running ? (
          <button type="button" onClick={() => (stop.current = true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm hover:bg-surface-2">
            <Square size={14} aria-hidden /> Stop after this unit
          </button>
        ) : null}
        {running && <Loader2 size={18} className="animate-spin text-accent" aria-hidden />}
      </div>
      {(running || done > 0 || skipped > 0) && (
        <div role="status" className="text-sm text-muted">
          <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${total ? ((done + skipped) / total) * 100 : 100}%` }} />
          </div>
          {done} of {total} units done{skipped ? ` · ${skipped} skipped (nothing readable or an error)` : ""}
          {current && <span className="block text-xs text-subtle">Now: {current}{!demo && " — about a minute per unit on a free AI plan"}</span>}
        </div>
      )}
      {message && <p className="text-sm text-warn" role="alert">{message}</p>}
    </div>
  );
}
