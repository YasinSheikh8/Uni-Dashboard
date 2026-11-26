"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { formatDateTime } from "@/lib/time";

interface Status {
  enabled: boolean;
  reason?: string;
  error?: string;
  total?: number;
  upToDate?: number;
  yours?: number;
  unreadable?: number;
  toDo?: number;
  lastRunAt?: number | null;
  lastRunSummary?: string | null;
}

export function AutoNotesPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string | null>(null);
  const load = () => fetch("/api/auto-notes").then((r) => r.json()).then(setStatus).catch(() => setStatus(null));
  useEffect(() => {
    load();
  }, []);

  const runAll = async () => {
    setRunning(true);
    setLog("Reading this week's materials first…");
    for (let i = 0; i < 40; i++) {
      const res = await fetch("/api/auto-notes", { method: "POST" }).catch(() => null);
      const data = res ? await res.json().catch(() => ({})) : {};
      if (!res?.ok) {
        setLog(data.error ?? "Stopped: couldn't reach the server.");
        break;
      }
      setLog(`So far: ${data.message}`);
      await load();
      if (data.rateLimited || !data.remaining || (data.generated === 0 && data.unreadable === 0)) break;
    }
    setRunning(false);
    await load();
  };

  if (!status) return <Loader2 size={18} className="animate-spin text-subtle" aria-label="Loading" />;
  if (status.reason === "demo") return <p className="text-sm text-muted">Available once Moodle is connected.</p>;
  if (status.error) return <p className="text-sm text-danger" role="alert">Couldn&apos;t check Moodle: {status.error}</p>;
  return (
    <div className="flex flex-col gap-3 text-sm">
      {!status.enabled && (
        <p className="text-warn">Off — set <code>AI_API_KEY</code> on the server to turn on automatic notes.</p>
      )}
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Sessions with materials", status.total],
          ["Notes up to date", (status.upToDate ?? 0) + (status.yours ?? 0)],
          ["Waiting to be written", status.toDo],
          ["Only PowerPoint/video", status.unreadable],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-xl border border-line bg-surface-2 p-3">
            <dt className="text-xs text-subtle">{label}</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-fg">{value ?? 0}</dd>
          </div>
        ))}
      </dl>
      <p className="text-subtle">
        {status.lastRunAt ? `Last checked ${formatDateTime(status.lastRunAt)} — ${status.lastRunSummary}.` : "Not run yet."} Runs daily and whenever you open the dashboard (at most every 6 hours). Your own notes and notes you&apos;ve edited are never overwritten.
      </p>
      {status.enabled && (status.toDo ?? 0) > 0 && (
        <button type="button" onClick={runAll} disabled={running} className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-xl border border-dashed border-accent-line px-4 text-accent hover:bg-accent-soft disabled:opacity-60">
          {running ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Sparkles size={16} aria-hidden />}
          {running ? "Writing notes…" : `Write the ${status.toDo} missing notes now`}
        </button>
      )}
      {log && <p className="text-muted" role="status">{log}</p>}
    </div>
  );
}
