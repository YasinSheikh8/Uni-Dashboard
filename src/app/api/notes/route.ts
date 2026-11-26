import { NextResponse } from "next/server";
import { getSource } from "@/lib/data/source";
import { bad, sameOrigin } from "@/lib/http";
import { NoteInputSchema, createNote, listNotes } from "@/lib/store/user-data";

export async function GET() {
  const source = await getSource();
  return NextResponse.json({ notes: await listNotes(await source.userKey()) });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return bad("Forbidden", 403);
  const parsed = NoteInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Invalid note");
  const source = await getSource();
  const note = await createNote(await source.userKey(), parsed.data);
  return NextResponse.json({ note }, { status: 201 });
}
