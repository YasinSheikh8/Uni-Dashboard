import "server-only";
import type { TimetableCoverage, TimetableItem } from "@/lib/data/model";
import type { StudySource } from "@/lib/data/source";
import { getSettings } from "@/lib/store/user-data";
import { parseIcs } from "./ics";

const feedCache = new Map<string, { at: number; text: string }>();
const FEED_TTL = 15 * 60_000;

/** Only https feeds, and only from hosts we expect timetable feeds to come from (configurable). */
export function isAllowedFeedUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const allowed = (process.env.TIMETABLE_FEED_HOSTS || "tabula.warwick.ac.uk,warwick.ac.uk,my.warwick.ac.uk")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);
    const host = u.hostname.toLowerCase();
    return allowed.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

async function feedUrl(source: StudySource): Promise<string | undefined> {
  if (source.mode === "demo") return undefined;
  if (process.env.TIMETABLE_ICS_URL) return process.env.TIMETABLE_ICS_URL;
  return (await getSettings(await source.userKey())).timetableIcsUrl;
}

/** Warwick timetable titles mark lectures with "L"/"Lecture" and seminars with "S"/"Seminar"/"Group". */
export function sessionTypeFrom(summary: string, description = ""): "lecture" | "seminar" | "other" {
  const text = `${summary} ${description}`;
  if (/\blecture|\b[A-Z]{2,4}\d{3}L\b/i.test(text)) return "lecture";
  if (/seminar|tutorial|workshop|\bclass\b|\b[A-Z]{2,4}\d{3}S\b|\bgroup\s*\d/i.test(text)) return "seminar";
  return "other";
}

export function moduleCodeFrom(text: string, codes: string[]): string | undefined {
  return codes.find((c) => c.length >= 3 && new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
}

export async function getTimetable(
  source: StudySource,
  from: number,
  to: number,
): Promise<{ items: TimetableItem[]; coverage: TimetableCoverage; moodleError?: string }> {
  const modules = await source.modules().catch(() => []);
  const codes = modules.map((m) => m.code);
  let moodleError: string | undefined;
  const moodleItems = await source.calendar(from, to).catch((e) => {
    moodleError = e instanceof Error ? e.message : "Couldn't load the Moodle calendar";
    return [] as TimetableItem[];
  });

  if (source.mode === "demo") {
    return { items: moodleItems.sort((a, b) => a.start - b.start), coverage: { teachingSynced: true, feedLabel: "Sample timetable" }, moodleError };
  }

  const url = await feedUrl(source);
  const coverage: TimetableCoverage = { teachingSynced: false };
  const items = [...moodleItems];
  if (url) {
    coverage.feedLabel = new URL(url).hostname.includes("tabula") ? "Tabula calendar feed" : "Timetable feed";
    try {
      if (!isAllowedFeedUrl(url)) throw new Error("That feed address isn't on the allowed list of Warwick hosts.");
      let hit = feedCache.get(url);
      if (!hit || Date.now() - hit.at > FEED_TTL) {
        const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
        if (!res.ok) throw new Error(`The feed responded with HTTP ${res.status}`);
        hit = { at: Date.now(), text: await res.text() };
        if (!hit.text.includes("BEGIN:VCALENDAR")) throw new Error("The feed didn't return a calendar");
        feedCache.set(url, hit);
      }
      coverage.feedFetchedAt = hit.at;
      coverage.teachingSynced = true;
      for (const e of parseIcs(hit.text, from, to)) {
        const code = moduleCodeFrom(`${e.summary} ${e.description ?? ""}`, codes);
        items.push({
          id: `feed-${e.uid}`,
          title: e.summary,
          start: e.start,
          end: e.end,
          allDay: e.allDay,
          location: e.location,
          description: e.description,
          moduleCode: code,
          courseId: modules.find((m) => m.code === code)?.id,
          url: e.url && /^https:\/\//.test(e.url) ? e.url : undefined,
          source: "timetable-feed",
          category: "teaching",
          sessionType: sessionTypeFrom(e.summary, e.description),
        });
      }
    } catch (e) {
      coverage.feedError = e instanceof Error ? e.message : "Couldn't read the timetable feed";
    }
  }
  return { items: items.sort((a, b) => a.start - b.start), coverage, moodleError };
}
