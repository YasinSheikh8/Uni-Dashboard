import { NextResponse } from "next/server";
import { getSource } from "@/lib/data/source";
import { bad, sameOrigin } from "@/lib/http";
import { NoteInputSchema, deleteNote, updateNote } from "@/lib/store/user-data";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Ctx) {
  if (!sameOrigin(req)) return bad("Forbidden", 403);
  const parsed = NoteInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Invalid note");
  const source = await getSource();
  const note = await updateNote(await source.userKey(), (await params).id, parsed.data);
  return note ? NextResponse.json({ note }) : bad("Note not found", 404);
}

export async function DELETE(req: Request, { params }: Ctx) {
  if (!sameOrigin(req)) return bad("Forbidden", 403);
  const source = await getSource();
  return (await deleteNote(await source.userKey(), (await params).id)) ? NextResponse.json({ ok: true }) : bad("Note not found", 404);
}
