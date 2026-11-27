"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { cx } from "./ui";

/** Hide or show one module everywhere in the app. */
export function ModuleVisibilityButton({ courseId, code, hidden, compact }: { courseId: number; code: string; hidden: boolean; compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, start] = useTransition();
  const [error, setError] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setBusy(true);
        setError(false);
        const res = await fetch("/api/modules/visibility", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, hidden: !hidden }) }).catch(() => null);
        setBusy(false);
        if (!res?.ok) return setError(true);
        start(() => router.refresh());
      }}
      aria-label={`${hidden ? "Show" : "Hide"} ${code}${hidden ? "" : " in every tab"}`}
      className={cx(
        "relative z-10 inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm",
        hidden ? "border border-line bg-surface-2 text-fg hover:bg-surface-3" : "text-subtle hover:bg-surface-2 hover:text-fg",
        error && "text-danger",
      )}
    >
      {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : hidden ? <Eye size={15} aria-hidden /> : <EyeOff size={15} aria-hidden />}
      {!compact && (error ? "Try again" : hidden ? "Show" : "Hide")}
    </button>
  );
}
