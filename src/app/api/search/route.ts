import { NextResponse } from "next/server";
import { getSource } from "@/lib/data/source";
import { searchAll } from "@/lib/search";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 100) ?? "";
  if (q.length < 2) return NextResponse.json({ hits: [] });
  return NextResponse.json({ hits: await searchAll(await getSource(), q) });
}
