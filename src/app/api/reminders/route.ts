import { NextResponse } from "next/server";
import { getSource } from "@/lib/data/source";
import { formatDateTime, relativeTo } from "@/lib/time";

export async function GET(req: Request) {
  const hours = Math.min(168, Math.max(1, Number(new URL(req.url).searchParams.get("hours") ?? 24)));
  const source = await getSource();
  const now = Date.now();
  const list = await source.assessments().catch(() => []);
  const items = list
    .filter((a) => !a.done && a.dueAt && a.dueAt > now && a.dueAt - now <= hours * 3_600_000)
    .map((a) => ({
      key: `${a.key}-${a.dueAt}`,
      title: `${a.moduleCode}: ${a.title}`,
      when: `${a.kind === "quiz" ? "Closes" : "Due"} ${formatDateTime(a.dueAt!)} (${relativeTo(a.dueAt!, now)})`,
      href: `/assessments/${a.key}`,
    }));
  return NextResponse.json({ items });
}
