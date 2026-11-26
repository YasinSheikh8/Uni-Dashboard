/**
 * Date helpers pinned to Europe/London. Every date the product shows goes
 * through here, so the browser's own timezone never leaks into what a
 * deadline "says".
 */
import { TIMEZONE } from "@/config/app";

const partsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export interface LondonParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Monday … 6 = Sunday
}

export function londonParts(date: Date | number): LondonParts {
  const d = typeof date === "number" ? new Date(date) : date;
  const p: Record<string, string> = {};
  for (const part of partsFmt.formatToParts(d)) p[part.type] = part.value;
  const year = Number(p.year);
  const month = Number(p.month);
  const day = Number(p.day);
  const js = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday
  return {
    year,
    month,
    day,
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: (js + 6) % 7,
  };
}

/** Offset of London from UTC at an instant, in minutes (0 in GMT, 60 in BST). */
export function londonOffsetMinutes(instant: number): number {
  const p = londonParts(instant);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(instant / 1000) * 1000) / 60000);
}

/**
 * Convert a London wall-clock time to a UTC instant (ms). Handles the BST
 * changeover by re-checking the offset at the candidate instant.
 */
export function londonWallToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): number {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = naive - londonOffsetMinutes(naive) * 60000;
  const check = naive - londonOffsetMinutes(guess) * 60000;
  if (check !== guess) guess = check;
  return guess;
}

/** YYYY-MM-DD of an instant in London. */
export function londonDateKey(date: Date | number): string {
  const p = londonParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function parseDateKey(key: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** Start (inclusive) and end (exclusive) of a London calendar day, as UTC ms. */
export function londonDayRange(key: string): { start: number; end: number } {
  const p = parseDateKey(key) ?? parseDateKey(londonDateKey(Date.now()))!;
  const start = londonWallToUtc(p.year, p.month, p.day);
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  const end = londonWallToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
  return { start, end };
}

export function addDaysToKey(key: string, days: number): string {
  const p = parseDateKey(key)!;
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Monday of the London week containing `key`. */
export function weekStartKey(key: string): string {
  const p = parseDateKey(key)!;
  const js = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return addDaysToKey(key, -((js + 6) % 7));
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const k = JSON.stringify(opts);
  let f = fmtCache.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, ...opts });
    fmtCache.set(k, f);
  }
  return f;
}

export const formatTime = (ms: number) => fmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ms);
export const formatDate = (ms: number) => fmt({ weekday: "short", day: "numeric", month: "short" }).format(ms);
export const formatDateLong = (ms: number) =>
  fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(ms);
export const formatDateTime = (ms: number) => `${formatDate(ms)}, ${formatTime(ms)}`;
export const formatDayKey = (key: string) => {
  const p = parseDateKey(key)!;
  return fmt({ weekday: "long", day: "numeric", month: "long" }).format(londonWallToUtc(p.year, p.month, p.day, 12));
};
export const formatShortDayKey = (key: string) => {
  const p = parseDateKey(key)!;
  return fmt({ weekday: "short", day: "numeric", month: "short" }).format(londonWallToUtc(p.year, p.month, p.day, 12));
};

/** "in 3 days", "in 5 hours", "2 days ago" — relative to `now`. */
export function relativeTo(ms: number, now = Date.now()): string {
  const diff = ms - now;
  const abs = Math.abs(diff);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  let text: string;
  if (abs < hour) text = `${Math.max(1, Math.round(abs / minute))} min`;
  else if (abs < day) {
    const h = Math.round(abs / hour);
    text = `${h} hour${h === 1 ? "" : "s"}`;
  } else {
    const d = Math.round(abs / day);
    text = `${d} day${d === 1 ? "" : "s"}`;
  }
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}

/** "Today", "Tomorrow", or a short date — for London calendar days. */
export function dayLabel(ms: number, now = Date.now()): string {
  const key = londonDateKey(ms);
  const today = londonDateKey(now);
  if (key === today) return "Today";
  if (key === addDaysToKey(today, 1)) return "Tomorrow";
  if (key === addDaysToKey(today, -1)) return "Yesterday";
  return formatDate(ms);
}
