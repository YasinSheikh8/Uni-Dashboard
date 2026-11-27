import { NextResponse } from "next/server";
import { z } from "zod";
import { getSource } from "@/lib/data/source";
import { bad, sameOrigin } from "@/lib/http";
import { getSettings, saveSettings } from "@/lib/store/user-data";

const Body = z.object({ courseId: z.number().int(), hidden: z.boolean() });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return bad("Forbidden", 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Invalid request");
  const source = await getSource();
  const all = await source.allModules();
  if (!all.some((m) => m.id === parsed.data.courseId)) return bad("Module not found", 404);
  const user = await source.userKey();
  const s = await getSettings(user);
  const set = new Set(s.hiddenModules ?? []);
  if (parsed.data.hidden) set.add(parsed.data.courseId);
  else set.delete(parsed.data.courseId);
  await saveSettings(user, { ...s, hiddenModules: [...set] });
  return NextResponse.json({ hiddenModules: [...set] });
}
