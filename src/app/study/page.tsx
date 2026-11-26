import Link from "next/link";
import { Brain, ChevronRight } from "lucide-react";
import { attempt, getSource } from "@/lib/data/source";
import { unitsFor } from "@/lib/sessions";
import { dueCount, getStudyProgress, getStudySet } from "@/lib/store/user-data";
import { Badge, EmptyState, PageHeader, ProblemState } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Study" };

export default async function StudyPage() {
  const source = await getSource();
  const mods = await attempt(() => source.modules());
  if (!mods.ok) return <ProblemState problem={mods.problem} />;
  const now = Date.now();
  const user = await source.userKey();
  const current = mods.data.filter((m) => !m.endDate || m.endDate > now - 30 * 86400000);
  const rows = await Promise.all(
    current.map(async (m) => {
      const detail = await source.module(m.id).catch(() => null);
      const units = detail ? unitsFor(detail) : [];
      let cards = 0;
      let due = 0;
      for (const u of units) {
        const [set, prog] = await Promise.all([getStudySet(user, m.id, u.section.id).catch(() => null), getStudyProgress(user, m.id, u.section.id)]);
        cards += set?.cards.length ?? 0;
        due += dueCount(set, prog, now);
      }
      return { m, units: units.length, cards, due };
    }),
  );
  return (
    <>
      <PageHeader title="Study" subtitle="Flashcards, quizzes and revision notes for every module, unit by unit." />
      {!rows.length && <EmptyState icon={<Brain size={28} />} title="No current modules" />}
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map(({ m, units, cards, due }) => (
          <li key={m.id}>
            <Link href={`/modules/${m.id}?tab=study`} className="tilt-card group relative flex h-full min-h-40 flex-col overflow-hidden rounded-2xl border border-line bg-surface p-5">
              <span className="deck-stack" aria-hidden><span /><span /><span /></span>
              <span className="relative flex items-center justify-between">
                <span className="chip-3d rounded-md bg-accent-soft px-2 py-0.5 text-xs font-semibold tracking-wide text-accent">{m.code}</span>
                <ChevronRight size={18} className="text-subtle group-hover:text-fg" aria-hidden />
              </span>
              <span className="relative mt-2 font-medium leading-snug">{m.fullName}</span>
              <span className="relative mt-auto flex flex-wrap gap-2 pt-4">
                <Badge>{units} units</Badge>
                <Badge tone={cards ? "accent" : "neutral"}>{cards} cards</Badge>
                {due > 0 && <Badge tone="warn">{due} to review</Badge>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-subtle">
        Revision notes for each lecture and seminar are in each module&apos;s <strong className="text-muted">Revision notes</strong> tab.
      </p>
    </>
  );
}
