import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Paperclip } from "lucide-react";
import { aiConfigured } from "@/lib/ai/generate";
import { attempt, getSource } from "@/lib/data/source";
import { genericChecklist, getChecklist } from "@/lib/store/user-data";
import { formatDateLong, formatTime, relativeTo } from "@/lib/time";
import { dueTone } from "@/components/rows";
import { AiTag, Badge, ButtonLink, Card, ExternalLink, Notice, OfficialTag, ProblemState } from "@/components/ui";
import { AssessmentChecklist } from "@/components/study-actions";

export const dynamic = "force-dynamic";

function When({ label, ms }: { label: string; ms?: number }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3">
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="mt-0.5 text-sm text-fg">
        {ms ? (
          <>
            {formatDateLong(ms)} at <span className="tabular-nums">{formatTime(ms)}</span>
            <span className="block text-xs text-subtle">{relativeTo(ms)} · UK time</span>
          </>
        ) : (
          <span className="text-muted">Not set on Moodle</span>
        )}
      </dd>
    </div>
  );
}

export default async function AssessmentPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const source = await getSource();
  const res = await attempt(() => source.assessments());
  if (!res.ok) return <ProblemState problem={res.problem} />;
  const a = res.data.find((x) => x.key === key);
  if (!a) notFound();
  const user = await source.userKey();
  const checklist = (await getChecklist(user, a.key).catch(() => null)) ?? { items: genericChecklist(a.kind), updatedAt: 0 };
  const tone = dueTone(a);

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-subtle">
        <Link href="/assessments" className="hover:text-fg">Deadlines & tests</Link> <span aria-hidden>/</span>{" "}
        <Link href={`/modules/${a.courseId}?tab=assessments`} className="hover:text-fg">{a.moduleCode}</Link>
      </nav>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone="accent">{a.kind === "quiz" ? "Quiz / test" : a.kind === "assignment" ? "Assignment" : "Moodle action"}</Badge>
            <Badge tone={tone}>{a.statusLabel}</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">{a.title}</h1>
          <p className="mt-1 text-sm text-muted">{a.moduleCode}</p>
        </div>
        <ButtonLink href={a.url} external variant="primary">Open on Moodle</ButtonLink>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="flex flex-col gap-4 lg:col-span-3">
          <Card>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-semibold">Official details</h2>
              <OfficialTag label={`Official · ${a.sourceLabel}`} />
            </div>
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {a.kind === "quiz" ? (
                <>
                  <When label="Opens" ms={a.opensAt} />
                  <When label="Closes" ms={a.closesAt} />
                </>
              ) : (
                <>
                  <When label="Due" ms={a.dueAt} />
                  {a.cutoffAt ? <When label="Final cut-off (late submissions)" ms={a.cutoffAt} /> : a.opensAt ? <When label="Submissions open" ms={a.opensAt} /> : null}
                </>
              )}
              {a.officialFacts.map((f) => (
                <div key={f.label} className="rounded-xl border border-line bg-surface-2 p-3">
                  <dt className="text-xs text-subtle">{f.label}</dt>
                  <dd className="mt-0.5 text-sm text-fg">{f.value}</dd>
                </div>
              ))}
            </dl>

            <h3 className="mb-2 mt-5 text-sm font-semibold">Brief from Moodle</h3>
            {a.briefHtml ? (
              <div className="prose-w1 rounded-xl border border-line p-4 text-sm" dangerouslySetInnerHTML={{ __html: a.briefHtml }} />
            ) : (
              <p className="text-sm text-muted">
                Moodle has no description for this activity. The instructions may be in a file or another section — <ExternalLink href={a.url} className="text-accent underline">open it on Moodle</ExternalLink>.
              </p>
            )}
            {a.attachments.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1">
                {a.attachments.map((f) => (
                  <li key={f.name} className="flex items-center gap-2 text-sm text-muted">
                    <Paperclip size={14} aria-hidden /> {f.name} <span className="text-xs text-subtle">(attached on Moodle)</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {a.missing.length > 0 && (
            <Card>
              <h2 className="mb-2 flex items-center gap-2 font-semibold">
                <AlertTriangle size={17} className="text-warn" aria-hidden /> Not available from Moodle
              </h2>
              <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted">
                {a.missing.map((m) => <li key={m}>{m}</li>)}
              </ul>
              <p className="mt-3 text-sm text-subtle">
                Don&apos;t rely on guesses for these. Ask your module leader or check the <ExternalLink href={a.url} className="text-accent underline">Moodle page</ExternalLink>.
              </p>
            </Card>
          )}
        </div>

        <Card className="lg:col-span-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h2 className="font-semibold">Your action plan</h2>
            <AiTag label={checklist.aiGeneratedAt ? "AI suggestions" : "Suggested steps"} />
          </div>
          <p className="mb-4 text-xs text-subtle">
            Suggestions to help you plan — not instructions from your lecturer. Tick steps off as you go; your progress is saved.
          </p>
          <AssessmentChecklist assessmentKey={a.key} initial={checklist} aiAvailable={aiConfigured()} hasBrief={!!a.briefHtml} />
        </Card>
      </div>
      {source.mode === "demo" && (
        <div className="mt-6">
          <Notice tone="warn">This is a sample assessment. Its dates and brief are made up.</Notice>
        </div>
      )}
    </>
  );
}
