import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronDown, NotebookPen, Plus } from "lucide-react";
import { KIND_LABEL, MATERIAL_KINDS } from "@/lib/classify";
import type { ResourceKind } from "@/lib/data/model";
import { attempt, getSource } from "@/lib/data/source";
import { aiConfigured } from "@/lib/ai/generate";
import { listNotes } from "@/lib/store/user-data";
import { AssessmentRow, ResourceRow } from "@/components/rows";
import { AiTag, Badge, ButtonLink, Card, EmptyState, ExternalLink, Notice, ProblemState, cx } from "@/components/ui";
import { GenerateGuideButton } from "@/components/study-actions";
import { ModuleVisibilityButton } from "@/components/module-visibility";
import { dayLabel, formatDateTime, londonDateKey, weekStartKey, formatShortDayKey } from "@/lib/time";
import { createHash } from "node:crypto";
import { unitsFor, type Unit } from "@/lib/sessions";
import { getTimetable } from "@/lib/timetable/source";
import { dueCount, getStudyProgress, getStudySet, type Note } from "@/lib/store/user-data";
import type { ModuleDetail } from "@/lib/data/model";
import { KIND_LABEL as KL } from "@/lib/classify";
import { SessionNoteCard, type SessionView } from "@/components/revision";
import { Layers, Brain, CalendarDays } from "lucide-react";

export const dynamic = "force-dynamic";

type Tab = "materials" | "revision" | "study" | "assessments" | "notes";
const TABS: Tab[] = ["materials", "revision", "study", "assessments", "notes"];

export default async function ModulePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; type?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "materials";
  const type = MATERIAL_KINDS.includes(sp.type as ResourceKind) ? (sp.type as ResourceKind) : undefined;
  const source = await getSource();
  const res = await attempt(() => source.module(Number(id)));
  if (!res.ok) return <ProblemState problem={res.problem} />;
  const mod = res.data;
  if (!mod) notFound();

  const [assess, notes] = await Promise.all([
    attempt(async () => (await source.assessments()).filter((a) => a.courseId === mod.id)),
    attempt(async () => (await listNotes(await source.userKey())).filter((n) => n.courseId === mod.id)),
  ]);
  const allResources = mod.sections.flatMap((s) => s.resources);
  const kindsPresent = MATERIAL_KINDS.filter((k) => allResources.some((r) => r.kind === k));
  const recordings = allResources.filter((r) => r.kind === "recording").length;
  const ai = aiConfigured();
  const units = unitsFor(mod);
  const isHidden = (await source.hiddenIds()).has(mod.id);
  const user = await source.userKey();
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "materials", label: "Materials", count: allResources.filter((r) => MATERIAL_KINDS.includes(r.kind)).length },
    { key: "revision", label: "Revision notes" },
    { key: "study", label: "Study", count: units.length },
    { key: "assessments", label: "Assessments", count: assess.ok ? assess.data.length : undefined },
    { key: "notes", label: "Notes", count: notes.ok ? notes.data.length : undefined },
  ];

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-subtle">
        <Link href="/modules" className="hover:text-fg">Modules</Link> <span aria-hidden>/</span> <span className="text-muted">{mod.code}</span>
      </nav>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="rounded-md bg-accent-soft px-2 py-0.5 text-xs font-semibold tracking-wide text-accent">{mod.code}</span>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-[1.75rem]">{mod.fullName}</h1>
        </div>
        <div className="flex items-center gap-2">
          <ModuleVisibilityButton courseId={mod.id} code={mod.code} hidden={isHidden} />
          <ButtonLink href={mod.url} external>Open on Moodle</ButtonLink>
        </div>
      </header>

      {isHidden && (
        <div className="mb-4">
          <Notice tone="warn">This module is hidden, so it doesn&apos;t appear on Home, Study, Materials, Deadlines, Timetable or in automatic notes.</Notice>
        </div>
      )}
      <div role="tablist" aria-label="Module sections" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((t) => (
          <Link
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            href={`/modules/${mod.id}?tab=${t.key}`}
            className={cx("-mb-px flex min-h-11 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm font-medium", tab === t.key ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg")}
          >
            {t.label}
            {t.count !== undefined && <span className="text-xs text-subtle">{t.count}</span>}
          </Link>
        ))}
      </div>

      {tab === "materials" && (
        <>
          {kindsPresent.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-2" aria-label="Filter by type">
              <FilterChip href={`/modules/${mod.id}`} active={!type}>All</FilterChip>
              {kindsPresent.map((k) => (
                <FilterChip key={k} href={`/modules/${mod.id}?type=${k}`} active={type === k}>{KIND_LABEL[k]}</FilterChip>
              ))}
            </div>
          )}
          {type === "recording" && (
            <div className="mb-4">
              <Notice>Recordings are listed only when Moodle names them as videos or lecture capture. Some may sit inside external tools — check the module on Moodle.</Notice>
            </div>
          )}
          {type !== "recording" && !type && recordings === 0 && (
            <p className="mb-4 text-sm text-subtle">No lecture recordings were found in this module&apos;s Moodle page.</p>
          )}
          <div className="flex flex-col gap-3">
            {mod.sections.map((s) => {
              const items = s.resources.filter((r) => MATERIAL_KINDS.includes(r.kind) && (!type || r.kind === type));
              const activities = s.resources.filter((r) => !MATERIAL_KINDS.includes(r.kind));
              if (!items.length && !(s.summaryHtml && !type)) return null;
              const newNote = `/notes/new?course=${mod.id}${s.week !== undefined ? `&week=${s.week}` : ""}&topic=${encodeURIComponent(s.topic ?? s.name)}`;
              return (
                <details key={s.id} open className="group rounded-2xl border border-line bg-surface shadow-card">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 sm:px-5">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-fg">{s.name}</span>
                      <span className="text-xs text-subtle">
                        {items.length} item{items.length === 1 ? "" : "s"}
                        {activities.length > 0 && ` · ${activities.length} activit${activities.length === 1 ? "y" : "ies"}`}
                      </span>
                    </span>
                    <ChevronDown size={18} className="shrink-0 text-subtle transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <div className="border-t border-line px-2 pb-3 pt-2 sm:px-3">
                    {s.summaryHtml && !type && <div className="prose-w1 px-3 pb-2 text-sm" dangerouslySetInnerHTML={{ __html: s.summaryHtml }} />}
                    {items.length > 0 && <ul>{items.map((r) => <ResourceRow key={r.id} r={r} showModule={false} />)}</ul>}
                    <div className="mt-2 flex flex-wrap gap-2 px-3">
                      <Link href={newNote} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted hover:bg-surface-2 hover:text-fg">
                        <Plus size={15} aria-hidden /> Add note
                      </Link>
                      {ai && <GenerateGuideButton courseId={mod.id} sectionId={s.id} />}
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
          {!ai && (
            <p className="mt-4 text-sm text-subtle">
              AI study guides are off. Add an AI_API_KEY on the server to generate notes from this module&apos;s PDFs and pages (see <Link href="/settings" className="underline">Settings</Link>).
            </p>
          )}
        </>
      )}

      {tab === "revision" && <RevisionTab mod={mod} units={units} user={user} ai={ai} />}
      {tab === "study" && <StudyTab mod={mod} units={units} user={user} />}

      {tab === "assessments" && (
        <Card>
          {!assess.ok ? (
            <ProblemState problem={assess.problem} />
          ) : assess.data.length ? (
            <ul className="-mx-3">{[...assess.data].sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity)).map((a) => <AssessmentRow key={a.key} a={a} />)}</ul>
          ) : (
            <EmptyState title="No Moodle quizzes or assignments in this module">
              Coursework for many Warwick modules is submitted through Tabula, which isn&apos;t synced. Check the module&apos;s assessment section on{" "}
              <ExternalLink href={mod.url} className="text-accent underline">Moodle</ExternalLink> and{" "}
              <ExternalLink href="https://tabula.warwick.ac.uk/coursework" service="Tabula" className="text-accent underline">Tabula coursework</ExternalLink>.
            </EmptyState>
          )}
        </Card>
      )}

      {tab === "notes" && (
        <Card>
          <div className="mb-3 flex justify-end">
            <ButtonLink href={`/notes/new?course=${mod.id}`} variant="primary"><Plus size={16} aria-hidden /> New note</ButtonLink>
          </div>
          {notes.ok && notes.data.length ? (
            <ul className="-mx-3">
              {notes.data.map((n) => (
                <li key={n.id}>
                  <Link href={`/notes/${n.id}`} className="flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 hover:bg-surface-2">
                    <NotebookPen size={16} className="shrink-0 text-subtle" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-fg">{n.title}</span>
                      <span className="text-xs text-subtle">{[n.week !== undefined && n.week !== null ? `Week ${n.week}` : null, n.topic].filter(Boolean).join(" · ") || "No week or topic"}</span>
                    </span>
                    {n.origin === "ai" && <AiTag />}
                    <span className="text-xs text-subtle">{dayLabel(n.updatedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No notes for this module yet" />
          )}
        </Card>
      )}
    </>
  );
}

function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={active ? "true" : undefined} className={cx("inline-flex min-h-9 items-center rounded-full border px-3 text-sm", active ? "border-accent-line bg-accent-soft text-accent" : "border-line text-muted hover:text-fg")}>
      {children}
    </Link>
  );
}

function noteView(n: Note | undefined): SessionView["note"] {
  return n ? { id: n.id, body: n.body, origin: n.origin, editedByUser: n.editedByUser, updatedAt: n.updatedAt } : null;
}

async function RevisionTab({ mod, units, user, ai }: { mod: ModuleDetail; units: Unit[]; user: string; ai: boolean }) {
  const source = await getSource();
  const now = Date.now();
  const [tt, notes] = await Promise.all([
    attempt(() => getTimetable(source, now - 140 * 86400000, now + 86400000)),
    listNotes(user).catch(() => [] as Note[]),
  ]);
  const byKey = new Map(notes.filter((n) => n.sessionKey).map((n) => [n.sessionKey!, n]));
  const timetabled = (tt.ok ? tt.data.items : []).filter((i) => i.courseId === mod.id && i.category === "teaching" && i.sessionType !== "other");
  const weeks = new Map<string, typeof timetabled>();
  for (const i of timetabled) {
    const wk = weekStartKey(londonDateKey(i.start));
    if (!weeks.has(wk)) weeks.set(wk, []);
    weeks.get(wk)!.push(i);
  }
  const ttKey = (id: string) => `tt-${createHash("sha1").update(id).digest("hex").slice(0, 20)}`;
  const synced = tt.ok && tt.data.coverage.teachingSynced;

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="rev-tt">
        <div className="mb-3 flex items-center gap-2">
          <CalendarDays size={18} className="text-accent" aria-hidden />
          <h2 id="rev-tt" className="font-semibold">Every lecture & seminar you&apos;ve had</h2>
        </div>
        {!synced ? (
          <Notice>Connect your Tabula timetable feed in <Link href="/settings#timetable">Settings</Link> to get a notes slot for every lecture and seminar.</Notice>
        ) : !timetabled.length ? (
          <EmptyState title="No timetabled sessions for this module yet" />
        ) : (
          <div className="flex flex-col gap-6">
            {[...weeks.entries()].reverse().map(([wk, list]) => (
              <div key={wk}>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-subtle">Week of {formatShortDayKey(wk)}</h3>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {list.map((i) => {
                    const key = ttKey(i.id);
                    const label = `${i.sessionType === "lecture" ? "Lecture" : "Seminar"} · ${formatDateTime(i.start)}${i.location ? ` · ${i.location}` : ""}`;
                    return (
                      <SessionNoteCard
                        key={key}
                        aiAvailable={false}
                        s={{ key, label, kind: i.sessionType === "lecture" ? "lecture" : "seminar", courseId: mod.id, sectionName: `Week of ${formatShortDayKey(wk)}`, moduleCode: mod.code, materials: [], note: noteView(byKey.get(key)) }}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="rev-units">
        <div className="mb-1 flex items-center gap-2">
          <Layers size={18} className="text-accent" aria-hidden />
          <h2 id="rev-units" className="font-semibold">By unit, from Moodle materials</h2>
        </div>
        <p className="mb-3 text-sm text-subtle">
          Lectures and seminars as Moodle organises them, each with its slides and handouts.{ai ? " Generate concise AI notes from the PDFs, or write your own." : " Write your own concise notes for each."}
        </p>
        {!units.some((u) => u.sessions.length) ? (
          <EmptyState title="Moodle doesn't group this module's materials into lectures or seminars" />
        ) : (
          <div className="flex flex-col gap-6">
            {units.filter((u) => u.sessions.length).map((u) => (
              <div key={u.section.id}>
                <h3 className="mb-2 text-sm font-semibold text-muted">{u.label}</h3>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {u.sessions.map((sn) => (
                    <SessionNoteCard
                      key={sn.key}
                      aiAvailable={ai}
                      s={{ key: sn.key, label: sn.label, kind: sn.kind, courseId: mod.id, week: sn.week, sectionName: sn.sectionName, moduleCode: mod.code, materials: sn.resources.map((r) => ({ title: r.title, url: r.url, kind: KL[r.kind] })), note: noteView(byKey.get(sn.key)) }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

async function StudyTab({ mod, units, user }: { mod: ModuleDetail; units: Unit[]; user: string }) {
  const stats = await Promise.all(
    units.map(async (u) => {
      const [set, prog] = await Promise.all([getStudySet(user, mod.id, u.section.id).catch(() => null), getStudyProgress(user, mod.id, u.section.id).catch(() => ({ cards: {}, quizRuns: [] }))]);
      const best = prog.quizRuns.reduce((b, r) => Math.max(b, Math.round((r.score / r.total) * 100)), -1);
      return { u, cards: set?.cards.length ?? 0, quiz: set?.quiz.length ?? 0, due: dueCount(set, prog), best };
    }),
  );
  if (!units.length) return <EmptyState title="No study units found in this module on Moodle" />;
  return (
    <>
      <p className="mb-4 text-sm text-subtle">Flashcards and quizzes for each unit. Make them with AI from the unit&apos;s Moodle materials, or write your own.</p>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map(({ u, cards, quiz, due, best }) => (
          <li key={u.section.id}>
            <Link href={`/modules/${mod.id}/study/${u.section.id}`} className="tilt-card group relative flex h-full min-h-36 flex-col overflow-hidden rounded-2xl border border-line bg-surface p-4">
              <span className="deck-stack" aria-hidden><span /><span /><span /></span>
              <span className="relative text-xs font-medium uppercase tracking-wide text-subtle">{u.section.week !== undefined ? `Week ${u.section.week}` : "Unit"}</span>
              <span className="relative mt-1 font-medium leading-snug text-fg">{u.label}</span>
              <span className="relative mt-auto flex flex-wrap gap-2 pt-4 text-xs">
                <Badge tone={cards ? "accent" : "neutral"}><Brain size={12} aria-hidden /> {cards ? `${cards} cards` : "No cards yet"}</Badge>
                {quiz > 0 && <Badge>{quiz} quiz questions</Badge>}
                {due > 0 && <Badge tone="warn">{due} to review</Badge>}
                {best >= 0 && <Badge tone="ok">Best {best}%</Badge>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
