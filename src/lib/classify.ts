import type { ResourceKind } from "@/lib/data/model";

/** Pull "Term 1, Week 3 - Liberty" / "Week 5: …" / "Unit 2: …" apart. */
export function parseSectionName(name: string): { week?: number; term?: number; topic?: string } {
  const clean = decodeEntities(name).trim();
  const term = /\bterm\s*(\d)\b/i.exec(clean)?.[1];
  const week = /\bweek\s*(\d{1,2})\b/i.exec(clean)?.[1];
  // Topic: whatever follows the last separator after the week/unit marker.
  let topic: string | undefined;
  const sep = /(?:week\s*\d{1,2}|unit\s*\d{1,2}|lecture\s*\d{1,2})\s*[-–:,]\s*(.+)$/i.exec(clean);
  if (sep) topic = sep[1].trim();
  else if (!week && !/^general$/i.test(clean)) topic = clean;
  const unit = /\bunit\s*(\d{1,2})\b/i.exec(clean)?.[1];
  if (unit && topic) topic = `Unit ${unit}: ${topic}`;
  return { week: week ? Number(week) : undefined, term: term ? Number(term) : undefined, topic };
}

/**
 * Infer a resource's kind from its Moodle activity type, file type and title.
 * This is a heuristic for grouping only; the UI always links to the real item.
 */
export function classifyResource(modName: string, title: string, mimeTypes: string[]): ResourceKind {
  const t = title.toLowerCase();
  const mime = mimeTypes.join(" ");
  if (modName === "quiz") return "quiz";
  if (modName === "assign") return "assignment";
  if (modName === "forum") return "forum";
  if (modName === "folder") return "folder";
  if (modName === "page") return "page";
  if (/video|recording|lecture capture|echo ?360|panopto|screencast|\bstream\b/.test(t) || /video\//.test(mime))
    return "recording";
  if (modName === "lti") return "tool";
  if (/slides?\b|lecture notes?|presentation|powerpoint/.test(t) || /presentation/.test(mime)) return "slides";
  if (/seminar|tutorial|support (and|&) feedback|class(es)?\b|workshop/.test(t)) return "seminar";
  if (/homework|worksheet|exercise|problem set|practice|questions/.test(t)) return "exercise";
  if (/\breading|chapter|article|\bpaper\b|textbook|journal/.test(t)) return "reading";
  if (modName === "url") return "link";
  if (modName === "resource") return "file";
  return "other";
}

export const KIND_LABEL: Record<ResourceKind, string> = {
  slides: "Slides",
  reading: "Reading",
  recording: "Recording",
  exercise: "Exercise",
  seminar: "Seminar",
  file: "File",
  link: "Link",
  page: "Page",
  folder: "Folder",
  tool: "External tool",
  forum: "Forum",
  quiz: "Quiz",
  assignment: "Assignment",
  other: "Other",
};

/** Kinds that count as learning materials (not activities). */
export const MATERIAL_KINDS: ResourceKind[] = [
  "slides",
  "reading",
  "recording",
  "exercise",
  "seminar",
  "file",
  "link",
  "page",
  "folder",
  "tool",
];

export function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

/** Strip tags for plain-text use (search, AI prompts). */
export function htmlToText(html: string | undefined): string {
  if (!html) return "";
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h\d|tr)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const ALLOWED_TAGS = new Set([
  "p", "br", "ul", "ol", "li", "strong", "b", "em", "i", "u", "a", "h2", "h3", "h4", "h5", "h6",
  "blockquote", "code", "pre", "table", "thead", "tbody", "tr", "th", "td", "hr", "span", "div", "sup", "sub",
]);

/**
 * Allowlist sanitiser for HTML that Moodle returns (briefs, section summaries).
 * Tags are rebuilt from scratch, so no attributes survive except a vetted href.
 * Images are replaced with a note, because they would need the secret token to load.
 */
export function sanitizeHtml(html: string | undefined, moodleBase: string): string {
  if (!html) return "";
  let s = html.replace(/<(script|style|iframe|object|embed|form|svg|math)[\s\S]*?<\/\1>/gi, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<img[^>]*>/gi, '<em class="muted">[image — open on Moodle to view]</em>');
  return s.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (full, rawTag: string, attrs: string) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    const closing = full.startsWith("</");
    if (closing) return `</${tag}>`;
    if (tag === "a") {
      const href = /href\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
      const raw = decodeEntities(href?.[2] ?? href?.[3] ?? "");
      const safe = safeHref(raw, moodleBase);
      return safe ? `<a href="${escapeAttr(safe)}" target="_blank" rel="noopener noreferrer">` : "<a>";
    }
    return `<${tag}>`;
  });
}

function safeHref(raw: string, moodleBase: string): string | null {
  try {
    const url = new URL(raw, moodleBase);
    if (url.protocol !== "https:" && url.protocol !== "http:" && url.protocol !== "mailto:") return null;
    // Links that went through the web-service file endpoint need a token; the
    // normal endpoint works with the student's browser session instead.
    url.pathname = url.pathname.replace("/webservice/pluginfile.php/", "/pluginfile.php/");
    url.searchParams.delete("token");
    url.searchParams.delete("wstoken");
    return url.toString();
  } catch {
    return null;
  }
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
