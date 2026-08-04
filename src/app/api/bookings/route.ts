import { NextResponse } from "next/server";
import { z } from "zod";
import { UnauthorizedError, requireUser } from "@/lib/auth";
import { BookingError, createBooking } from "@/lib/booking";

const offerSchema = z.object({
  supplier: z.string().min(1),
  supplierHotelId: z.string().min(1),
  supplierRateId: z.string().min(1),
  hotelName: z.string().min(1),
  hotelAddress: z.string(),
  hotelCity: z.string(),
  hotelCountry: z.string(),
  hotelImageUrl: z.string().optional(),
  hotelRating: z.number().optional(),
  chainCode: z.string().optional(),
  roomName: z.string(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guests: z.number().int().positive(),
  rooms: z.number().int().positive(),
  currency: z.string().length(3),
  totalAmount: z.number().int().positive(),
  priceComparison: z.string().optional(),
  savedAmount: z.number().int().nonnegative().optional(),
});

const bodySchema = z.object({
  offer: offerSchema,
  friends: z
    .array(
      z.object({
        email: z.string().email(),
        name: z.string().optional(),
        userId: z.string().optional(),
        amount: z.number().int().positive().optional(),
      }),
    )
    .max(15)
    .default([]),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = bodySchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid booking request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { offer, friends } = parsed.data;

    if (Date.parse(offer.checkOut) <= Date.parse(offer.checkIn)) {
      return NextResponse.json(
        { error: "Check-out must be after check-in" },
        { status: 400 },
      );
    }

    // Deduplicate and drop the organizer if they invited themselves. An
    // organizer with no email cannot collide with an invited address.
    const seen = new Set<string>(user.email ? [user.email.toLowerCase()] : []);
    const uniqueFriends = friends.filter((friend) => {
      const email = friend.email.toLowerCase();
      if (seen.has(email)) return false;
      seen.add(email);
      return true;
    });

    const { bookingId } = await createBooking(user, offer, uniqueFriends);
    return NextResponse.json({ bookingId }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Sign in to book" }, { status: 401 });
    }
    if (error instanceof BookingError) {
      return NextResponse.json({ error: error.message }, { status: 402 });
    }
    console.error("Booking failed:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
