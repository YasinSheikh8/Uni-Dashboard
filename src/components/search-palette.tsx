"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { BookOpen, ClipboardCheck, FileText, Link2, Loader2, NotebookPen, Search, X } from "lucide-react";
import { cx } from "./ui";

export interface SearchHit {
  type: "module" | "resource" | "assessment" | "note" | "link";
  title: string;
  subtitle?: string;
  href: string;
  external?: boolean;
}

const ICONS = { module: BookOpen, resource: FileText, assessment: ClipboardCheck, note: NotebookPen, link: Link2 };
const GROUP = { module: "Modules", resource: "Materials", assessment: "Deadlines & tests", note: "Notes", link: "Warwick links" };

export function openSearch() {
  window.dispatchEvent(new Event("w1:search"));
}

export function SearchPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const router = useRouter();
  const listId = useId();

  const show = useCallback(() => {
    lastFocus.current = document.activeElement as HTMLElement;
    setOpen(true);
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    lastFocus.current?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName) || (e.target as HTMLElement)?.isContentEditable;
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("w1:search", show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("w1:search", show);
    };
  }, [show]);

  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 10);
    document.documentElement.style.overflow = open ? "hidden" : "";
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      setError(null);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { hits: SearchHit[] };
        setHits(data.hits);
        setActive(0);
        setError(null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError("Search isn't available right now.");
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open]);

  const go = (hit: SearchHit) => {
    close();
    if (hit.external) window.open(hit.href, "_blank", "noopener,noreferrer");
    else router.push(hit.href);
  };

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && hits[active]) {
      e.preventDefault();
      go(hits[active]);
    } else if (e.key === "Enter" && q.trim()) {
      close();
      router.push(`/search?q=${encodeURIComponent(q.trim())}`);
    }
  };

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-0 sm:p-6 sm:pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div role="dialog" aria-modal="true" aria-label="Search" className="flex h-dvh w-full flex-col overflow-hidden border-line bg-surface shadow-2xl sm:h-auto sm:max-h-[70vh] sm:max-w-xl sm:rounded-2xl sm:border" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-2 border-b border-line px-4" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <Search size={18} className="shrink-0 text-subtle" aria-hidden />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search modules, materials, deadlines, notes…"
            aria-label="Search"
            role="combobox"
            aria-expanded={hits.length > 0}
            aria-controls={listId}
            aria-activedescendant={hits[active] ? `${listId}-${active}` : undefined}
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-subtle"
          />
          {loading && <Loader2 size={18} className="animate-spin text-subtle" aria-label="Searching" />}
          <button type="button" onClick={close} className="flex size-10 items-center justify-center rounded-lg text-muted hover:bg-surface-2" aria-label="Close search">
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {error && <p className="p-4 text-sm text-danger">{error}</p>}
          {!error && q.trim().length < 2 && <p className="p-4 text-sm text-subtle">Type at least two characters. Tip: press / or ⌘K anywhere.</p>}
          {!error && q.trim().length >= 2 && !loading && hits.length === 0 && <p className="p-4 text-sm text-subtle">No matches for “{q.trim()}”.</p>}
          <ul id={listId} role="listbox" aria-label="Results">
            {hits.map((h, i) => {
              const Icon = ICONS[h.type];
              const header = GROUP[h.type] !== lastGroup ? (lastGroup = GROUP[h.type]) : null;
              return (
                <li key={`${h.type}-${h.href}-${i}`} role="presentation">
                  {header && <div className="px-3 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-subtle">{header}</div>}
                  <div
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(h)}
                    className={cx("flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 py-2", i === active && "bg-surface-2")}
                  >
                    <Icon size={18} className="shrink-0 text-subtle" aria-hidden />
                    <div className="min-w-0">
                      <div className="truncate text-sm text-fg">{h.title}</div>
                      {h.subtitle && <div className="truncate text-xs text-subtle">{h.subtitle}</div>}
                    </div>
                    {h.external && <span className="ml-auto text-xs text-subtle">opens site</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
