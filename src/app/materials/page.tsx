import { FileText } from "lucide-react";
import { KIND_LABEL, MATERIAL_KINDS } from "@/lib/classify";
import type { ResourceKind } from "@/lib/data/model";
import { attempt, getSource } from "@/lib/data/source";
import { ResourceRow } from "@/components/rows";
import { Card, EmptyState, PageHeader, ProblemState } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Materials" };

export default async function MaterialsPage({ searchParams }: { searchParams: Promise<{ q?: string; module?: string; type?: string; week?: string; sort?: string }> }) {
  const sp = await searchParams;
  const source = await getSource();
  const [res, mods] = await Promise.all([attempt(() => source.resources()), attempt(() => source.modules())]);
  const modules = mods.ok ? mods.data : [];
  const code = new Map(modules.map((m) => [m.id, m.code]));
  const all = (res.ok ? res.data : []).filter((r) => MATERIAL_KINDS.includes(r.kind));
  const weeks = [...new Set(all.map((r) => r.week).filter((w): w is number => w !== undefined))].sort((a, b) => a - b);
  const kinds = MATERIAL_KINDS.filter((k) => all.some((r) => r.kind === k));
  const terms = (sp.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const sort = sp.sort === "recent" ? "recent" : "module";

  const filtered = all.filter((r) => {
    if (sp.module && String(r.courseId) !== sp.module) return false;
    if (sp.type && r.kind !== (sp.type as ResourceKind)) return false;
    if (sp.week && String(r.week) !== sp.week) return false;
    if (terms.length) {
      const hay = `${r.title} ${r.sectionName} ${r.topic ?? ""} ${code.get(r.courseId) ?? ""} ${KIND_LABEL[r.kind]}`.toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  });

  // Group by module → section (lecture/week/topic), keeping Moodle's order.
  const groups = new Map<string, { title: string; sub: string; items: typeof filtered }>();
  if (sort === "module") {
    for (const r of filtered) {
      const k = `${r.courseId}:${r.sectionId}`;
      if (!groups.has(k)) groups.set(k, { title: r.sectionName, sub: code.get(r.courseId) ?? "", items: [] });
      groups.get(k)!.items.push(r);
    }
  }
  const recent = sort === "recent" ? [...filtered].sort((a, b) => (b.addedAt ?? b.updatedAt ?? 0) - (a.addedAt ?? a.updatedAt ?? 0)) : [];

  const sel = "min-h-11 rounded-xl border border-line bg-surface-2 px-3 text-sm text-fg";
  return (
    <>
      <PageHeader title="Materials" subtitle="Slides, readings, recordings and handouts from all your Moodle modules. Every item links to the original on Moodle." />
      <form action="/materials" className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <label htmlFor="m-q" className="sr-only">Find a lecture or topic</label>
        <input id="m-q" name="q" defaultValue={sp.q} placeholder="Find a lecture or topic…" className={`${sel} placeholder:text-subtle lg:col-span-2`} />
        <label htmlFor="m-module" className="sr-only">Module</label>
        <select id="m-module" name="module" defaultValue={sp.module ?? ""} className={sel}>
          <option value="">All modules</option>
          {modules.map((m) => <option key={m.id} value={m.id}>{m.code}</option>)}
        </select>
        <label htmlFor="m-type" className="sr-only">Type</label>
        <select id="m-type" name="type" defaultValue={sp.type ?? ""} className={sel}>
          <option value="">All types</option>
          {kinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        <label htmlFor="m-week" className="sr-only">Week</label>
        <select id="m-week" name="week" defaultValue={sp.week ?? ""} className={sel}>
          <option value="">Any week</option>
          {weeks.map((w) => <option key={w} value={w}>Week {w}</option>)}
        </select>
        <div className="flex gap-2">
          <label htmlFor="m-sort" className="sr-only">Sort</label>
          <select id="m-sort" name="sort" defaultValue={sort} className={`${sel} flex-1`}>
            <option value="module">By module & week</option>
            <option value="recent">Most recent</option>
          </select>
          <button type="submit" className="min-h-11 rounded-xl bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent-strong">Go</button>
        </div>
      </form>
      <p className="mb-4 text-xs text-subtle">
        Types are worked out from each item&apos;s title and file type, so a few may be labelled loosely. Weeks come from Moodle section names where they include one.
      </p>

      {!res.ok && <ProblemState problem={res.problem} />}
      {res.ok && !filtered.length && (
        <EmptyState icon={<FileText size={28} />} title="No materials match">
          {sp.type === "recording" ? "No recordings were found in your Moodle modules with these filters." : "Try fewer filters, or check the module on Moodle."}
        </EmptyState>
      )}
      <p className="sr-only" role="status">{filtered.length} materials</p>
      {sort === "module" ? (
        <div className="flex flex-col gap-3">
          {[...groups.values()].map((g, i) => (
            <Card key={i}>
              <h2 className="mb-1 text-sm font-semibold">
                <span className="mr-2 text-accent">{g.sub}</span>
                {g.title}
              </h2>
              <ul className="-mx-3">{g.items.map((r) => <ResourceRow key={r.id} r={r} showModule={false} />)}</ul>
            </Card>
          ))}
        </div>
      ) : (
        recent.length > 0 && (
          <Card>
            <ul className="-mx-3">{recent.map((r) => <ResourceRow key={r.id} r={r} moduleCode={code.get(r.courseId)} />)}</ul>
          </Card>
        )
      )}
    </>
  );
}
