import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { attempt, getSource } from "@/lib/data/source";
import { allChecklists } from "@/lib/store/user-data";
import { AssessmentRow } from "@/components/rows";
import { Card, EmptyState, ExternalLink, Notice, PageHeader, ProblemState, cx } from "@/components/ui";
import { RefreshButton } from "@/components/client-bits";

export const dynamic = "force-dynamic";
export const metadata = { title: "Deadlines & tests" };

const STATUS = [
  { key: "open", label: "To do" },
  { key: "done", label: "Done" },
  { key: "past", label: "Closed" },
  { key: "all", label: "All" },
] as const;

export default async function AssessmentsPage({ searchParams }: { searchParams: Promise<{ status?: string; module?: string; kind?: string }> }) {
  const sp = await searchParams;
  const status = STATUS.find((s) => s.key === sp.status)?.key ?? "open";
  const source = await getSource();
  const [res, mods] = await Promise.all([attempt(() => source.assessments()), attempt(() => source.modules())]);
  const now = Date.now();
  const user = await source.userKey().catch(() => "anon");
  const items = res.ok ? res.data : [];
  const lists = await allChecklists(user, items.map((a) => a.key)).catch(() => new Map());

  const filtered = items
    .filter((a) => !sp.module || String(a.courseId) === sp.module)
    .filter((a) => !sp.kind || a.kind === sp.kind)
    .filter((a) => {
      const closed = !!a.dueAt && a.dueAt < now && (a.kind === "quiz" || (a.cutoffAt ?? a.dueAt) < now);
      if (status === "open") return !a.done && !closed;
      if (status === "done") return a.done;
      if (status === "past") return !a.done && closed;
      return true;
    })
    .sort((a, b) => (status === "past" ? (b.dueAt ?? 0) - (a.dueAt ?? 0) : (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity)));

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { status, module: sp.module, kind: sp.kind, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === "status" && v === "open")) p.set(k, v);
    const s = p.toString();
    return s ? `/assessments?${s}` : "/assessments";
  };

  return (
    <>
      <PageHeader title="Deadlines & tests" subtitle="Moodle assignments, quizzes and calendar actions, with official dates in UK time." actions={<RefreshButton />} />
      <div className="mb-5">
        <Notice title="Not everything is here">
          Only items on Moodle are shown. Many Warwick departments take coursework through{" "}
          <ExternalLink href="https://tabula.warwick.ac.uk/coursework" service="Tabula">Tabula</ExternalLink>, and exams are published centrally on the{" "}
          <ExternalLink href="https://warwick.ac.uk/services/academicoffice/examinations/" service="Warwick">exams pages</ExternalLink>. Neither is synced.
        </Notice>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div role="tablist" aria-label="Status" className="inline-flex w-fit rounded-xl border border-line bg-surface-2 p-1">
          {STATUS.map((s) => (
            <Link key={s.key} role="tab" aria-selected={status === s.key} href={qs({ status: s.key })} className={cx("inline-flex min-h-10 items-center rounded-lg px-3 text-sm", status === s.key ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg")}>
              {s.label}
            </Link>
          ))}
        </div>
        <form className="flex flex-wrap gap-2" action="/assessments">
          {status !== "open" && <input type="hidden" name="status" value={status} />}
          <label className="sr-only" htmlFor="f-module">Module</label>
          <select id="f-module" name="module" defaultValue={sp.module ?? ""} className="min-h-11 rounded-xl border border-line bg-surface-2 px-3 text-sm text-fg">
            <option value="">All modules</option>
            {(mods.ok ? mods.data : []).map((m) => <option key={m.id} value={m.id}>{m.code}</option>)}
          </select>
          <label className="sr-only" htmlFor="f-kind">Type</label>
          <select id="f-kind" name="kind" defaultValue={sp.kind ?? ""} className="min-h-11 rounded-xl border border-line bg-surface-2 px-3 text-sm text-fg">
            <option value="">All types</option>
            <option value="assignment">Assignments</option>
            <option value="quiz">Quizzes & tests</option>
            <option value="event">Other Moodle actions</option>
          </select>
          <button type="submit" className="min-h-11 rounded-xl border border-line px-3 text-sm text-muted hover:text-fg">Apply</button>
        </form>
      </div>

      {!res.ok && <ProblemState problem={res.problem} />}
      {res.ok && (
        <Card>
          {filtered.length ? (
            <ul className="-mx-3">
              {filtered.map((a) => {
                const l = lists.get(a.key);
                const steps = l ? `· ${l.items.filter((i: { done: boolean }) => i.done).length}/${l.items.length} steps` : null;
                return <AssessmentRow key={a.key} a={a} extra={steps && <span>{steps}</span>} />;
              })}
            </ul>
          ) : (
            <EmptyState icon={<ClipboardCheck size={28} />} title={status === "open" ? "Nothing to do on Moodle right now" : "Nothing here"}>
              {items.length === 0 ? "Moodle returned no assignments or quizzes for your modules." : "Try another filter."}
            </EmptyState>
          )}
        </Card>
      )}
    </>
  );
}
