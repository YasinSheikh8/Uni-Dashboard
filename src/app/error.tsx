"use client";

import { Notice } from "@/components/ui";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <Notice tone="danger" title="Something went wrong">This page couldn&apos;t load. Your notes are safe.</Notice>
      <button type="button" onClick={reset} className="min-h-11 w-fit rounded-xl border border-line bg-surface-2 px-4 text-sm font-medium hover:bg-surface-3">Try again</button>
    </div>
  );
}
