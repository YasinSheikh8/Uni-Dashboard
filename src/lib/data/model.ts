/**
 * The product's own data model. Moodle (live) and the demo fixture both map
 * into these shapes, so pages never touch raw Moodle responses.
 */

export type DataMode = "live" | "demo";

export interface SourceInfo {
  mode: DataMode;
  siteName: string;
  siteUrl: string;
  /** Display name of the signed-in Moodle user (live only). */
  userName?: string;
  fetchedAt: number;
}

export interface Module {
  id: number;
  code: string;
  shortName: string;
  fullName: string;
  url: string;
  startDate?: number;
  endDate?: number;
  lastAccess?: number;
  /** Moodle completion percentage, only when Moodle tracks it. */
  progress?: number;
  summaryHtml?: string;
}

export type ResourceKind =
  | "slides"
  | "reading"
  | "recording"
  | "exercise"
  | "seminar"
  | "file"
  | "link"
  | "page"
  | "folder"
  | "tool"
  | "forum"
  | "quiz"
  | "assignment"
  | "other";

export interface FileRef {
  name: string;
  mimeType?: string;
  size?: number;
  /** Server-side Moodle download URL. Never sent to the browser. */
  serverUrl?: string;
  timeCreated?: number;
  timeModified?: number;
}

export interface Resource {
  /** Moodle course-module id (cmid). */
  id: number;
  courseId: number;
  sectionId: number;
  sectionName: string;
  sectionNumber: number;
  title: string;
  kind: ResourceKind;
  /** Moodle activity type, e.g. "resource", "url", "lti". */
  modName: string;
  /** Direct link to the item on Moodle (opens with the user's own Moodle session). */
  url: string;
  week?: number;
  term?: number;
  topic?: string;
  /** When the file was first added, if Moodle reports it. */
  addedAt?: number;
  updatedAt?: number;
  /** Not yet visible to students (Moodle restriction), with Moodle's explanation. */
  restricted?: string;
  files: FileRef[];
  descriptionHtml?: string;
}

export interface Section {
  id: number;
  number: number;
  name: string;
  summaryHtml?: string;
  week?: number;
  term?: number;
  topic?: string;
  resources: Resource[];
}

export interface ModuleDetail extends Module {
  sections: Section[];
}

export type AssessmentKind = "assignment" | "quiz" | "event";
export type AssessmentStatus =
  | "submitted"
  | "draft"
  | "not-submitted"
  | "attempted"
  | "not-attempted"
  | "graded"
  | "unknown";

export interface Assessment {
  /** Stable key: "assign-<id>", "quiz-<id>" or "event-<id>". */
  key: string;
  kind: AssessmentKind;
  courseId: number;
  moduleCode: string;
  title: string;
  /** Link to the original Moodle page. */
  url: string;
  cmid?: number;
  /** Official dates from Moodle (UTC ms). Undefined means Moodle did not provide one. */
  dueAt?: number;
  opensAt?: number;
  closesAt?: number;
  cutoffAt?: number;
  timeLimitSeconds?: number;
  attemptsAllowed?: number;
  status: AssessmentStatus;
  statusLabel: string;
  /** True when we know the work is finished (submitted / attempt finished). */
  done: boolean;
  /** The brief exactly as Moodle provides it (sanitised HTML). */
  briefHtml?: string;
  attachments: FileRef[];
  /** Facts read from Moodle settings — never inferred. */
  officialFacts: { label: string; value: string }[];
  /** Things the student needs that Moodle did not provide. */
  missing: string[];
  sourceLabel: string;
}

export interface TimetableItem {
  id: string;
  title: string;
  start: number;
  end?: number;
  allDay?: boolean;
  location?: string;
  description?: string;
  moduleCode?: string;
  courseId?: number;
  url?: string;
  /** Where the item came from — always shown in the UI. */
  source: "moodle-calendar" | "timetable-feed" | "demo";
  /** For teaching sessions: lecture / seminar, read from the timetable title. */
  sessionType?: "lecture" | "seminar" | "other";
  category: "teaching" | "deadline" | "opens" | "event";
}

export interface TimetableCoverage {
  teachingSynced: boolean;
  feedLabel?: string;
  feedError?: string;
  feedFetchedAt?: number;
}
