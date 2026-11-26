import Link from "next/link";
import { getSource } from "@/lib/data/source";
import { searchAll } from "@/lib/search";
import { Card, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Search" };

const LABEL = { module: "Modules", assessment: "Deadlines & tests", resource: "Materials", note: "Notes", link: "Warwick links" } as const;

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const hits = q.trim().length >= 2 ? await searchAll(await getSource(), q.trim(), 30) : [];
  const groups = (Object.keys(LABEL) as (keyof typeof LABEL)[]).map((t) => [t, hits.filter((h) => h.type === t)] as const).filter(([, l]) => l.length);
  return (
    <>
      <PageHeader title="Search" subtitle="Modules, materials, deadlines, notes and Warwick links." />
      <form action="/search" className="mb-6 flex gap-2" role="search">
        <label htmlFor="sq" className="sr-only">Search</label>
        <input id="sq" name="q" defaultValue={q} autoFocus placeholder="Search…" className="min-h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 text-base text-fg placeholder:text-subtle" />
        <button type="submit" className="min-h-12 rounded-xl bg-accent px-5 font-medium text-on-accent hover:bg-accent-strong">Search</button>
      </form>
      {q.trim().length >= 2 && !hits.length && <EmptyState title={`No results for “${q}”`} />}
      <div className="flex flex-col gap-4">
        {groups.map(([type, list]) => (
          <Card key={type}>
            <h2 className="mb-2 text-sm font-semibold">{LABEL[type]}</h2>
            <ul className="-mx-3">
              {list.map((h, i) => (
                <li key={i}>
                  {h.external ? (
                    <a href={h.href} target="_blank" rel="noopener noreferrer" className="block min-h-12 rounded-xl px-3 py-2 hover:bg-surface-2">
                      <span className="block text-sm text-fg">{h.title}</span>
                      {h.subtitle && <span className="block text-xs text-subtle">{h.subtitle}</span>}
                    </a>
                  ) : (
                    <Link href={h.href} className="block min-h-12 rounded-xl px-3 py-2 hover:bg-surface-2">
                      <span className="block text-sm text-fg">{h.title}</span>
                      {h.subtitle && <span className="block text-xs text-subtle">{h.subtitle}</span>}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
