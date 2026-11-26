import Link from "next/link";
import { attempt, getSource } from "@/lib/data/source";
import { NoteEditor } from "@/components/note-editor";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "New note" };

export default async function NewNotePage({ searchParams }: { searchParams: Promise<{ course?: string; week?: string; topic?: string }> }) {
  const sp = await searchParams;
  const source = await getSource();
  const mods = await attempt(() => source.modules());
  const modules = (mods.ok ? mods.data : []).map((m) => ({ id: m.id, code: m.code, name: m.fullName }));
  const courseId = sp.course && modules.some((m) => String(m.id) === sp.course) ? Number(sp.course) : null;
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-subtle">
        <Link href="/notes" className="hover:text-fg">Notes</Link> <span aria-hidden>/</span> New
      </nav>
      <PageHeader title="New note" />
      <NoteEditor
        modules={modules}
        note={{ title: "", body: "", courseId, week: sp.week ? Number(sp.week) : null, topic: sp.topic?.slice(0, 200) ?? null, tags: [] }}
      />
    </>
  );
}
