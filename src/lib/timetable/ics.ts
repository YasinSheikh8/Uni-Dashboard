import { londonWallToUtc } from "@/lib/time";

/**
 * Small iCalendar (RFC 5545) reader for personal timetable feeds such as the
 * Tabula calendar subscription. Supports VEVENT with DTSTART/DTEND/DURATION,
 * UTC, floating and TZID=Europe/London times, all-day dates, and simple
 * DAILY/WEEKLY RRULEs with COUNT/UNTIL/INTERVAL/BYDAY plus EXDATE.
 */
export interface IcsEvent {
  uid: string;
  summary: string;
  start: number;
  end?: number;
  allDay: boolean;
  location?: string;
  description?: string;
  url?: string;
}

function unfold(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function unescape(v: string): string {
  return v.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}

function parseLine(line: string): Prop | null {
  const idx = line.search(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  if (idx < 0) return null;
  const head = line.slice(0, idx);
  const value = line.slice(idx + 1);
  const [name, ...rest] = head.split(";");
  const params: Record<string, string> = {};
  for (const p of rest) {
    const [k, v] = p.split("=");
    if (k && v !== undefined) params[k.toUpperCase()] = v.replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value };
}

/** Parse a DATE or DATE-TIME value to UTC ms. Non-London TZIDs are treated as London (Warwick feeds use London). */
export function parseIcsDate(value: string, params: Record<string, string> = {}): { ms: number; allDay: boolean } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h === undefined || params.VALUE === "DATE") {
    return { ms: londonWallToUtc(+y, +mo, +d), allDay: true };
  }
  if (z) return { ms: Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0)), allDay: false };
  return { ms: londonWallToUtc(+y, +mo, +d, +h, +mi, +(s ?? 0)), allDay: false };
}

function parseDuration(v: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
  if (!m) return null;
  const [, sign, w, d, h, mi, s] = m;
  const total = ((+(w ?? 0) * 7 + +(d ?? 0)) * 86400 + +(h ?? 0) * 3600 + +(mi ?? 0) * 60 + +(s ?? 0)) * 1000;
  return sign === "-" ? -total : total;
}

const DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

function expand(
  start: number,
  rrule: string,
  exdates: Set<number>,
  windowStart: number,
  windowEnd: number,
): number[] {
  const rule: Record<string, string> = {};
  for (const part of rrule.split(";")) {
    const [k, v] = part.split("=");
    if (k && v) rule[k.toUpperCase()] = v;
  }
  const freq = rule.FREQ;
  if (freq !== "DAILY" && freq !== "WEEKLY") return [start];
  const interval = Math.max(1, Number(rule.INTERVAL ?? 1));
  const count = rule.COUNT ? Number(rule.COUNT) : Infinity;
  const until = rule.UNTIL ? parseIcsDate(rule.UNTIL)?.ms ?? Infinity : Infinity;
  const byDay = rule.BYDAY?.split(",").map((d) => DAYS.indexOf(d.slice(-2))).filter((d) => d >= 0);

  // Work in London wall time so recurrences keep their clock time across BST.
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  const p: Record<string, number> = {};
  for (const part of fmt.formatToParts(start)) if (part.type !== "literal") p[part.type] = Number(part.value);
  const base = Date.UTC(p.year, p.month - 1, p.day);
  const startWeekday = (new Date(base).getUTCDay() + 6) % 7;

  const out: number[] = [];
  let n = 0;
  for (let i = 0; i < 2000 && n < count; i++) {
    const dayStep = freq === "DAILY" ? i * interval : 0;
    const candidates: number[] = [];
    if (freq === "DAILY") candidates.push(base + dayStep * 86400000);
    else {
      const weekBase = base - startWeekday * 86400000 + i * interval * 7 * 86400000;
      for (const wd of byDay?.length ? byDay.sort() : [startWeekday]) candidates.push(weekBase + wd * 86400000);
    }
    for (const dayUtc of candidates) {
      if (dayUtc < base) continue;
      const d = new Date(dayUtc);
      const occ = londonWallToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), p.hour, p.minute, p.second);
      if (occ > until) return out;
      n++;
      if (n > count) return out;
      if (!exdates.has(occ) && occ >= windowStart && occ < windowEnd) out.push(occ);
    }
    if (base + (freq === "DAILY" ? dayStep : i * interval * 7) * 86400000 > windowEnd + 8 * 86400000 && freq === "WEEKLY") break;
    if (freq === "DAILY" && base + dayStep * 86400000 > windowEnd) break;
  }
  return out;
}

export function parseIcs(text: string, windowStart = -Infinity, windowEnd = Infinity): IcsEvent[] {
  const lines = unfold(text);
  const events: IcsEvent[] = [];
  let cur: Prop[] | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") cur = [];
    else if (line === "END:VEVENT" && cur) {
      const get = (n: string) => cur!.find((p) => p.name === n);
      const dtStart = get("DTSTART");
      const start = dtStart && parseIcsDate(dtStart.value, dtStart.params);
      const status = get("STATUS")?.value;
      if (start && status !== "CANCELLED") {
        const dtEnd = get("DTEND");
        const dur = get("DURATION");
        const endParsed = dtEnd ? parseIcsDate(dtEnd.value, dtEnd.params)?.ms : undefined;
        const length =
          endParsed !== undefined ? endParsed - start.ms : dur ? parseDuration(dur.value) ?? undefined : start.allDay ? 86400000 : undefined;
        const exdates = new Set<number>();
        for (const ex of cur.filter((p) => p.name === "EXDATE"))
          for (const v of ex.value.split(",")) {
            const d = parseIcsDate(v, ex.params);
            if (d) exdates.add(d.ms);
          }
        const rrule = get("RRULE")?.value;
        const starts = rrule ? expand(start.ms, rrule, exdates, windowStart, windowEnd) : [start.ms];
        const base = {
          uid: get("UID")?.value ?? `${start.ms}`,
          summary: unescape(get("SUMMARY")?.value ?? "Untitled"),
          allDay: start.allDay,
          location: get("LOCATION") ? unescape(get("LOCATION")!.value) || undefined : undefined,
          description: get("DESCRIPTION") ? unescape(get("DESCRIPTION")!.value) || undefined : undefined,
          url: get("URL")?.value,
        };
        for (const s of starts) {
          const end = length !== undefined ? s + length : undefined;
          if ((end ?? s) < windowStart || s >= windowEnd) continue;
          events.push({ ...base, uid: rrule ? `${base.uid}@${s}` : base.uid, start: s, end });
        }
      }
      cur = null;
    } else if (cur) {
      const p = parseLine(line);
      if (p) cur.push(p);
    }
  }
  return events.sort((a, b) => a.start - b.start);
}
