import Link from "next/link";
import { notFound } from "next/navigation";
import { aiConfigured } from "@/lib/ai/generate";
import { attempt, getSource } from "@/lib/data/source";
import { getStudyProgress, getStudySet } from "@/lib/store/user-data";
import { StudyPlayer } from "@/components/study-player";
import { Notice, ProblemState } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Study" };

export default async function StudyUnitPage({ params }: { params: Promise<{ id: string; sectionId: string }> }) {
  const p = await params;
  const source = await getSource();
  const res = await attempt(() => source.module(Number(p.id)));
  if (!res.ok) return <ProblemState problem={res.problem} />;
  const mod = res.data;
  const section = mod?.sections.find((s) => s.id === Number(p.sectionId));
  if (!mod || !section) notFound();
  const user = await source.userKey();
  const [set, progress] = await Promise.all([getStudySet(user, mod.id, section.id), getStudyProgress(user, mod.id, section.id)]);
  const demo = source.mode === "demo";
  const canGenerate = demo || aiConfigured();
  const hasAi = set?.cards.some((c) => c.origin !== "custom") || (set?.quiz.length ?? 0) > 0;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-subtle">
        <Link href="/study" className="hover:text-fg">Study</Link> <span aria-hidden>/</span>{" "}
        <Link href={`/modules/${mod.id}?tab=study`} className="hover:text-fg">{mod.code}</Link>
      </nav>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">{section.name}</h1>
        <p className="mt-1 text-sm text-muted">{mod.code} · {mod.fullName}</p>
      </header>
      {!canGenerate && (
        <div className="mb-5">
          <Notice>AI isn&apos;t set up on the server, so flashcards can&apos;t be generated from the Moodle materials. You can still add your own cards — with 4 or more you also get a quiz.</Notice>
        </div>
      )}
      <StudyPlayer
        courseId={mod.id}
        sectionId={section.id}
        cards={set?.cards ?? []}
        quiz={set?.quiz ?? []}
        progress={progress}
        canGenerate={canGenerate}
        generateLabel={demo ? "Load sample cards" : hasAi ? "Regenerate from materials" : "Generate from Moodle materials"}
        gaps={set?.gaps ?? []}
        sourceLinks={set?.sourceLinks ?? []}
      />
    </>
  );
}
