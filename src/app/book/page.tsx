import Link from "next/link";
import { redirect } from "next/navigation";
import { BookingPanel } from "@/components/BookingPanel";
import { HotelImage } from "@/components/HotelImage";
import { getCurrentUser, isInstantBookReady } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { buildPriceComparison, searchHotels } from "@/lib/suppliers/aggregator";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

interface BookParams {
  hotel?: string;
  supplier?: string;
  rate?: string;
  destination?: string;
  checkIn?: string;
  checkOut?: string;
  guests?: string;
  rooms?: string;
  currency?: string;
}

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<BookParams>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();

  if (!params.hotel || !params.checkIn || !params.checkOut || !params.destination) {
    redirect("/");
  }

  if (!user) {
    const next = `/book?${new URLSearchParams(params as Record<string, string>).toString()}`;
    redirect(`/signin?next=${encodeURIComponent(next)}`);
  }

  const currency = params.currency ?? "EUR";
  const guests = Number.parseInt(params.guests ?? "2", 10) || 2;
  const rooms = Number.parseInt(params.rooms ?? "1", 10) || 1;

  // Re-price on selection. Rates go stale in seconds, so the number on this
  // page is fetched fresh rather than carried over from the results list.
  const result = await searchHotels({
    destination: params.destination,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    adults: guests,
    rooms,
    currency,
    limit: 40,
  });

  const hotel = result.hotels.find((entry) => entry.id === params.hotel);

  if (!hotel) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-16 text-center">
        <h1 className="text-xl font-semibold">That room is gone</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
          It sold out or the rate expired while you were deciding.
        </p>
        <Link href="/search" className="btn btn-primary mt-6">
          Back to results
        </Link>
      </div>
    );
  }

  // The quote the user clicked, if it survived the re-price. Only bookable
  // quotes are eligible — a reference price has no rate to sell.
  const clicked = hotel.quotes.find(
    (quote) =>
      quote.bookable &&
      quote.supplier === params.supplier &&
      quote.rate.supplierRateId === params.rate,
  );
  const chosen = clicked ?? hotel.best;

  if (!chosen) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-16 text-center">
        <h1 className="text-xl font-semibold">We can&apos;t book this one</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
          Every price we found for {hotel.name} came from a reference source we
          can only link to, not sell.
        </p>
        <Link href="/search" className="btn btn-primary mt-6">
          Back to results
        </Link>
      </div>
    );
  }

  const priceChanged = Boolean(clicked) === false;

  const friends = await prisma.friendship.findMany({
    where: {
      status: "accepted",
      OR: [{ requesterId: user.id }, { addresseeId: user.id }],
    },
    include: {
      requester: { select: { id: true, name: true, email: true, avatarColor: true } },
      addressee: { select: { id: true, name: true, email: true, avatarColor: true } },
    },
  });

  const friendOptions = friends.map((friendship) =>
    friendship.requesterId === user.id ? friendship.addressee : friendship.requester,
  );

  const ready = isInstantBookReady(user);

  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-5 py-8 lg:grid-cols-[1.25fr_1fr]">
      <section>
        <Link href="/search" className="text-sm text-[var(--color-ink-soft)] hover:underline">
          ← Back to results
        </Link>

        <div className="card mt-4 overflow-hidden">
          <HotelImage src={hotel.imageUrl} className="h-56 w-full object-cover" />
          <div className="p-6">
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">{hotel.name}</h1>
            <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
              {hotel.address || hotel.city}
            </p>

            <dl className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <Detail label="Check in" value={params.checkIn} />
              <Detail label="Check out" value={params.checkOut} />
              <Detail label="Nights" value={String(hotel.nights)} />
              <Detail label="Guests" value={String(guests)} />
            </dl>

            <div className="mt-6 rounded-[var(--radius-control)] bg-[var(--color-surface-sunken)] p-4">
              <p className="text-sm font-semibold">{chosen.rate.roomName}</p>
              <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                {chosen.rate.boardType ?? "Room only"} ·{" "}
                {chosen.rate.refundable
                  ? `Free cancellation${
                      chosen.rate.cancellationDeadline
                        ? ` until ${new Date(chosen.rate.cancellationDeadline).toLocaleDateString()}`
                        : ""
                    }`
                  : "Non-refundable"}
              </p>
            </div>

            {priceChanged && (
              <p className="mt-4 rounded-[var(--radius-control)] bg-[var(--color-warn-soft)] px-4 py-2.5 text-xs text-[var(--color-warn)]">
                The rate you clicked is no longer available. This is the current
                cheapest rate for this hotel.
              </p>
            )}
          </div>
        </div>

      </section>

      <BookingPanel
        offer={{
          supplier: chosen.supplier,
          supplierHotelId: chosen.supplierHotelId,
          supplierRateId: chosen.rate.supplierRateId,
          hotelName: hotel.name,
          hotelAddress: hotel.address,
          hotelCity: hotel.city,
          hotelCountry: hotel.country,
          hotelImageUrl: hotel.imageUrl,
          hotelRating: hotel.reviewScore,
          chainCode: hotel.chainCode,
          roomName: chosen.rate.roomName,
          checkIn: params.checkIn,
          checkOut: params.checkOut,
          guests,
          rooms,
          currency: hotel.currency,
          totalAmount: chosen.comparableAmount,
          priceComparison: buildPriceComparison(hotel),
          savedAmount: hotel.savedAmount,
        }}
        currentUser={{ id: user.id, name: user.name, email: user.email }}
        friends={friendOptions}
        instantReady={ready}
        taxesAndFees={chosen.rate.taxesAndFees}
      />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
