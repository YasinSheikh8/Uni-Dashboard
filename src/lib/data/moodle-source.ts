import "server-only";
import { moodleCall, moodleConfig, moodleDownload } from "@/lib/moodle/client";
import { classifyResource, decodeEntities, htmlToText, parseSectionName, sanitizeHtml } from "@/lib/classify";
import type {
  Assessment,
  FileRef,
  Module,
  ModuleDetail,
  Resource,
  Section,
  SourceInfo,
  TimetableItem,
} from "./model";
import type { StudySource } from "./source";

// ---- Raw Moodle shapes (only the fields we read) ----------------------------
interface RawSiteInfo {
  sitename: string;
  siteurl: string;
  userid: number;
  fullname: string;
  firstname?: string;
}
interface RawCourse {
  id: number;
  shortname: string;
  fullname: string;
  displayname?: string;
  summary?: string;
  startdate?: number;
  enddate?: number;
  lastaccess?: number | null;
  progress?: number | null;
  hidden?: boolean;
  visible?: number;
}
interface RawContent {
  type: string;
  filename: string;
  fileurl?: string;
  filesize?: number;
  mimetype?: string;
  timecreated?: number;
  timemodified?: number;
}
interface RawModule {
  id: number;
  name: string;
  modname: string;
  url?: string;
  instance?: number;
  uservisible?: boolean;
  visible?: number;
  availabilityinfo?: string;
  description?: string;
  contents?: RawContent[];
  contentsinfo?: { lastmodified?: number; mimetypes?: string[] };
  dates?: { label: string; timestamp: number; dataid?: string }[];
}
interface RawSection {
  id: number;
  section: number;
  name: string;
  summary?: string;
  uservisible?: boolean;
  modules: RawModule[];
}
interface RawConfig {
  plugin: string;
  subtype: string;
  name: string;
  value: string;
}
interface RawAssign {
  id: number;
  cmid: number;
  course: number;
  name: string;
  duedate: number;
  cutoffdate: number;
  allowsubmissionsfromdate: number;
  gradingduedate?: number;
  intro?: string;
  introattachments?: RawContent[];
  configs: RawConfig[];
  teamsubmission?: number;
  requiresubmissionstatement?: number;
  maxattempts?: number;
}
interface RawQuiz {
  id: number;
  course: number;
  coursemodule: number;
  name: string;
  intro?: string;
  timeopen: number;
  timeclose: number;
  timelimit: number;
  attempts: number;
}
interface RawEvent {
  id: number;
  name: string;
  description?: string;
  eventtype: string;
  modulename?: string;
  instance?: number;
  courseid?: number;
  timestart: number;
  timeduration: number;
  location?: string;
  url?: string;
  course?: { id: number; shortname: string };
  timesort?: number;
  action?: { name: string; actionable: boolean } | null;
  overdue?: boolean;
}

export function splitCourseName(shortname: string, fullname: string): { code: string; title: string } {
  const code = decodeEntities(shortname).replace(/\s*\(.*?\)\s*$/, "").trim() || shortname;
  let title = decodeEntities(fullname).trim();
  const prefix = new RegExp(`^${code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[:\\-–]\\s*`, "i");
  title = title.replace(prefix, "").replace(/\s*\(\d{2}\/\d{2}\)\s*$/, "").trim();
  return { code, title: title || code };
}

function fileRef(c: RawContent): FileRef {
  return {
    name: c.filename,
    mimeType: c.mimetype,
    size: c.filesize,
    serverUrl: c.fileurl,
    timeCreated: c.timecreated ? c.timecreated * 1000 : undefined,
    timeModified: c.timemodified ? c.timemodified * 1000 : undefined,
  };
}

const ms = (s?: number | null) => (s ? s * 1000 : undefined);

export class MoodleSource implements StudySource {
  readonly mode = "live" as const;
  private base = moodleConfig().baseUrl;
  private site?: Promise<RawSiteInfo>;

  private siteInfo() {
    this.site ??= moodleCall<RawSiteInfo>("core_webservice_get_site_info");
    return this.site;
  }

  async info(): Promise<SourceInfo> {
    const s = await this.siteInfo();
    return {
      mode: "live",
      siteName: decodeEntities(s.sitename),
      siteUrl: s.siteurl,
      userName: s.fullname,
      fetchedAt: Date.now(),
    };
  }

  async userKey(): Promise<string> {
    const s = await this.siteInfo();
    return `live:${new URL(s.siteurl).host}:${s.userid}`;
  }

  private async rawCourses(): Promise<RawCourse[]> {
    const s = await this.siteInfo();
    return moodleCall<RawCourse[]>("core_enrol_get_users_courses", { userid: s.userid });
  }

  async modules(): Promise<Module[]> {
    const courses = await this.rawCourses();
    return courses
      .filter((c) => !c.hidden)
      .map((c) => {
        const { code, title } = splitCourseName(c.shortname, c.fullname);
        return {
          id: c.id,
          code,
          shortName: c.shortname,
          fullName: title,
          url: `${this.base}/course/view.php?id=${c.id}`,
          startDate: ms(c.startdate),
          endDate: ms(c.enddate),
          lastAccess: ms(c.lastaccess),
          progress: typeof c.progress === "number" ? c.progress : undefined,
          summaryHtml: sanitizeHtml(c.summary, this.base) || undefined,
        } satisfies Module;
      });
  }

  async module(id: number): Promise<ModuleDetail | null> {
    const mods = await this.modules();
    const m = mods.find((x) => x.id === id);
    if (!m) return null;
    const raw = await moodleCall<RawSection[]>("core_course_get_contents", { courseid: id });
    const sections: Section[] = raw
      .filter((s) => s.uservisible !== false)
      .map((s) => {
        const sectionName = decodeEntities(s.name || (s.section === 0 ? "General" : `Section ${s.section}`));
        const parsed = parseSectionName(sectionName);
        const resources: Resource[] = s.modules
          .filter((mod) => mod.modname !== "label" && mod.modname !== "qbank")
          .map((mod) => {
            const contents = (mod.contents ?? []).filter((c) => c.type === "file");
            const mimes = mod.contentsinfo?.mimetypes ?? contents.map((c) => c.mimetype ?? "");
            const created = contents.map((c) => c.timecreated ?? 0).filter(Boolean);
            const modified = contents.map((c) => c.timemodified ?? 0).filter(Boolean);
            return {
              id: mod.id,
              courseId: id,
              sectionId: s.id,
              sectionName,
              sectionNumber: s.section,
              title: decodeEntities(mod.name),
              kind: classifyResource(mod.modname, mod.name, mimes),
              modName: mod.modname,
              url: mod.url ?? `${this.base}/course/view.php?id=${id}#section-${s.section}`,
              week: parsed.week,
              term: parsed.term,
              topic: parsed.topic,
              addedAt: created.length ? Math.min(...created) * 1000 : undefined,
              updatedAt: modified.length ? Math.max(...modified) * 1000 : ms(mod.contentsinfo?.lastmodified),
              restricted:
                mod.uservisible === false
                  ? htmlToText(mod.availabilityinfo) || "Not available yet"
                  : undefined,
              files: contents.map(fileRef),
              descriptionHtml: sanitizeHtml(mod.description, this.base) || undefined,
            } satisfies Resource;
          });
        return {
          id: s.id,
          number: s.section,
          name: sectionName,
          summaryHtml: sanitizeHtml(s.summary, this.base) || undefined,
          ...parsed,
          resources,
        } satisfies Section;
      });
    return { ...m, sections };
  }

  async resources(): Promise<Resource[]> {
    const mods = await this.modules();
    const details = await Promise.all(mods.map((m) => this.module(m.id).catch(() => null)));
    return details.flatMap((d) => d?.sections.flatMap((s) => s.resources) ?? []);
  }

  async assessments(): Promise<Assessment[]> {
    const mods = await this.modules();
    if (!mods.length) return [];
    const byId = new Map(mods.map((m) => [m.id, m]));
    const courseids = mods.map((m) => m.id);
    const s = await this.siteInfo();

    const [assignRes, quizRes, actionRes] = await Promise.all([
      moodleCall<{ courses: { id: number; assignments: RawAssign[] }[] }>("mod_assign_get_assignments", { courseids }),
      moodleCall<{ quizzes: RawQuiz[] }>("mod_quiz_get_quizzes_by_courses", { courseids }),
      moodleCall<{ events: RawEvent[] }>("core_calendar_get_action_events_by_timesort", {
        timesortfrom: Math.floor(Date.now() / 1000) - 60 * 86400,
        limitnum: 50,
      }).catch(() => ({ events: [] as RawEvent[] })),
    ]);

    const out: Assessment[] = [];

    for (const c of assignRes.courses ?? []) {
      for (const a of c.assignments) {
        const mod = byId.get(a.course);
        const status = await moodleCall<{
          lastattempt?: { submission?: { status: string }; gradingstatus?: string };
          feedback?: { gradefordisplay?: string };
        }>("mod_assign_get_submission_status", { assignid: a.id, userid: s.userid }).catch(() => null);
        out.push(this.mapAssign(a, mod, status));
      }
    }

    const attempts = await Promise.all(
      (quizRes.quizzes ?? []).map((q) =>
        moodleCall<{ attempts: { state: string }[] }>("mod_quiz_get_user_attempts", {
          quizid: q.id,
          status: "all",
          includepreviews: false,
        }).catch(() => null),
      ),
    );
    (quizRes.quizzes ?? []).forEach((q, i) => out.push(this.mapQuiz(q, byId.get(q.course), attempts[i])));

    const known = new Set(out.map((a) => a.cmid).filter(Boolean));
    for (const e of actionRes.events ?? []) {
      if (e.modulename === "assign" || e.modulename === "quiz") continue;
      const cmid = Number(/[?&]id=(\d+)/.exec(e.url ?? "")?.[1]);
      if (cmid && known.has(cmid)) continue;
      const mod = byId.get(e.course?.id ?? e.courseid ?? 0);
      out.push({
        key: `event-${e.id}`,
        kind: "event",
        courseId: mod?.id ?? 0,
        moduleCode: mod?.code ?? e.course?.shortname ?? "",
        title: decodeEntities(e.name),
        url: e.url ?? `${this.base}/calendar/view.php?view=upcoming`,
        cmid: cmid || undefined,
        dueAt: ms(e.timesort ?? e.timestart),
        status: "unknown",
        statusLabel: e.action?.name ? `Moodle says: ${e.action.name}` : "Needs action",
        done: false,
        briefHtml: sanitizeHtml(e.description, this.base) || undefined,
        attachments: [],
        officialFacts: [],
        missing: ["Moodle only exposes this as a calendar action — open it on Moodle for the full details."],
        sourceLabel: "Moodle calendar",
      });
    }
    return out;
  }

  private mapAssign(
    a: RawAssign,
    mod: Module | undefined,
    status: { lastattempt?: { submission?: { status: string }; gradingstatus?: string }; feedback?: { gradefordisplay?: string } } | null,
  ): Assessment {
    const cfg = (plugin: string, name: string) =>
      a.configs.find((c) => c.plugin === plugin && c.subtype === "assignsubmission" && c.name === name)?.value;
    const facts: { label: string; value: string }[] = [];
    const missing: string[] = [];
    const types: string[] = [];
    if (cfg("file", "enabled") === "1") types.push("File upload");
    if (cfg("onlinetext", "enabled") === "1") types.push("Online text");
    if (types.length) facts.push({ label: "Submission type (Moodle setting)", value: types.join(", ") });
    else missing.push("Moodle doesn't list a submission method for this assignment — check the brief.");
    if (cfg("file", "enabled") === "1") {
      const max = cfg("file", "maxfilesubmissions");
      if (max) facts.push({ label: "Max files", value: max });
      const ft = cfg("file", "filetypeslist");
      if (ft) facts.push({ label: "Accepted file types", value: ft });
    }
    if (cfg("onlinetext", "wordlimitenabled") === "1" && cfg("onlinetext", "wordlimit"))
      facts.push({ label: "Word limit (online text)", value: cfg("onlinetext", "wordlimit")! });
    else missing.push("No word limit is set in Moodle. The brief may state one — don't assume.");
    if (a.teamsubmission) facts.push({ label: "Group submission", value: "Yes" });
    if (a.requiresubmissionstatement) facts.push({ label: "Submission statement", value: "Required" });
    if (!a.duedate) missing.push("Moodle has no due date for this assignment.");
    missing.push("Marking criteria and rubrics are not available to students through the Moodle API — check the brief and the Moodle page.");

    const sub = status?.lastattempt?.submission?.status;
    const graded = status?.lastattempt?.gradingstatus === "graded";
    const st: Assessment["status"] = graded ? "graded" : sub === "submitted" ? "submitted" : sub === "draft" ? "draft" : status ? "not-submitted" : "unknown";
    const label: Record<Assessment["status"], string> = {
      graded: "Graded",
      submitted: "Submitted",
      draft: "Draft saved — not submitted",
      "not-submitted": "Not submitted",
      attempted: "Attempted",
      "not-attempted": "Not attempted",
      unknown: "Status unavailable",
    };

    return {
      key: `assign-${a.id}`,
      kind: "assignment",
      courseId: a.course,
      moduleCode: mod?.code ?? "",
      title: decodeEntities(a.name),
      url: `${this.base}/mod/assign/view.php?id=${a.cmid}`,
      cmid: a.cmid,
      dueAt: ms(a.duedate),
      opensAt: ms(a.allowsubmissionsfromdate),
      cutoffAt: ms(a.cutoffdate),
      status: st,
      statusLabel: label[st],
      done: st === "submitted" || st === "graded",
      briefHtml: sanitizeHtml(a.intro, this.base) || undefined,
      attachments: (a.introattachments ?? []).map(fileRef),
      officialFacts: facts,
      missing,
      sourceLabel: "Moodle assignment",
    };
  }

  private mapQuiz(q: RawQuiz, mod: Module | undefined, attempts: { attempts: { state: string }[] } | null): Assessment {
    const finished = attempts?.attempts.some((x) => x.state === "finished") ?? false;
    const inProgress = attempts?.attempts.some((x) => x.state === "inprogress" || x.state === "overdue") ?? false;
    const facts: { label: string; value: string }[] = [];
    const missing: string[] = [];
    if (q.timelimit) facts.push({ label: "Time limit", value: `${Math.round(q.timelimit / 60)} minutes` });
    facts.push({ label: "Attempts allowed", value: q.attempts ? String(q.attempts) : "Unlimited" });
    if (!q.timeclose) missing.push("Moodle has no closing date for this quiz.");
    if (!/not assessed|practice|formative/i.test(q.name))
      missing.push("Moodle doesn't say how much this quiz counts towards your mark — check the module's assessment information.");
    const status: Assessment["status"] = finished ? "attempted" : attempts ? "not-attempted" : "unknown";
    return {
      key: `quiz-${q.id}`,
      kind: "quiz",
      courseId: q.course,
      moduleCode: mod?.code ?? "",
      title: decodeEntities(q.name),
      url: `${this.base}/mod/quiz/view.php?id=${q.coursemodule}`,
      cmid: q.coursemodule,
      dueAt: ms(q.timeclose),
      opensAt: ms(q.timeopen),
      closesAt: ms(q.timeclose),
      timeLimitSeconds: q.timelimit || undefined,
      attemptsAllowed: q.attempts,
      status,
      statusLabel: finished ? "Attempt finished" : inProgress ? "Attempt in progress" : attempts ? "Not attempted" : "Status unavailable",
      done: finished,
      briefHtml: sanitizeHtml(q.intro, this.base) || undefined,
      attachments: [],
      officialFacts: facts,
      missing,
      sourceLabel: "Moodle quiz",
    };
  }

  async calendar(from: number, to: number): Promise<TimetableItem[]> {
    const mods = await this.modules();
    const byId = new Map(mods.map((m) => [m.id, m]));
    const res = await moodleCall<{ events: RawEvent[] }>("core_calendar_get_calendar_events", {
      events: { courseids: mods.map((m) => m.id) },
      options: {
        userevents: true,
        siteevents: true,
        timestart: Math.floor(from / 1000),
        timeend: Math.floor(to / 1000),
      },
    });
    // Link quiz/assignment events to their activity page when we can.
    const assess = await this.assessments().catch(() => [] as Assessment[]);
    const linkByInstance = new Map<string, string>();
    for (const a of assess) linkByInstance.set(a.key, a.url);

    return (res.events ?? []).map((e) => {
      const mod = byId.get(e.courseid ?? 0);
      const type = e.eventtype;
      const category: TimetableItem["category"] =
        type === "due" || type === "close" || type === "gradingdue" ? "deadline" : type === "open" ? "opens" : "event";
      const key = e.modulename === "quiz" ? `quiz-${e.instance}` : e.modulename === "assign" ? `assign-${e.instance}` : "";
      return {
        id: `moodle-${e.id}`,
        title: decodeEntities(e.name),
        start: e.timestart * 1000,
        end: e.timeduration ? (e.timestart + e.timeduration) * 1000 : undefined,
        location: e.location || undefined,
        description: htmlToText(e.description) || undefined,
        moduleCode: mod?.code,
        courseId: mod?.id,
        url: linkByInstance.get(key) ?? `${this.base}/calendar/view.php?view=day&time=${e.timestart}`,
        source: "moodle-calendar",
        category,
      } satisfies TimetableItem;
    });
  }

  async pageText(courseId: number, cmid: number): Promise<string | null> {
    const res = await moodleCall<{ pages: { coursemodule: number; content: string; intro?: string }[] }>(
      "mod_page_get_pages_by_courses",
      { courseids: [courseId] },
    ).catch(() => null);
    const page = res?.pages.find((p) => p.coursemodule === cmid);
    return page ? htmlToText(`${page.intro ?? ""}\n${page.content}`) : null;
  }

  download(file: { serverUrl?: string }, maxBytes: number) {
    return file.serverUrl ? moodleDownload(file.serverUrl, maxBytes) : Promise.resolve(null);
  }
}
