"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, Lock, Search } from "lucide-react";
import type { QuickLink } from "@/config/links";

export function LinksBrowser({ links }: { links: QuickLink[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return links.filter((l) => terms.every((t) => `${l.title} ${l.description} ${l.keywords ?? ""} ${l.category}`.toLowerCase().includes(t)));
  }, [q, links]);
  const cats = [...new Set(filtered.map((l) => l.category))];
  return (
    <>
      <div className="relative mb-5">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
        <label htmlFor="link-q" className="sr-only">Search Warwick services</label>
        <input id="link-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search services — e.g. exams, wifi, map" className="min-h-12 w-full rounded-xl border border-line bg-surface px-10 text-base text-fg placeholder:text-subtle" />
      </div>
      <p className="sr-only" role="status">{filtered.length} services</p>
      {!filtered.length && <p className="text-sm text-muted">No services match “{q}”.</p>}
      <div className="flex flex-col gap-6">
        {cats.map((c) => (
          <section key={c}>
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-subtle">{c}</h2>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.filter((l) => l.category === c).map((l) => (
                <li key={l.url}>
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="group flex h-full min-h-20 flex-col rounded-2xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-line-strong">
                    <span className="flex items-center gap-2 font-medium text-fg">
                      {l.title}
                      {l.needsSignIn && <Lock size={13} className="text-subtle" aria-label="Warwick sign-in required" />}
                      <ArrowUpRight size={16} className="ml-auto text-subtle group-hover:text-fg" aria-hidden />
                    </span>
                    <span className="mt-1 text-sm text-muted">{l.description}</span>
                    <span className="mt-2 truncate text-xs text-subtle">{new URL(l.url).hostname}</span>
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
