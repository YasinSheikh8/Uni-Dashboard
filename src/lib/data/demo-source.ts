import "server-only";
import { classifyResource, parseSectionName } from "@/lib/classify";
import { addDaysToKey, londonDateKey, londonWallToUtc, parseDateKey, weekStartKey } from "@/lib/time";
import type { Assessment, Module, ModuleDetail, Resource, Section, SourceInfo, TimetableItem } from "./model";
import type { StudySource } from "./source";

/**
 * Sample data for trying the product without a Moodle connection.
 * Everything here is fictional, labelled DEMO, and links to /demo rather than
 * to real Moodle pages. It is never shown when a Moodle token is configured.
 */

const DAY = 86_400_000;
const link = (id: string | number) => `/demo#${id}`;

function at(dayOffset: number, hour: number, minute = 0): number {
  const key = addDaysToKey(londonDateKey(Date.now()), dayOffset);
  const p = parseDateKey(key)!;
  return londonWallToUtc(p.year, p.month, p.day, hour, minute);
}

const MODULES: Module[] = [
  { id: 9001, code: "DEMO-EC101", shortName: "DEMO-EC101", fullName: "Principles of Economics (sample)", url: link("course-9001") },
  { id: 9002, code: "DEMO-PH110", shortName: "DEMO-PH110", fullName: "Knowledge, Truth and Evidence (sample)", url: link("course-9002") },
  { id: 9003, code: "DEMO-MA105", shortName: "DEMO-MA105", fullName: "Mathematical Methods (sample)", url: link("course-9003") },
];

type R = [title: string, modName: string, mime?: string];

const PLAN: Record<number, { name: string; summary?: string; items: R[] }[]> = {
  9001: [
    { name: "Module information", items: [["Module handbook", "resource", "application/pdf"], ["Announcements", "forum"]] },
    { name: "Term 1, Week 6 - Markets and prices", items: [["Week 6 lecture slides", "resource", "application/pdf"], ["Week 6 lecture recording", "lti"], ["Required reading: Chapter 7", "url"], ["Week 6 problem set", "resource", "application/pdf"]] },
    { name: "Term 1, Week 7 - Firms and costs", summary: "<p>This week covers production functions and cost curves.</p>", items: [["Week 7 lecture slides", "resource", "application/vnd.openxmlformats-officedocument.presentationml.presentation"], ["Seminar 4 worksheet", "resource", "application/pdf"]] },
    { name: "Term 1, Week 8 - Market structure", items: [["Week 8 lecture slides", "resource", "application/pdf"]] },
  ],
  9002: [
    { name: "Assessment", items: [["Essay guidance", "page"]] },
    { name: "Term 1, Week 6 - What is knowledge?", items: [["Lecture 6 handout", "resource", "application/pdf"], ["Reading: Gettier (1963)", "url"]] },
    { name: "Term 1, Week 7 - Testimony and trust", items: [["Lecture 7 slides", "resource", "application/pdf"], ["Seminar questions", "page"]] },
  ],
  9003: [
    { name: "Term 1, Week 6 - Differentiation", items: [["Lecture notes: differentiation", "resource", "application/pdf"], ["Practice questions sheet 5", "resource", "application/pdf"]] },
    { name: "Term 1, Week 7 - Optimisation", items: [["Lecture notes: optimisation", "resource", "application/pdf"], ["Lecture capture video", "lti"]] },
  ],
};

function buildModule(m: Module): ModuleDetail {
  let cm = m.id * 100;
  const now = Date.now();
  const sections: Section[] = (PLAN[m.id] ?? []).map((s, i) => {
    const parsed = parseSectionName(s.name);
    const resources: Resource[] = s.items.map(([title, modName, mime], j) => {
      cm++;
      const added = now - ((PLAN[m.id].length - i) * 7 - j) * DAY * 0.5;
      return {
        id: cm,
        courseId: m.id,
        sectionId: m.id * 10 + i,
        sectionName: s.name,
        sectionNumber: i,
        title,
        kind: classifyResource(modName, title, mime ? [mime] : []),
        modName,
        url: link(cm),
        ...parsed,
        addedAt: mime ? added : undefined,
        updatedAt: mime ? added : undefined,
        files: mime ? [{ name: `${title}.${mime.includes("pdf") ? "pdf" : "pptx"}`, mimeType: mime, size: 1_200_000 }] : [],
      };
    });
    return { id: m.id * 10 + i, number: i, name: s.name, summaryHtml: s.summary, ...parsed, resources };
  });
  return { ...m, sections };
}

function assessments(): Assessment[] {
  return [
    {
      key: "assign-1",
      kind: "assignment",
      courseId: 9002,
      moduleCode: "DEMO-PH110",
      title: "Formative essay (sample)",
      url: link("assign-1"),
      dueAt: at(5, 12),
      opensAt: at(-14, 9),
      status: "not-submitted",
      statusLabel: "Not submitted",
      done: false,
      briefHtml:
        "<p>Write an essay answering <strong>one</strong> of the questions on the Essay guidance page.</p><ul><li>Use at least three sources from the reading list.</li><li>Submit as a PDF.</li></ul>",
      attachments: [],
      officialFacts: [
        { label: "Submission type (Moodle setting)", value: "File upload" },
        { label: "Accepted file types", value: ".pdf" },
      ],
      missing: [
        "No word limit is set in Moodle. The brief may state one — don't assume.",
        "Marking criteria and rubrics are not available to students through the Moodle API — check the brief and the Moodle page.",
      ],
      sourceLabel: "Sample assignment",
    },
    {
      key: "quiz-1",
      kind: "quiz",
      courseId: 9001,
      moduleCode: "DEMO-EC101",
      title: "Week 6 quiz (sample)",
      url: link("quiz-1"),
      opensAt: at(-2, 9),
      closesAt: at(2, 18),
      dueAt: at(2, 18),
      timeLimitSeconds: 3600,
      attemptsAllowed: 1,
      status: "not-attempted",
      statusLabel: "Not attempted",
      done: false,
      attachments: [],
      officialFacts: [
        { label: "Time limit", value: "60 minutes" },
        { label: "Attempts allowed", value: "1" },
      ],
      missing: ["Moodle doesn't say how much this quiz counts towards your mark — check the module's assessment information."],
      sourceLabel: "Sample quiz",
    },
    {
      key: "quiz-2",
      kind: "quiz",
      courseId: 9003,
      moduleCode: "DEMO-MA105",
      title: "Practice test: differentiation (sample)",
      url: link("quiz-2"),
      opensAt: at(-6, 9),
      closesAt: at(9, 17),
      dueAt: at(9, 17),
      attemptsAllowed: 0,
      status: "attempted",
      statusLabel: "Attempt finished",
      done: true,
      attachments: [],
      officialFacts: [{ label: "Attempts allowed", value: "Unlimited" }],
      missing: [],
      sourceLabel: "Sample quiz",
    },
  ];
}

export class DemoSource implements StudySource {
  readonly mode = "demo" as const;
  async info(): Promise<SourceInfo> {
    return { mode: "demo", siteName: "Sample data", siteUrl: "/demo", fetchedAt: Date.now() };
  }
  async userKey() {
    return "demo";
  }
  async modules() {
    return MODULES;
  }
  async module(id: number) {
    const m = MODULES.find((x) => x.id === id);
    return m ? buildModule(m) : null;
  }
  async resources() {
    return MODULES.flatMap((m) => buildModule(m).sections.flatMap((s) => s.resources));
  }
  async assessments() {
    return assessments();
  }
  async calendar(from: number, to: number): Promise<TimetableItem[]> {
    const items: TimetableItem[] = [];
    const weekly: [weekday: number, hour: number, len: number, title: string, code: string, room: string][] = [
      [0, 10, 1, "Lecture", "DEMO-EC101", "Sample Lecture Theatre 1"],
      [0, 14, 1, "Seminar", "DEMO-PH110", "Sample Room 2.04"],
      [1, 9, 2, "Lecture", "DEMO-MA105", "Sample Lecture Theatre 3"],
      [2, 11, 1, "Lecture", "DEMO-PH110", "Sample Lecture Theatre 1"],
      [3, 10, 1, "Lecture", "DEMO-EC101", "Sample Lecture Theatre 1"],
      [3, 15, 1, "Support class", "DEMO-MA105", "Sample Room 0.12"],
      [4, 13, 1, "Seminar", "DEMO-EC101", "Sample Room 1.07"],
    ];
    const todayKey = londonDateKey(Date.now());
    for (let w = -1; w <= 3; w++) {
      const monday = addDaysToKey(weekStartKey(todayKey), w * 7);
      for (const [wd, h, len, title, code, room] of weekly) {
        const p = parseDateKey(addDaysToKey(monday, wd))!;
        const start = londonWallToUtc(p.year, p.month, p.day, h);
        if (start < from || start >= to) continue;
        const mod = MODULES.find((m) => m.code === code)!;
        items.push({
          id: `demo-${code}-${w}-${wd}-${h}`,
          title: `${code} ${title}`,
          start,
          end: start + len * 3_600_000,
          location: room,
          moduleCode: code,
          courseId: mod.id,
          source: "demo",
          category: "teaching",
          sessionType: /lecture/i.test(title) ? "lecture" : "seminar",
        });
      }
    }
    for (const a of assessments()) {
      if (a.dueAt && a.dueAt >= from && a.dueAt < to)
        items.push({ id: `demo-due-${a.key}`, title: `${a.title} ${a.kind === "quiz" ? "closes" : "due"}`, start: a.dueAt, moduleCode: a.moduleCode, courseId: a.courseId, url: `/assessments/${a.key}`, source: "demo", category: "deadline" });
    }
    return items;
  }
  async pageText() {
    return "This is sample page content. In live mode, the real Moodle page text is used.";
  }
  async download() {
    return null;
  }
}

/** Sample flashcards/quizzes so the Study area can be tried without AI. Labelled "Sample". */
export function demoStudySet(sectionId: number) {
  const sets: Record<number, { cards: [string, string][]; quiz: [string, string[], number, string][] }> = {
    90011: {
      cards: [
        ["Law of demand", "Other things equal, as price rises the quantity demanded falls."],
        ["Price elasticity of demand", "% change in quantity demanded ÷ % change in price."],
        ["Elastic demand", "|PED| > 1: quantity responds more than proportionally to price."],
        ["Market equilibrium", "The price at which quantity demanded equals quantity supplied."],
        ["Excess demand", "At a price below equilibrium, quantity demanded exceeds quantity supplied."],
        ["Consumer surplus", "The difference between what buyers are willing to pay and what they pay."],
      ],
      quiz: [
        ["If price is set below equilibrium, what results?", ["Excess supply", "Excess demand", "No change", "A rightward supply shift"], 1, "Below equilibrium, buyers want more than sellers offer."],
        ["PED of −2 means demand is…", ["Inelastic", "Unit elastic", "Elastic", "Perfectly inelastic"], 2, "|−2| > 1, so demand is elastic."],
        ["A rise in income for a normal good shifts…", ["Demand right", "Demand left", "Supply right", "Supply left"], 0, "Normal goods are demanded more as income rises."],
      ],
    },
    90030: {
      cards: [
        ["Derivative of xⁿ", "n·xⁿ⁻¹"],
        ["Chain rule", "d/dx f(g(x)) = f′(g(x))·g′(x)"],
        ["Product rule", "(uv)′ = u′v + uv′"],
        ["Stationary point", "A point where the first derivative equals zero."],
      ],
      quiz: [
        ["d/dx (x³) = ?", ["3x²", "x²", "3x³", "x⁴/4"], 0, "Power rule: n·xⁿ⁻¹."],
        ["At a stationary point, f′(x) is…", ["1", "0", "Undefined", "Negative"], 1, "Stationary means the gradient is zero."],
      ],
    },
  };
  const s = sets[sectionId];
  if (!s) return null;
  return {
    cards: s.cards.map(([front, back], i) => ({ id: `sample${sectionId}-${i}`, front, back, sources: ["Sample data"], origin: "sample" as const })),
    quiz: s.quiz.map(([question, options, answer, explanation], i) => ({ id: `sq${sectionId}-${i}`, question, options, answer, explanation, sources: ["Sample data"], origin: "sample" as const })),
    sourceLinks: [],
    gaps: [],
  };
}
