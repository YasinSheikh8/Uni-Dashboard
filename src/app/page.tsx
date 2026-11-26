import Link from "next/link";
import { ArrowRight, Brain, BookOpen, CalendarDays, ClipboardCheck, FileText, Link2, ListTodo, NotebookPen, Sparkles, Sun } from "lucide-react";
import { MATERIAL_KINDS } from "@/lib/classify";
import { attempt, getSource } from "@/lib/data/source";
import { rankWork } from "@/lib/priorities";
import { allChecklists, dueCount, getStudyProgress, getStudySet, listNotes } from "@/lib/store/user-data";
import { getTimetable } from "@/lib/timetable/source";
import { addDaysToKey, dayLabel, formatDateLong, londonDateKey, londonDayRange, londonParts } from "@/lib/time";
import { AssessmentRow, ResourceRow, TimetableRow } from "@/components/rows";
import { Badge, Card, CardHeader, EmptyState, ExternalLink, Notice, PageHeader, ProblemState } from "@/components/ui";
import { RefreshButton } from "@/components/client-bits";

export const dynamic = "force-dynamic";

function greeting() {
  const h = londonParts(Date.now()).hour;
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function Home() {
  const source = await getSource();
  const now = Date.now();
  const today = londonDateKey(now);
  const { start, end } = londonDayRange(today);

  const [info, modules, assessments, resources, timetable, notes] = await Promise.all([
    attempt(() => source.info()),
    attempt(() => source.modules()),
    attempt(() => source.assessments()),
    attempt(() => source.resources()),
    attempt(() => getTimetable(source, start, londonDayRange(addDaysToKey(today, 1)).end)),
    attempt(async () => listNotes(await source.userKey())),
  ]);

  const firstProblem = [info, modules].find((r) => !r.ok);
  const user = await source.userKey().catch(() => "anon");
  const all = assessments.ok ? assessments.data : [];
  const lists = await allChecklists(user, all.map((a) => a.key)).catch(() => new Map());
  const progress = new Map(
    [...lists].map(([k, v]) => [k, { done: v.items.filter((i: { done: boolean }) => i.done).length, total: v.items.length }]),
  );
  const next = rankWork(all, progress, now, 5);
  const upcoming = all
    .filter((a) => !a.done && a.dueAt && a.dueAt > now)
    .sort((a, b) => a.dueAt! - b.dueAt!)
    .slice(0, 5);
  const codeById = new Map((modules.ok ? modules.data : []).map((m) => [m.id, m.code]));
  const recent = (resources.ok ? resources.data : [])
    .filter((r) => MATERIAL_KINDS.includes(r.kind) && !r.restricted && (r.addedAt || r.updatedAt))
    .sort((a, b) => (b.addedAt ?? b.updatedAt ?? 0) - (a.addedAt ?? a.updatedAt ?? 0))
    .slice(0, 6);
  const todayItems = timetable.ok ? timetable.data.items.filter((i) => i.start < end && (i.end ?? i.start) >= start) : [];
  const tomorrowItems = timetable.ok ? timetable.data.items.filter((i) => i.start >= end) : [];
  const coverage = timetable.ok ? timetable.data.coverage : undefined;
  const firstName = info.ok && info.data.userName ? info.data.userName.split(" ")[0] : null;
  const sectionPairs = [...new Set((resources.ok ? resources.data : []).map((r) => `${r.courseId}:${r.sectionId}`))];
  const cardsDue = (
    await Promise.all(
      sectionPairs.map(async (k) => {
        const [c, s] = k.split(":").map(Number);
        const set = await getStudySet(user, c, s).catch(() => null);
        return set ? dueCount(set, await getStudyProgress(user, c, s), now) : 0;
      }),
    )
  ).reduce((a, b) => a + b, 0);
  const weekDue = all.filter((a) => !a.done && a.dueAt && a.dueAt > now && a.dueAt < now + 7 * 86400000).length;
  const teachingToday = todayItems.filter((i) => i.category === "teaching").length;
  const currentModules = (modules.ok ? modules.data : []).filter((m) => !m.endDate || m.endDate > now - 30 * 86400000);

  return (
    <>
      <section className="depth-card relative mb-6 overflow-hidden rounded-3xl border border-line bg-surface p-5 sm:p-7">
        <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-accent-soft blur-3xl" aria-hidden />
        <div className="relative flex flex-wrap items-center gap-4 sm:flex-nowrap">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-subtle">{formatDateLong(now)}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[2rem]">{firstName ? `${greeting()}, ${firstName}` : greeting()}</h1>
            <ul className="mt-4 flex flex-wrap gap-2 text-sm">
              <li className="chip-3d rounded-full border border-line bg-surface-2 px-3 py-1.5 text-muted">
                <strong className="text-fg">{coverage?.teachingSynced ? teachingToday : "—"}</strong> {coverage?.teachingSynced ? `class${teachingToday === 1 ? "" : "es"} today` : "classes (timetable not synced)"}
              </li>
              <li className="chip-3d rounded-full border border-line bg-surface-2 px-3 py-1.5 text-muted"><strong className="text-fg">{weekDue}</strong> due in 7 days</li>
              <li>
                <Link href="/study" className="chip-3d inline-flex rounded-full border border-accent-line bg-accent-soft px-3 py-1.5 text-accent"><strong className="mr-1">{cardsDue}</strong> flashcard{cardsDue === 1 ? "" : "s"} to review</Link>
              </li>
            </ul>
          </div>
          <div className="hero-3d hidden shrink-0 sm:block" aria-hidden>
            <div className="stack"><span className="plane" /><span className="plane" /><span className="plane" /><span className="plane" /></div>
          </div>
          <div className="w-full sm:w-auto sm:self-start"><RefreshButton /></div>
        </div>
      </section>
      {firstProblem && !firstProblem.ok && (
        <div className="mb-6">
          <ProblemState problem={firstProblem.problem} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5 [&>*]:min-w-0">
        <Card className="lg:col-span-3">
          <CardHeader title="Today" icon={<Sun size={17} />} href="/timetable" linkLabel="Timetable" />
          {coverage && !coverage.teachingSynced && (
            <div className="mb-3">
              <Notice tone="neutral">
                Lectures and seminars aren&apos;t synced — only Moodle calendar events appear here.{" "}
                <Link href="/settings#timetable">Add your Tabula timetable feed</Link> or check{" "}
                <a href="https://tabula.warwick.ac.uk/profiles" target="_blank" rel="noopener noreferrer">Tabula</a>.
              </Notice>
            </div>
          )}
          {coverage?.feedError && (
            <div className="mb-3">
              <Notice tone="warn">Couldn&apos;t read your timetable feed: {coverage.feedError}</Notice>
            </div>
          )}
          {todayItems.length ? (
            <ul className="-mx-3">{todayItems.map((i) => <TimetableRow key={i.id} item={i} />)}</ul>
          ) : (
            <p className="py-3 text-sm text-muted">
              {coverage?.teachingSynced ? "Nothing scheduled today in your synced sources." : "No Moodle calendar events today."}
              {tomorrowItems.length > 0 && <> Tomorrow: {tomorrowItems.length} item{tomorrowItems.length === 1 ? "" : "s"}, starting with {tomorrowItems[0].title}.</>}
            </p>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="What to work on next" icon={<ListTodo size={17} />} href="/assessments" linkLabel="All" />
          {next.length ? (
            <ol className="flex flex-col gap-2">
              {next.map((p, i) => (
                <li key={p.assessment.key}>
                  <Link href={`/assessments/${p.assessment.key}`} className="flex min-h-12 gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5 hover:border-line-strong">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-semibold text-muted">{i + 1}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-fg">{p.assessment.title}</span>
                      <span className="mt-0.5 block text-xs text-subtle">
                        {p.assessment.moduleCode} · {p.reason}
                      </span>
                    </span>
                    {p.urgency === "overdue" && <Badge tone="danger" className="ml-auto self-start">Overdue</Badge>}
                    {p.urgency === "today" && <Badge tone="warn" className="ml-auto self-start">24h</Badge>}
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">
              {assessments.ok ? "No unfinished Moodle quizzes or assignments are due in the next three weeks." : "Couldn't load your assessments."}
            </p>
          )}
          <p className="mt-3 text-xs text-subtle">
            Ranked by official Moodle dates and your checklist progress. Coursework submitted through Tabula isn&apos;t included.
          </p>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader title="Upcoming deadlines & tests" icon={<ClipboardCheck size={17} />} href="/assessments" count={upcoming.length || undefined} />
          {upcoming.length ? (
            <ul className="-mx-3">{upcoming.map((a) => <AssessmentRow key={a.key} a={a} />)}</ul>
          ) : (
            <EmptyState title="Nothing upcoming on Moodle">Tabula coursework deadlines aren&apos;t synced — check <ExternalLink href="https://tabula.warwick.ac.uk/coursework" service="Tabula" className="text-accent underline">Tabula coursework</ExternalLink>.</EmptyState>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Recent notes" icon={<NotebookPen size={17} />} href="/notes" />
          {notes.ok && notes.data.length ? (
            <ul className="-mx-3">
              {notes.data.slice(0, 4).map((n) => (
                <li key={n.id}>
                  <Link href={`/notes/${n.id}`} className="flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 hover:bg-surface-2">
                    {n.origin === "ai" ? <Sparkles size={16} className="shrink-0 text-accent" aria-label="AI-generated" /> : <NotebookPen size={16} className="shrink-0 text-subtle" aria-hidden />}
                    <span className="min-w-0 flex-1 truncate text-sm text-fg">{n.title}</span>
                    <span className="shrink-0 text-xs text-subtle">{dayLabel(n.updatedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">
              No notes yet. <Link href="/notes/new" className="text-accent underline underline-offset-2">Write one</Link> or create a study guide from a module week.
            </p>
          )}
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader title="Recently added materials" icon={<FileText size={17} />} href="/materials" />
          {recent.length ? (
            <ul className="-mx-3">{recent.map((r) => <ResourceRow key={r.id} r={r} moduleCode={codeById.get(r.courseId)} />)}</ul>
          ) : (
            <p className="text-sm text-muted">{resources.ok ? "No dated materials found." : "Couldn't load materials."}</p>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Quick links" icon={<Link2 size={17} />} href="/links" linkLabel="Warwick links" />
          <div className="grid grid-cols-2 gap-2">
            {[
              { href: "/modules", label: "Modules", Icon: BookOpen },
              { href: "/study", label: "Study", Icon: Brain },
              { href: "/timetable", label: "Timetable", Icon: CalendarDays },
              { href: "/assessments", label: "Assessments", Icon: ClipboardCheck },
              { href: "/notes", label: "Notes", Icon: NotebookPen },
              { href: "/links", label: "Warwick", Icon: Link2 },
            ].map(({ href, label, Icon }) => (
              <Link key={href} href={href} className="flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 text-sm text-fg hover:border-line-strong">
                <Icon size={16} className="text-subtle" aria-hidden /> {label}
              </Link>
            ))}
          </div>
          {currentModules.length > 0 && (
            <>
              <h3 className="mb-2 mt-4 text-xs font-medium uppercase tracking-wide text-subtle">Your modules</h3>
              <ul className="flex flex-wrap gap-2">
                {currentModules.map((m) => (
                  <li key={m.id}>
                    <Link href={`/modules/${m.id}`} className="inline-flex min-h-10 items-center rounded-full border border-line px-3 text-sm text-muted hover:border-accent-line hover:text-fg">
                      {m.code}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          <h3 className="mb-2 mt-4 text-xs font-medium uppercase tracking-wide text-subtle">Warwick services</h3>
          <ul className="flex flex-col">
            {[
              ["Moodle", "https://moodle.warwick.ac.uk/"],
              ["Tabula", "https://tabula.warwick.ac.uk/"],
              ["My Warwick", "https://my.warwick.ac.uk/"],
              ["Library", "https://warwick.ac.uk/services/library/"],
            ].map(([label, url]) => (
              <li key={url}>
                <ExternalLink href={url} service={label} className="flex min-h-10 items-center rounded-lg px-1 text-sm text-muted hover:text-fg">
                  {label}
                </ExternalLink>
              </li>
            ))}
          </ul>
          <Link href="/links" className="mt-2 inline-flex min-h-10 items-center gap-1 text-sm text-accent">
            All Warwick links <ArrowRight size={14} aria-hidden />
          </Link>
        </Card>
      </div>
    </>
  );
}
