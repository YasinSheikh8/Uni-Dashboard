import Link from "next/link";
import { BookOpen, ChevronRight } from "lucide-react";
import { attempt, getSource } from "@/lib/data/source";
import type { Module } from "@/lib/data/model";
import { dayLabel } from "@/lib/time";
import { Card, EmptyState, ExternalLink, PageHeader, ProblemState } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Modules" };

function ModuleCard({ m }: { m: Module }) {
  return (
    <li>
      <Link href={`/modules/${m.id}`} className="tilt-card group relative flex h-full min-h-24 flex-col overflow-hidden rounded-2xl border border-line bg-surface p-4">
        <span className="flex items-center justify-between gap-2">
          <span className="chip-3d rounded-md bg-accent-soft px-2 py-0.5 text-xs font-semibold tracking-wide text-accent">{m.code}</span>
          <ChevronRight size={18} className="text-subtle group-hover:text-fg" aria-hidden />
        </span>
        <span className="mt-2 text-[1rem] font-medium leading-snug text-fg">{m.fullName}</span>
        <span className="mt-auto pt-3 text-xs text-subtle">
          {m.lastAccess ? `Last opened on Moodle ${dayLabel(m.lastAccess).toLowerCase()}` : "Not opened on Moodle yet"}
          {typeof m.progress === "number" && ` · ${Math.round(m.progress)}% complete (Moodle)`}
        </span>
      </Link>
    </li>
  );
}

export default async function ModulesPage() {
  const source = await getSource();
  const res = await attempt(() => source.modules());
  const now = Date.now();
  const mods = res.ok ? res.data : [];
  const current = mods.filter((m) => !m.endDate || m.endDate > now - 30 * 86400000);
  const past = mods.filter((m) => !current.includes(m));
  return (
    <>
      <PageHeader title="Modules" subtitle="Everything you're enrolled on in Moodle. Open a module for its materials, assessments and your notes." />
      {!res.ok && <ProblemState problem={res.problem} />}
      {res.ok && !mods.length && <EmptyState icon={<BookOpen size={28} />} title="No modules found">Moodle didn&apos;t return any enrolments for this account.</EmptyState>}
      {current.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{current.map((m) => <ModuleCard key={m.id} m={m} />)}</ul>
      )}
      {past.length > 0 && (
        <details className="mt-8">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-muted">Past modules ({past.length})</summary>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{past.map((m) => <ModuleCard key={m.id} m={m} />)}</ul>
        </details>
      )}
      {res.ok && source.mode === "live" && (
        <Card className="mt-8" as="div">
          <p className="text-sm text-muted">
            Missing a module? Moodle only lists modules you&apos;re enrolled on there. Check{" "}
            <ExternalLink href="https://moodle.warwick.ac.uk/my/courses.php" className="text-accent underline underline-offset-2">My courses on Moodle</ExternalLink>.
          </p>
        </Card>
      )}
    </>
  );
}
