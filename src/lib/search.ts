import "server-only";
import { QUICK_LINKS } from "@/config/links";
import { KIND_LABEL } from "@/lib/classify";
import type { SearchHit } from "@/components/search-palette";
import type { StudySource } from "@/lib/data/source";
import { listNotes } from "@/lib/store/user-data";

function score(hay: string, terms: string[]): number {
  const h = hay.toLowerCase();
  let s = 0;
  for (const t of terms) {
    const i = h.indexOf(t);
    if (i < 0) return 0;
    s += i === 0 ? 3 : /\W/.test(h[i - 1] ?? " ") ? 2 : 1;
  }
  return s;
}

export async function searchAll(source: StudySource, q: string, limitPerType = 8): Promise<SearchHit[]> {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const [modules, resources, assessments, notes] = await Promise.all([
    source.modules().catch(() => []),
    source.resources().catch(() => []),
    source.assessments().catch(() => []),
    source.userKey().then(listNotes).catch(() => []),
  ]);
  const code = new Map(modules.map((m) => [m.id, m.code]));
  const rank = <T,>(items: T[], text: (t: T) => string) =>
    items
      .map((i) => ({ i, s: score(text(i), terms) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, limitPerType)
      .map((x) => x.i);

  return [
    ...rank(modules, (m) => `${m.code} ${m.fullName}`).map((m) => ({ type: "module" as const, title: `${m.code} · ${m.fullName}`, href: `/modules/${m.id}` })),
    ...rank(assessments, (a) => `${a.title} ${a.moduleCode} ${a.kind}`).map((a) => ({ type: "assessment" as const, title: a.title, subtitle: `${a.moduleCode} · ${a.statusLabel}`, href: `/assessments/${a.key}` })),
    ...rank(resources, (r) => `${r.title} ${r.sectionName} ${code.get(r.courseId) ?? ""} ${KIND_LABEL[r.kind]}`).map((r) => ({
      type: "resource" as const,
      title: r.title,
      subtitle: `${code.get(r.courseId) ?? ""} · ${KIND_LABEL[r.kind]} · ${r.sectionName}`,
      href: `/modules/${r.courseId}#cm-${r.id}`,
    })),
    ...rank(notes, (n) => `${n.title} ${n.topic ?? ""} ${n.tags.join(" ")} ${n.body}`).map((n) => ({ type: "note" as const, title: n.title, subtitle: n.origin === "ai" ? "AI study guide" : "Your note", href: `/notes/${n.id}` })),
    ...rank(QUICK_LINKS, (l) => `${l.title} ${l.description} ${l.keywords ?? ""}`).map((l) => ({ type: "link" as const, title: l.title, subtitle: l.description, href: l.url, external: true })),
  ];
}
