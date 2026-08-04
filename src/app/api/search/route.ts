import { NextResponse } from "next/server";
import { z } from "zod";
import { searchHotels, type SortMode } from "@/lib/suppliers/aggregator";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  destination: z.string().min(1),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guests: z.coerce.number().int().positive().max(12).default(2),
  rooms: z.coerce.number().int().positive().max(6).default(1),
  currency: z.string().length(3).default("EUR"),
  countryCode: z.string().length(2).optional(),
  sort: z.enum(["best_price", "rating", "stars"]).default("best_price"),
  limit: z.coerce.number().int().positive().max(100).default(40),
});

/**
 * Same aggregation the web app uses, exposed as JSON. This is the seam a
 * mobile client would build against — the web pages call `searchHotels`
 * directly rather than round-tripping through here.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid search", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const query = parsed.data;
  if (Date.parse(query.checkOut) <= Date.parse(query.checkIn)) {
    return NextResponse.json(
      { error: "Check-out must be after check-in" },
      { status: 400 },
    );
  }

  try {
    const result = await searchHotels(
      {
        destination: query.destination,
        countryCode: query.countryCode,
        checkIn: query.checkIn,
        checkOut: query.checkOut,
        adults: query.guests,
        rooms: query.rooms,
        currency: query.currency,
        limit: query.limit,
      },
      query.sort as SortMode,
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Search failed:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
