import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TimetableItem } from "@/lib/data/model";
import { attempt, getSource } from "@/lib/data/source";
import { getTimetable } from "@/lib/timetable/source";
import { addDaysToKey, formatDayKey, formatShortDayKey, formatTime, londonDateKey, londonDayRange, parseDateKey, weekStartKey } from "@/lib/time";
import { TimetableRow } from "@/components/rows";
import { Card, EmptyState, ExternalLink, Notice, PageHeader, ProblemState, cx } from "@/components/ui";
import { RefreshButton } from "@/components/client-bits";

export const dynamic = "force-dynamic";
export const metadata = { title: "Timetable" };

type View = "day" | "week" | "agenda";

export default async function TimetablePage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const sp = await searchParams;
  const view: View = sp.view === "day" || sp.view === "agenda" ? sp.view : "week";
  const today = londonDateKey(Date.now());
  const date = sp.date && parseDateKey(sp.date) ? sp.date : today;

  const startKey = view === "day" ? date : view === "week" ? weekStartKey(date) : date;
  const days = view === "day" ? 1 : view === "week" ? 7 : 14;
  const keys = Array.from({ length: days }, (_, i) => addDaysToKey(startKey, i));
  const from = londonDayRange(keys[0]).start;
  const to = londonDayRange(keys[keys.length - 1]).end;

  const source = await getSource();
  const res = await attempt(() => getTimetable(source, from, to));
  const items = res.ok ? res.data.items : [];
  const coverage = res.ok ? res.data.coverage : undefined;
  const byDay = new Map<string, TimetableItem[]>(keys.map((k) => [k, []]));
  for (const it of items) byDay.get(londonDateKey(it.start))?.push(it);

  const step = view === "day" ? 1 : view === "week" ? 7 : 14;
  const href = (v: View, d: string) => `/timetable?view=${v}&date=${d}`;
  const rangeLabel =
    view === "day" ? formatDayKey(date) : `${formatShortDayKey(keys[0])} – ${formatShortDayKey(keys[keys.length - 1])}`;

  return (
    <>
      <PageHeader title="Timetable" subtitle="All times are UK time (Europe/London)." actions={<RefreshButton />} />

      <div className="mb-4 flex flex-col gap-3">
        {coverage && !coverage.teachingSynced && (
          <Notice tone="warn" title="Your lectures and seminars aren't synced">
            Warwick publishes teaching timetables through Tabula, not Moodle, so this view only shows Moodle calendar events (quiz opening and closing times, deadlines).{" "}
            <Link href="/settings#timetable">Add your Tabula calendar feed</Link> to bring them in, or view your timetable on{" "}
            <ExternalLink href="https://tabula.warwick.ac.uk/profiles" service="Tabula">Tabula</ExternalLink>.
          </Notice>
        )}
        {coverage?.teachingSynced && (
          <Notice>
            Showing events from {source.mode === "live" ? `your ${coverage.feedLabel ?? "timetable feed"} and the Moodle calendar` : "the sample timetable"}.{" "}
            {coverage.feedFetchedAt && <>Feed last read at {formatTime(coverage.feedFetchedAt)}. </>}
            Room changes and one-off sessions only appear once the source has them — <ExternalLink href="https://tabula.warwick.ac.uk/profiles" service="Tabula">Tabula</ExternalLink> is the official timetable.
          </Notice>
        )}
        {coverage?.feedError && <Notice tone="danger" title="Couldn't read your timetable feed">{coverage.feedError}</Notice>}
        {res.ok && res.data.moodleError && <Notice tone="warn">The Moodle calendar couldn&apos;t be loaded: {res.data.moodleError}</Notice>}
        {!res.ok && <ProblemState problem={res.problem} />}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="View" className="inline-flex rounded-xl border border-line bg-surface-2 p-1">
          {(["day", "week", "agenda"] as View[]).map((v) => (
            <Link key={v} role="tab" aria-selected={view === v} href={href(v, date)} className={cx("inline-flex min-h-10 items-center rounded-lg px-3 text-sm capitalize", view === v ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg")}>
              {v}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Link href={href(view, addDaysToKey(date, -step))} className="flex size-11 items-center justify-center rounded-xl border border-line text-muted hover:text-fg" aria-label="Previous">
            <ChevronLeft size={18} aria-hidden />
          </Link>
          <Link href={href(view, today)} className="flex min-h-11 items-center rounded-xl border border-line px-3 text-sm text-muted hover:text-fg">Today</Link>
          <Link href={href(view, addDaysToKey(date, step))} className="flex size-11 items-center justify-center rounded-xl border border-line text-muted hover:text-fg" aria-label="Next">
            <ChevronRight size={18} aria-hidden />
          </Link>
        </div>
      </div>
      <h2 className="mb-3 text-sm font-medium text-muted" aria-live="polite">{rangeLabel}</h2>

      {view === "week" ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-7 md:gap-2">
          {keys.map((k) => {
            const list = byDay.get(k)!;
            return (
              <section key={k} aria-label={formatDayKey(k)} className={cx("rounded-2xl border bg-surface p-3 md:min-h-48 md:p-2", k === today ? "border-accent-line" : "border-line")}>
                <h3 className={cx("mb-2 px-1 text-sm font-medium", k === today ? "text-accent" : "text-fg")}>{formatShortDayKey(k)}</h3>
                {list.length ? (
                  <ul className="flex flex-col gap-1.5">
                    {list.map((it) => (
                      <li key={it.id}>
                        <WeekChip it={it} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-1 text-xs text-subtle">Nothing synced</p>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {keys.map((k) => {
            const list = byDay.get(k)!;
            if (view === "agenda" && !list.length) return null;
            return (
              <Card key={k}>
                <h3 className={cx("mb-1 text-sm font-semibold", k === today && "text-accent")}>{formatDayKey(k)}</h3>
                {list.length ? <ul className="-mx-3">{list.map((it) => <TimetableRow key={it.id} item={it} />)}</ul> : <p className="py-2 text-sm text-subtle">Nothing in your synced sources.</p>}
              </Card>
            );
          })}
          {view === "agenda" && items.length === 0 && <EmptyState title="Nothing in the next 14 days">Nothing from your synced sources falls in this range.</EmptyState>}
        </div>
      )}
      <p className="mt-6 flex flex-wrap gap-4 text-xs text-subtle">
        <span className="flex items-center gap-1.5"><span className="h-3 w-1 rounded-full bg-accent" aria-hidden /> Teaching (timetable feed)</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-1 rounded-full bg-warn" aria-hidden /> Moodle deadline or opening</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-1 rounded-full bg-line-strong" aria-hidden /> Other calendar event</span>
      </p>
    </>
  );
}

function WeekChip({ it }: { it: TimetableItem }) {
  const color = it.category === "teaching" ? "border-l-accent" : it.category === "event" ? "border-l-line-strong" : "border-l-warn";
  const inner = (
    <>
      <span className="block text-xs tabular-nums text-subtle">{it.allDay ? "All day" : formatTime(it.start)}{it.end && !it.allDay ? `–${formatTime(it.end)}` : ""}</span>
      <span className="block text-[0.8rem] leading-snug text-fg">{it.title}</span>
      {it.location && <span className="block truncate text-xs text-subtle">{it.location}</span>}
    </>
  );
  const cls = cx("block min-h-11 rounded-lg border border-line border-l-[3px] bg-surface-2 px-2 py-1.5 hover:bg-surface-3", color);
  return it.url ? (
    it.url.startsWith("/") ? <Link href={it.url} className={cls}>{inner}</Link> : <a href={it.url} target="_blank" rel="noopener noreferrer" className={cls}>{inner}<span className="sr-only"> (opens in a new tab)</span></a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
