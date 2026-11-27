import Link from "next/link";
import { ChevronDown, NotebookPen, Pin, Plus, Search } from "lucide-react";
import { attempt, getSource } from "@/lib/data/source";
import { listNotes, type Note } from "@/lib/store/user-data";
import { dayLabel } from "@/lib/time";
import { ButtonLink, EmptyState, PageHeader, ProblemState, cx } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notes" };

type Kind = "lecture" | "seminar" | "week" | "guide" | "note";

function kindOf(n: Note): Kind {
  if (n.sessionKey) {
    if (/-seminar-/.test(n.sessionKey) || /^seminar/i.test(n.lecture ?? "")) return "seminar";
    if (/-week-/.test(n.sessionKey)) return "week";
    return "lecture";
  }
  return n.origin === "ai" ? "guide" : "note";
}

const KIND: Record<Kind, { label: string; cls: string }> = {
  lecture: { label: "Lecture", cls: "bg-accent-soft text-accent" },
  seminar: { label: "Seminar", cls: "bg-ok-soft text-ok" },
  week: { label: "Week", cls: "bg-warn-soft text-warn" },
  guide: { label: "Guide", cls: "bg-accent-soft text-accent" },
  note: { label: "Note", cls: "bg-surface-3 text-muted" },
};

/** Short, readable title: session notes show the session; others keep theirs. */
function shortTitle(n: Note): string {
  if (n.sessionKey) return n.lecture?.trim() || "Revision notes";
  return n.title.replace(/^Study guide:\s*/i, "");
}

/** First meaningful line of the note, without Markdown or [S1] citations. */
function preview(body: string): string {
  const line = body
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !/^(#|>|\*\*(key terms|sources|not covered)|- \[S\d)/i.test(l));
  return (line ?? "")
    .replace(/^[-*]\s+(\[[ xX]\]\s+)?/, "")
    .replace(/(\[S\d+\])+/g, "")
    .replace(/\*\*|`/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim()
    .slice(0, 140);
}

const FILTERS: { key: string; label: string; test: (n: Note) => boolean }[] = [
  { key: "", label: "All", test: () => true },
  { key: "revision", label: "Lectures & seminars", test: (n) => !!n.sessionKey },
  { key: "mine", label: "My notes", test: (n) => !n.sessionKey && n.origin === "personal" },
  { key: "guides", label: "Study guides", test: (n) => !n.sessionKey && n.origin === "ai" },
];

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ module?: string; show?: string; q?: string }> }) {
  const sp = await searchParams;
  const source = await getSource();
  const [notesRes, mods, hiddenIds] = await Promise.all([
    attempt(async () => listNotes(await source.userKey())),
    attempt(() => source.modules()),
    source.hiddenIds().catch(() => new Set<number>()),
  ]);
  const modules = mods.ok ? mods.data : [];
  const modById = new Map(modules.map((m) => [m.id, m]));
  const notes = (notesRes.ok ? notesRes.data : []).filter((n) => !n.courseId || !hiddenIds.has(n.courseId));
  const filter = FILTERS.find((f) => f.key === (sp.show ?? "")) ?? FILTERS[0];
  const q = (sp.q ?? "").toLowerCase().trim();
  const filtered = notes.filter(
    (n) =>
      filter.test(n) &&
      (!sp.module || String(n.courseId ?? "none") === sp.module) &&
      (!q || `${n.title} ${n.topic ?? ""} ${n.lecture ?? ""} ${n.tags.join(" ")} ${n.body}`.toLowerCase().includes(q)),
  );

  // Module → week/topic → notes
  const byModule = new Map<string, { title: string; code: string; weeks: Map<string, { label: string; order: number; notes: Note[] }> }>();
  for (const n of filtered) {
    const m = n.courseId ? modById.get(n.courseId) : undefined;
    const mk = m ? String(m.id) : "none";
    if (!byModule.has(mk)) byModule.set(mk, { title: m?.fullName ?? "Other notes", code: m?.code ?? "", weeks: new Map() });
    const weeks = byModule.get(mk)!.weeks;
    const wk = typeof n.week === "number" ? `w${n.week}` : n.topic ? `t${n.topic}` : "other";
    const label = typeof n.week === "number" ? `Week ${n.week}${n.topic ? ` · ${n.topic.replace(/^Term \d+,?\s*Week \d+\s*[-–:]\s*/i, "")}` : ""}` : n.topic ?? "General";
    if (!weeks.has(wk)) weeks.set(wk, { label, order: typeof n.week === "number" ? n.week : 999, notes: [] });
    weeks.get(wk)!.notes.push(n);
  }
  const moduleGroups = [...byModule.entries()].sort((a, b) => (a[0] === "none" ? 1 : b[0] === "none" ? -1 : a[1].code.localeCompare(b[1].code)));
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { module: sp.module, show: sp.show, q: sp.q, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/notes?${s}` : "/notes";
  };
  const chip = (active: boolean) =>
    cx("inline-flex min-h-9 shrink-0 items-center whitespace-nowrap rounded-full border px-3 text-sm", active ? "border-accent-line bg-accent-soft text-accent" : "border-line text-muted hover:text-fg");

  return (
    <>
      <PageHeader
        title="Notes"
        subtitle="Revision notes for every lecture and seminar, study guides and your own notes — by module and week."
        actions={<ButtonLink href="/notes/new" variant="primary"><Plus size={16} aria-hidden /> New note</ButtonLink>}
      />

      <form action="/notes" role="search" className="relative mb-3">
        {sp.module && <input type="hidden" name="module" value={sp.module} />}
        {sp.show && <input type="hidden" name="show" value={sp.show} />}
        <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
        <label htmlFor="nq" className="sr-only">Search notes</label>
        <input id="nq" name="q" defaultValue={sp.q} placeholder="Search notes" className="min-h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-3 text-base text-fg placeholder:text-subtle" />
      </form>
      <nav aria-label="Filter by type" className="-mx-4 mb-2 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map((f) => (
          <Link key={f.key} href={href({ show: f.key || undefined })} aria-current={filter.key === f.key ? "true" : undefined} className={chip(filter.key === f.key)}>
            {f.label}
          </Link>
        ))}
      </nav>
      {modules.length > 1 && (
        <nav aria-label="Filter by module" className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1">
          <Link href={href({ module: undefined })} className={chip(!sp.module)}>All modules</Link>
          {modules.map((m) => (
            <Link key={m.id} href={href({ module: String(m.id) })} aria-current={sp.module === String(m.id) ? "true" : undefined} className={chip(sp.module === String(m.id))}>
              {m.code}
            </Link>
          ))}
        </nav>
      )}

      {!notesRes.ok && <ProblemState problem={notesRes.problem} />}
      {notesRes.ok && !notes.length && (
        <EmptyState icon={<NotebookPen size={28} />} title="No notes yet">
          Revision notes appear here as they&apos;re written for each lecture and seminar. You can also write your own.
        </EmptyState>
      )}
      {notes.length > 0 && !filtered.length && <EmptyState title="No notes match" />}

      <div className="flex flex-col gap-3">
        {moduleGroups.map(([key, g]) => {
          const weeks = [...g.weeks.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
          const count = weeks.reduce((n, w) => n + w.notes.length, 0);
          return (
            <details key={key} open={moduleGroups.length <= 2 || !!sp.module || !!q} className="group depth-card rounded-2xl border border-line bg-surface">
              <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3">
                {g.code && <span className="chip-3d rounded-md bg-accent-soft px-2 py-0.5 text-xs font-semibold tracking-wide text-accent">{g.code}</span>}
                <span className="min-w-0 flex-1 truncate font-medium">{g.title}</span>
                <span className="text-xs text-subtle">{count}</span>
                <ChevronDown size={18} className="shrink-0 text-subtle transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <div className="border-t border-line px-2 pb-2 pt-1">
                {weeks.map((w) => (
                  <section key={w.label} className="pt-2">
                    <h3 className="truncate px-2 pb-1 text-xs font-medium uppercase tracking-wide text-subtle">{w.label}</h3>
                    <ul>
                      {w.notes
                        .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || kindOf(a).localeCompare(kindOf(b)) || (a.lecture ?? "").localeCompare(b.lecture ?? "", "en", { numeric: true }))
                        .map((n) => {
                          const k = kindOf(n);
                          const pv = preview(n.body);
                          return (
                            <li key={n.id}>
                              <Link href={`/notes/${n.id}`} className="flex min-h-12 items-start gap-3 rounded-xl px-2 py-2 hover:bg-surface-2">
                                <span className={cx("mt-0.5 w-[4.6rem] shrink-0 rounded-md py-0.5 text-center text-[0.68rem] font-semibold uppercase tracking-wide", KIND[k].cls)}>{KIND[k].label}</span>
                                <span className="min-w-0 flex-1">
                                  <span className="flex items-center gap-1.5 text-sm text-fg">
                                    {n.pinned && <Pin size={12} className="shrink-0 text-accent" aria-label="Pinned" />}
                                    <span className="truncate">{shortTitle(n)}</span>
                                    {n.origin === "ai" && !n.editedByUser && <span className="shrink-0 text-[0.65rem] font-medium uppercase text-subtle">AI</span>}
                                  </span>
                                  {pv && <span className="mt-0.5 line-clamp-1 text-xs text-subtle">{pv}</span>}
                                </span>
                                <span className="shrink-0 pt-0.5 text-xs text-subtle">{dayLabel(n.updatedAt)}</span>
                              </Link>
                            </li>
                          );
                        })}
                    </ul>
                  </section>
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </>
  );
}
