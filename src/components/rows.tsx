import Link from "next/link";
import {
  BookMarked, CalendarClock, CheckCircle2, ClipboardCheck, File, FileText, FolderOpen,
  Link2, Lock, MessagesSquare, MonitorPlay, NotebookText, PenLine, Presentation, Puzzle, Users,
} from "lucide-react";
import { KIND_LABEL } from "@/lib/classify";
import type { Assessment, Resource, ResourceKind, TimetableItem } from "@/lib/data/model";
import { dayLabel, formatDateTime, formatTime, relativeTo } from "@/lib/time";
import { Badge, ExternalLink, cx } from "./ui";

export const KIND_ICON: Record<ResourceKind, typeof File> = {
  slides: Presentation,
  reading: BookMarked,
  recording: MonitorPlay,
  exercise: PenLine,
  seminar: Users,
  file: File,
  link: Link2,
  page: FileText,
  folder: FolderOpen,
  tool: Puzzle,
  forum: MessagesSquare,
  quiz: ClipboardCheck,
  assignment: NotebookText,
  other: File,
};

function fileMeta(r: Resource): string | null {
  if (r.modName === "page" || r.modName === "url") return null;
  const f = r.files[0];
  if (!f) return null;
  const ext = f.name.split(".").pop()?.toUpperCase();
  const size = f.size ? (f.size > 1_000_000 ? `${(f.size / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(f.size / 1000))} KB`) : null;
  return [ext && ext.length <= 5 ? ext : null, size, r.files.length > 1 ? `${r.files.length} files` : null].filter(Boolean).join(" · ");
}

export function ResourceRow({ r, moduleCode, showModule = true }: { r: Resource; moduleCode?: string; showModule?: boolean }) {
  const Icon = KIND_ICON[r.kind];
  const meta = fileMeta(r);
  const when = r.addedAt ?? r.updatedAt;
  return (
    <li id={`cm-${r.id}`} className="scroll-mt-24">
      <ExternalLink
        href={r.url}
        className={cx(
          "group flex min-h-14 items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-2",
          r.restricted && "opacity-70",
        )}
      >
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted group-hover:bg-surface-3" aria-hidden>
          {r.restricted ? <Lock size={17} /> : <Icon size={17} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.95rem] text-fg">{r.title}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-subtle">
            <span>{KIND_LABEL[r.kind]}</span>
            {showModule && moduleCode && <span>· {moduleCode}</span>}
            {r.week !== undefined && <span>· Week {r.week}</span>}
            {meta && <span>· {meta}</span>}
            {when && <span>· {r.addedAt ? "Added" : "Updated"} {dayLabel(when)}</span>}
            {r.restricted && <span className="text-warn">· {r.restricted}</span>}
          </span>
        </span>
      </ExternalLink>
    </li>
  );
}

export function dueTone(a: Assessment, now = Date.now()): "danger" | "warn" | "neutral" | "ok" {
  if (a.done) return "ok";
  if (!a.dueAt) return "neutral";
  const h = (a.dueAt - now) / 3_600_000;
  if (h < 0) return "danger";
  if (h < 72) return "warn";
  return "neutral";
}

export function AssessmentRow({ a, extra }: { a: Assessment; extra?: React.ReactNode }) {
  const now = Date.now();
  const tone = dueTone(a, now);
  const Icon = a.kind === "quiz" ? ClipboardCheck : a.kind === "assignment" ? NotebookText : CalendarClock;
  const notOpen = a.opensAt && a.opensAt > now;
  return (
    <li>
      <Link href={`/assessments/${a.key}`} className="flex min-h-14 items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-2">
        <span className={cx("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg", a.done ? "bg-ok-soft text-ok" : "bg-surface-2 text-muted")} aria-hidden>
          {a.done ? <CheckCircle2 size={17} /> : <Icon size={17} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.95rem] text-fg">{a.title}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-subtle">
            <span>{a.moduleCode}</span>
            <span>· {a.statusLabel}</span>
            {notOpen && <span>· Opens {formatDateTime(a.opensAt!)}</span>}
            {extra}
          </span>
        </span>
        <span className="shrink-0 text-right">
          {a.dueAt ? (
            <>
              <Badge tone={tone}>{a.done ? "Done" : relativeTo(a.dueAt, now)}</Badge>
              <span className="mt-1 block text-xs tabular-nums text-subtle">{dayLabel(a.dueAt, now)} {formatTime(a.dueAt)}</span>
            </>
          ) : (
            <Badge>No date on Moodle</Badge>
          )}
        </span>
      </Link>
    </li>
  );
}

const SOURCE_LABEL: Record<TimetableItem["source"], string> = {
  "moodle-calendar": "Moodle calendar",
  "timetable-feed": "Timetable feed",
  demo: "Sample",
};

export function TimetableRow({ item, showDate = false }: { item: TimetableItem; showDate?: boolean }) {
  const isDeadline = item.category === "deadline" || item.category === "opens";
  const body = (
    <>
      <span className="w-14 shrink-0 pt-0.5 text-sm tabular-nums text-muted">
        {item.allDay ? "All day" : formatTime(item.start)}
        {item.end && !item.allDay && <span className="block text-xs text-subtle">{formatTime(item.end)}</span>}
      </span>
      <span className={cx("w-1 self-stretch rounded-full", item.category === "teaching" ? "bg-accent" : isDeadline ? "bg-warn" : "bg-line-strong")} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block break-words text-[0.95rem] text-fg">{item.title}</span>
        <span className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-subtle">
          {item.sessionType && item.sessionType !== "other" && <span className={item.sessionType === "lecture" ? "text-accent" : "text-ok"}>{item.sessionType === "lecture" ? "Lecture" : "Seminar"}</span>}
          {showDate && <span>{dayLabel(item.start)}</span>}
          {item.location && <span>{item.location}</span>}
          {item.moduleCode && !item.title.includes(item.moduleCode) && <span>{item.moduleCode}</span>}
          <span>· {SOURCE_LABEL[item.source]}</span>
        </span>
      </span>
    </>
  );
  const cls = "flex min-h-14 items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-2";
  return (
    <li>
      {item.url ? (
        <ExternalLink href={item.url} className={cls}>
          {body}
        </ExternalLink>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}
