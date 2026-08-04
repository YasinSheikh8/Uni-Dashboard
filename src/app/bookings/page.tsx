import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { HotelImage } from "@/components/HotelImage";
import { prisma } from "@/lib/db";
import { isMe, participantIdentity } from "@/lib/participants";
import { formatMoney } from "@/lib/money";
import { PARTICIPANT_STATUS } from "@/lib/split";

export const dynamic = "force-dynamic";

export default async function BookingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?next=/bookings");

  // Trips you organized plus trips you were invited to split.
  const bookings = await prisma.booking.findMany({
    where: {
      OR: [
        { organizerId: user.id },
        { participants: { some: participantIdentity(user) } },
      ],
    },
    include: { participants: true },
    orderBy: { checkIn: "asc" },
  });

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">Trips</h1>

      {bookings.length === 0 ? (
        <div className="card mt-6 p-10 text-center">
          <p className="text-sm text-[var(--color-ink-soft)]">Nothing booked yet.</p>
          <Link href="/" className="btn btn-primary mt-5">
            Find a stay
          </Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {bookings.map((booking) => {
            const mine = booking.participants.find((participant) =>
              isMe(participant, user),
            );
            const awaitingYou =
              mine?.role === "friend" && mine.status === PARTICIPANT_STATUS.PENDING;

            return (
              <li key={booking.id}>
                <Link
                  href={`/bookings/${booking.id}`}
                  className="card flex items-center gap-4 p-4 transition-colors hover:bg-[var(--color-surface-sunken)]"
                >
                  <HotelImage
                    src={booking.hotelImageUrl}
                    className="h-16 w-16 shrink-0 rounded-[var(--radius-control)] object-cover"
                  />

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{booking.hotelName}</p>
                    <p className="mt-0.5 text-sm text-[var(--color-ink-soft)]">
                      {booking.checkIn.toISOString().slice(0, 10)} →{" "}
                      {booking.checkOut.toISOString().slice(0, 10)} · {booking.hotelCity}
                    </p>
                    <p className="mt-1 text-xs text-[var(--color-ink-faint)]">
                      {booking.participants.length > 1
                        ? `Split ${booking.participants.length} ways`
                        : "Just you"}
                      {" · "}
                      {booking.status.replace(/_/g, " ")}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="tabular font-semibold">
                      {formatMoney(mine?.shareAmount ?? booking.totalAmount, booking.currency)}
                    </p>
                    {awaitingYou && <span className="pill pill-warn mt-1">Your turn</span>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
