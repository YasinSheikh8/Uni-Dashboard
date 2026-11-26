import { NextResponse } from "next/server";
import { z } from "zod";
import { getSource } from "@/lib/data/source";
import { bad, sameOrigin } from "@/lib/http";
import { ChecklistItemSchema, getChecklist, saveChecklist } from "@/lib/store/user-data";

const Body = z.object({ items: z.array(ChecklistItemSchema).max(60) });

export async function PUT(req: Request, { params }: { params: Promise<{ key: string }> }) {
  if (!sameOrigin(req)) return bad("Forbidden", 403);
  const key = (await params).key;
  if (!/^(assign|quiz|event)-\d+$/.test(key)) return bad("Unknown assessment", 404);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Invalid checklist");
  const source = await getSource();
  const user = await source.userKey();
  const prev = await getChecklist(user, key);
  await saveChecklist(user, key, { ...prev, items: parsed.data.items, updatedAt: Date.now() });
  return NextResponse.json({ ok: true });
}
