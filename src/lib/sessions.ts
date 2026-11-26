import type { ModuleDetail, Resource, Section } from "@/lib/data/model";

/**
 * Lectures and seminars, worked out from Moodle's own structure: each module
 * section ("unit"/"week") is split into a lecture group (slides, recordings,
 * readings, lecture notes) and a seminar group (seminar/tutorial/class
 * materials). Numbered items ("Lecture 3", "Seminar 4") become their own
 * sessions. Nothing is invented — a session only exists if Moodle has
 * materials for it.
 */
export interface Session {
  key: string;
  courseId: number;
  sectionId: number;
  sectionName: string;
  week?: number;
  kind: "lecture" | "seminar";
  label: string;
  resources: Resource[];
}

export interface Unit {
  section: Section;
  label: string;
  sessions: Session[];
  /** Materials that study sets can be generated from. */
  studyResources: Resource[];
}

const NON_UNIT = /^(general|module information|assessment( details)?|welcome.*|announcements?|support .*|contact.*)$/i;

function sessionKind(r: Resource): "lecture" | "seminar" | null {
  const t = r.title.toLowerCase();
  if (r.kind === "seminar" || /seminar|tutorial|support (and|&) feedback|\bclass(es)?\b|workshop/.test(t)) return "seminar";
  if (r.kind === "slides" || r.kind === "recording" || /lecture/.test(t)) return "lecture";
  return null;
}

function number(r: Resource): number | undefined {
  const m = /(lecture|seminar|class|tutorial|workshop)\s*(\d{1,2})\b/i.exec(r.title);
  return m ? Number(m[2]) : undefined;
}

export function unitLabel(s: Section): string {
  return s.name;
}

export function unitsFor(mod: ModuleDetail): Unit[] {
  const units: Unit[] = [];
  for (const section of mod.sections) {
    const visible = section.resources.filter((r) => !r.restricted);
    const groups = new Map<string, Session>();
    const readings: Resource[] = [];
    for (const r of visible) {
      const kind = sessionKind(r);
      if (!kind) {
        if (r.kind === "reading") readings.push(r);
        continue;
      }
      const n = number(r);
      const key = `${section.id}-${kind}-${n ?? 0}`;
      if (!groups.has(key))
        groups.set(key, {
          key,
          courseId: mod.id,
          sectionId: section.id,
          sectionName: section.name,
          week: section.week,
          kind,
          label: `${kind === "lecture" ? "Lecture" : "Seminar"}${n ? ` ${n}` : ""}`,
          resources: [],
        });
      groups.get(key)!.resources.push(r);
    }
    const sessions = [...groups.values()].sort((a, b) => (a.kind === b.kind ? a.label.localeCompare(b.label, "en", { numeric: true }) : a.kind === "lecture" ? -1 : 1));
    // Readings belong with the unit's (first) lecture when there is one.
    const firstLecture = sessions.find((s) => s.kind === "lecture");
    if (firstLecture) firstLecture.resources.push(...readings);
    const studyResources = visible.filter((r) => ["slides", "reading", "exercise", "seminar", "page", "file"].includes(r.kind));
    if (!sessions.length && (NON_UNIT.test(section.name.trim()) || !studyResources.length)) continue;
    if (NON_UNIT.test(section.name.trim()) && !sessions.length) continue;
    units.push({ section, label: unitLabel(section), sessions, studyResources });
  }
  return units;
}
