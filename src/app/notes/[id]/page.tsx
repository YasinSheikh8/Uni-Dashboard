import Link from "next/link";
import { notFound } from "next/navigation";
import { attempt, getSource } from "@/lib/data/source";
import { getNote } from "@/lib/store/user-data";
import { formatDateTime } from "@/lib/time";
import { NoteEditor } from "@/components/note-editor";
import { AiTag, ExternalLink, Notice } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const source = await getSource();
  const note = await getNote(await source.userKey(), id);
  if (!note) notFound();
  const mods = await attempt(() => source.modules());
  const modules = (mods.ok ? mods.data : []).map((m) => ({ id: m.id, code: m.code, name: m.fullName }));
  const mod = modules.find((m) => m.id === note.courseId);
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-subtle">
        <Link href="/notes" className="hover:text-fg">Notes</Link>
        {mod && (
          <>
            {" "}<span aria-hidden>/</span>{" "}
            <Link href={`/modules/${mod.id}?tab=notes`} className="hover:text-fg">{mod.code}</Link>
          </>
        )}
      </nav>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-subtle">
        {note.origin === "ai" && <AiTag label={note.editedByUser ? "AI-generated · edited by you" : "AI-generated"} />}
        <span>Created {formatDateTime(note.createdAt)} · Updated {formatDateTime(note.updatedAt)}</span>
      </div>
      {note.origin === "ai" && (
        <div className="mb-4">
          <Notice tone="accent" title="Made by AI from your Moodle materials">
            It may contain mistakes or miss things the lecturer said. Each point cites its source ([S1], [S2]…) — check them before relying on it.
            {note.sources && note.sources.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {note.sources.map((s, i) => (
                  <li key={i}>
                    <ExternalLink href={s.url}>[S{i + 1}] {s.title}</ExternalLink>
                  </li>
                ))}
              </ul>
            )}
          </Notice>
        </div>
      )}
      <NoteEditor
        modules={modules}
        startInPreview
        note={{ id: note.id, title: note.title, body: note.body, courseId: note.courseId ?? null, week: note.week ?? null, lecture: note.lecture ?? null, topic: note.topic ?? null, tags: note.tags, pinned: note.pinned }}
      />
    </>
  );
}
