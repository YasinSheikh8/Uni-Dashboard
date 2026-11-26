import Link from "next/link";
import { NotebookPen, Pin, Plus } from "lucide-react";
import { attempt, getSource } from "@/lib/data/source";
import { listNotes } from "@/lib/store/user-data";
import { dayLabel } from "@/lib/time";
import { AiTag, ButtonLink, Card, EmptyState, PageHeader, ProblemState } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notes" };

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ module?: string; week?: string; origin?: string; q?: string }> }) {
  const sp = await searchParams;
  const source = await getSource();
  const [notesRes, mods] = await Promise.all([attempt(async () => listNotes(await source.userKey())), attempt(() => source.modules())]);
  const modules = mods.ok ? mods.data : [];
  const code = new Map(modules.map((m) => [m.id, m.code]));
  const notes = notesRes.ok ? notesRes.data : [];
  const weeks = [...new Set(notes.map((n) => n.week).filter((w): w is number => typeof w === "number"))].sort((a, b) => a - b);
  const q = (sp.q ?? "").toLowerCase();
  const filtered = notes.filter(
    (n) =>
      (!sp.module || String(n.courseId ?? "none") === sp.module) &&
      (!sp.week || String(n.week) === sp.week) &&
      (!sp.origin || n.origin === sp.origin) &&
      (!q || `${n.title} ${n.topic ?? ""} ${n.lecture ?? ""} ${n.tags.join(" ")} ${n.body}`.toLowerCase().includes(q)),
  );

  // Group: module → week
  const groups = new Map<string, typeof filtered>();
  for (const n of filtered) {
    const k = n.courseId ? code.get(n.courseId) ?? "Other module" : "No module";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(n);
  }
  const sel = "min-h-11 rounded-xl border border-line bg-surface-2 px-3 text-sm text-fg";

  return (
    <>
      <PageHeader
        title="Notes & study guides"
        subtitle="Your own notes, plus AI study guides made from your Moodle materials. Organise by module, week, lecture and topic."
        actions={<ButtonLink href="/notes/new" variant="primary"><Plus size={16} aria-hidden /> New note</ButtonLink>}
      />
      <form action="/notes" className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <label htmlFor="nq" className="sr-only">Search notes</label>
        <input id="nq" name="q" defaultValue={sp.q} placeholder="Search notes…" className={`${sel} placeholder:text-subtle lg:col-span-2`} />
        <label htmlFor="nm" className="sr-only">Module</label>
        <select id="nm" name="module" defaultValue={sp.module ?? ""} className={sel}>
          <option value="">All modules</option>
          {modules.map((m) => <option key={m.id} value={m.id}>{m.code}</option>)}
          <option value="none">No module</option>
        </select>
        <label htmlFor="nw" className="sr-only">Week</label>
        <select id="nw" name="week" defaultValue={sp.week ?? ""} className={sel}>
          <option value="">Any week</option>
          {weeks.map((w) => <option key={w} value={w}>Week {w}</option>)}
        </select>
        <div className="flex gap-2">
          <label htmlFor="no" className="sr-only">Kind</label>
          <select id="no" name="origin" defaultValue={sp.origin ?? ""} className={`${sel} flex-1`}>
            <option value="">All notes</option>
            <option value="personal">My notes</option>
            <option value="ai">AI study guides</option>
          </select>
          <button type="submit" className="min-h-11 rounded-xl border border-line px-3 text-sm text-muted hover:text-fg">Apply</button>
        </div>
      </form>

      {!notesRes.ok && <ProblemState problem={notesRes.problem} />}
      {notesRes.ok && !notes.length && (
        <EmptyState icon={<NotebookPen size={28} />} title="No notes yet">
          Write your own, or open a module and use <em>Create AI study guide</em> on a week to get notes based on its materials.
        </EmptyState>
      )}
      {notes.length > 0 && !filtered.length && <EmptyState title="No notes match these filters" />}
      <div className="flex flex-col gap-4">
        {[...groups.entries()].map(([group, list]) => (
          <Card key={group}>
            <h2 className="mb-2 text-sm font-semibold text-accent">{group}</h2>
            <ul className="-mx-3">
              {list
                .sort((a, b) => (a.week ?? 99) - (b.week ?? 99) || b.updatedAt - a.updatedAt)
                .map((n) => (
                  <li key={n.id}>
                    <Link href={`/notes/${n.id}`} className="flex min-h-14 items-center gap-3 rounded-xl px-3 py-2 hover:bg-surface-2">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-[0.95rem] text-fg">
                          {n.pinned && <Pin size={13} className="text-accent" aria-label="Pinned" />}
                          <span className="truncate">{n.title}</span>
                        </span>
                        <span className="text-xs text-subtle">
                          {[typeof n.week === "number" ? `Week ${n.week}` : null, n.lecture, n.topic, ...n.tags.map((t) => `#${t}`)].filter(Boolean).join(" · ") || "Not organised yet"}
                        </span>
                      </span>
                      {n.origin === "ai" && <AiTag label={n.editedByUser ? "AI · edited" : "AI"} />}
                      <span className="shrink-0 text-xs text-subtle">{dayLabel(n.updatedAt)}</span>
                    </Link>
                  </li>
                ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
