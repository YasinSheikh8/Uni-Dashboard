import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { HotelImage } from "@/components/HotelImage";
import { ShareActions } from "@/components/ShareActions";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isMe } from "@/lib/participants";
import { formatMoney } from "@/lib/money";
import { PARTICIPANT_STATUS } from "@/lib/split";

export const dynamic = "force-dynamic";

const STATUS_COPY: Record<string, { label: string; className: string }> = {
  [PARTICIPANT_STATUS.PENDING]: { label: "Waiting", className: "pill-muted" },
  [PARTICIPANT_STATUS.AUTHORIZED]: { label: "Held", className: "pill-save" },
  [PARTICIPANT_STATUS.CAPTURED]: { label: "Paid", className: "pill-save" },
  [PARTICIPANT_STATUS.DECLINED]: { label: "Declined", className: "pill-danger" },
  [PARTICIPANT_STATUS.FAILED]: { label: "Card failed", className: "pill-danger" },
  [PARTICIPANT_STATUS.COVERED_BY_ORGANIZER]: {
    label: "Covered by organizer",
    className: "pill-warn",
  },
};

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/signin?next=/bookings/${id}`);

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { participants: { orderBy: { role: "asc" } }, organizer: true },
  });

  if (!booking) notFound();

  const mine = booking.participants.find((participant) => isMe(participant, user));
  const isOrganizer = booking.organizerId === user.id;
  if (!mine && !isOrganizer) notFound();

  const awaitingYou =
    mine?.role === "friend" && mine.status === PARTICIPANT_STATUS.PENDING;

  const collected = booking.participants
    .filter((participant) =>
      [PARTICIPANT_STATUS.CAPTURED, PARTICIPANT_STATUS.AUTHORIZED].includes(
        participant.status as never,
      ),
    )
    .reduce((sum, participant) => sum + participant.shareAmount, 0);

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/bookings" className="text-sm text-[var(--color-ink-soft)] hover:underline">
        ← Trips
      </Link>

      <div className="card mt-4 overflow-hidden">
        <HotelImage src={booking.hotelImageUrl} className="h-48 w-full object-cover" />
        <div className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-[-0.02em]">
                {booking.hotelName}
              </h1>
              <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                {booking.hotelAddress || booking.hotelCity}
              </p>
            </div>
            <span className="pill pill-muted capitalize">
              {booking.status.replace(/_/g, " ")}
            </span>
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <Detail label="Check in" value={booking.checkIn.toISOString().slice(0, 10)} />
            <Detail label="Check out" value={booking.checkOut.toISOString().slice(0, 10)} />
            <Detail label="Room" value={booking.roomName} />
            <Detail
              label="Confirmation"
              value={booking.confirmationCode ?? "—"}
            />
          </dl>

          <div className="mt-6 flex items-baseline justify-between border-t border-[var(--color-border)] pt-4">
            <span className="text-sm text-[var(--color-ink-soft)]">Trip total</span>
            <span className="tabular text-xl font-semibold">
              {formatMoney(booking.totalAmount, booking.currency)}
            </span>
          </div>

          {booking.savedAmount != null && booking.savedAmount > 0 && (
            <p className="mt-2 text-right text-xs text-[var(--color-save)]">
              {formatMoney(booking.savedAmount, booking.currency)} less than the next supplier
            </p>
          )}
        </div>
      </div>

      {awaitingYou && mine && (
        <div className="mt-4">
          <ShareActions
            bookingId={booking.id}
            amount={formatMoney(mine.shareAmount, booking.currency)}
          />
        </div>
      )}

      <div className="card mt-4 p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Who&apos;s paying</h2>
          <span className="text-xs text-[var(--color-ink-faint)]">
            {formatMoney(collected, booking.currency)} of{" "}
            {formatMoney(booking.totalAmount, booking.currency)} secured
          </span>
        </div>

        <ul className="mt-4 space-y-2.5">
          {booking.participants.map((participant) => {
            const status = STATUS_COPY[participant.status] ?? {
              label: participant.status,
              className: "pill-muted",
            };
            return (
              <li key={participant.id} className="flex items-center gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {participant.name ?? participant.email ?? "Guest"}
                  {participant.role === "organizer" && (
                    <span className="ml-2 text-xs text-[var(--color-ink-faint)]">organizer</span>
                  )}
                </span>
                <span className={`pill ${status.className}`}>{status.label}</span>
                <span className="tabular w-20 shrink-0 text-right font-medium">
                  {formatMoney(participant.shareAmount, booking.currency)}
                </span>
              </li>
            );
          })}
        </ul>

        {isOrganizer && booking.backstopAmount > 0 && (
          <p className="mt-5 rounded-[var(--radius-control)] bg-[var(--color-surface-sunken)] px-4 py-3 text-xs leading-relaxed text-[var(--color-ink-soft)]">
            <strong className="font-semibold text-[var(--color-ink)]">
              {formatMoney(booking.backstopAmount, booking.currency)} held on your card
            </strong>{" "}
            as the guarantee for everyone else&apos;s shares. It is released as they pay.
            {booking.settlementDeadline && (
              <>
                {" "}
                Anything still unpaid on{" "}
                {booking.settlementDeadline.toISOString().slice(0, 10)} is charged to you and
                the rest of the hold is released.
              </>
            )}
            {booking.backstopStatus === "released" && " Fully released — everyone paid."}
            {booking.backstopStatus === "captured" &&
              " Partially captured to cover shares nobody paid."}
          </p>
        )}
      </div>

    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}
