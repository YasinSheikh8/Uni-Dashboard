/**
 * Hybrid split-payment engine.
 *
 * The model, in one paragraph: the organizer's card guarantees the whole
 * booking the moment it is made, so the room is never lost while friends think
 * about it. The organizer's own share is captured immediately. The friends'
 * portion is held as a single backstop authorization on the organizer's card.
 * As each friend accepts, their own share is authorized on their own card. At
 * settlement we capture the friends who accepted, capture only the SHORTFALL
 * from the organizer's backstop, and release the rest of it.
 *
 * Why a backstop rather than just billing the organizer later: an
 * authorization proves the funds exist at booking time. Discovering three days
 * later that the organizer cannot cover a no-show friend is how you end up
 * eating the cost of a confirmed room.
 *
 * The constraint that shapes everything: card authorizations expire in about
 * seven days. SPLIT_SETTLEMENT_HOURS must stay comfortably under that, and
 * `settleDueBookings` has to actually run on a schedule — an expired hold is an
 * uncollectible one.
 */

import "server-only";

import { prisma } from "./db";
import { getPaymentGateway } from "./payments";
import { splitEqually, splitEvenly } from "./money";

export const PARTICIPANT_STATUS = {
  PENDING: "pending",
  AUTHORIZED: "authorized",
  CAPTURED: "captured",
  DECLINED: "declined",
  FAILED: "failed",
  COVERED_BY_ORGANIZER: "covered_by_organizer",
} as const;

export const BOOKING_STATUS = {
  PENDING_PAYMENT: "pending_payment",
  CONFIRMED: "confirmed",
  SETTLING: "settling",
  SETTLED: "settled",
  CANCELLED: "cancelled",
  FAILED: "failed",
} as const;

export const BACKSTOP_STATUS = {
  NONE: "none",
  AUTHORIZED: "authorized",
  CAPTURED: "captured",
  RELEASED: "released",
  FAILED: "failed",
} as const;

export interface ShareInput {
  /** Null for participants with no email — they are identified by userId. */
  email: string | null;
  name?: string;
  userId?: string | null;
  /** Omit for an equal split; provide to weight or fix a person's amount. */
  amount?: number;
}

export interface ComputedShare extends ShareInput {
  amount: number;
  role: "organizer" | "friend";
}

/**
 * Turns a guest list into exact integer shares summing to `total`.
 *
 * Explicit amounts are honoured; whoever is left splits the remainder evenly.
 * Throws rather than silently rebalancing if the explicit amounts already
 * exceed the total — a split that does not add up is a bug, not a rounding
 * question.
 */
export function computeShares(
  total: number,
  organizer: ShareInput,
  friends: ShareInput[],
): ComputedShare[] {
  const everyone: Array<ShareInput & { role: "organizer" | "friend" }> = [
    { ...organizer, role: "organizer" },
    ...friends.map((friend) => ({ ...friend, role: "friend" as const })),
  ];

  const fixed = everyone.filter((person) => person.amount != null);
  const flexible = everyone.filter((person) => person.amount == null);

  const fixedTotal = fixed.reduce((sum, person) => sum + (person.amount ?? 0), 0);
  if (fixedTotal > total) {
    throw new Error(
      `Fixed shares (${fixedTotal}) exceed the booking total (${total})`,
    );
  }

  if (flexible.length === 0) {
    if (fixedTotal !== total) {
      throw new Error(`Shares total ${fixedTotal} but the booking costs ${total}`);
    }
    return everyone.map((person) => ({ ...person, amount: person.amount! }));
  }

  const remainderShares = splitEqually(total - fixedTotal, flexible.length);
  const byPerson = new Map<ShareInput, number>();
  flexible.forEach((person, index) => byPerson.set(person, remainderShares[index]));

  return everyone.map((person) => ({
    ...person,
    amount: person.amount ?? byPerson.get(person) ?? 0,
  }));
}

/** Weighted variant, e.g. one person taking a double room. */
export function computeWeightedShares(total: number, weights: number[]): number[] {
  return splitEvenly(total, weights);
}

export function settlementDeadline(from = new Date()): Date {
  const hours = Number.parseInt(process.env.SPLIT_SETTLEMENT_HOURS ?? "72", 10);
  // Hard ceiling: card authorizations die at ~7 days, so never schedule past 6.
  const safeHours = Math.min(Number.isFinite(hours) ? hours : 72, 144);
  return new Date(from.getTime() + safeHours * 3_600_000);
}

interface AcceptResult {
  status: string;
  paymentIntentId?: string;
  error?: string;
}

/**
 * A friend accepts their share: authorize (not capture) on their own card.
 * Capture happens at settlement, so nobody is charged for a booking that later
 * falls apart.
 */
export async function authorizeParticipantShare(
  participantId: string,
): Promise<AcceptResult> {
  const gateway = getPaymentGateway();

  const participant = await prisma.bookingParticipant.findUnique({
    where: { id: participantId },
    include: {
      booking: true,
      user: { include: { paymentMethods: true } },
    },
  });

  if (!participant) throw new Error("Participant not found");
  if (participant.status === PARTICIPANT_STATUS.AUTHORIZED ||
      participant.status === PARTICIPANT_STATUS.CAPTURED) {
    return { status: participant.status, paymentIntentId: participant.stripePaymentIntentId ?? undefined };
  }

  const user = participant.user;
  if (!user) throw new Error("Participant has not signed up yet");

  const card =
    user.paymentMethods.find((method) => method.isDefault) ?? user.paymentMethods[0];
  if (!card) throw new Error("No saved card on this account");
  if (!user.stripeCustomerId) throw new Error("No payment profile on this account");

  try {
    const intent = await gateway.authorize({
      customerId: user.stripeCustomerId,
      paymentMethodId: card.stripePaymentMethodId,
      amount: participant.shareAmount,
      currency: participant.booking.currency,
      description: `Share of ${participant.booking.hotelName}`,
      metadata: {
        bookingId: participant.bookingId,
        participantId: participant.id,
        kind: "participant_share",
      },
    });

    await prisma.bookingParticipant.update({
      where: { id: participant.id },
      data: {
        status: PARTICIPANT_STATUS.AUTHORIZED,
        stripePaymentIntentId: intent.id,
        respondedAt: new Date(),
      },
    });

    return { status: PARTICIPANT_STATUS.AUTHORIZED, paymentIntentId: intent.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.bookingParticipant.update({
      where: { id: participant.id },
      data: { status: PARTICIPANT_STATUS.FAILED, respondedAt: new Date() },
    });
    // Not fatal for the booking — the organizer's backstop absorbs it.
    return { status: PARTICIPANT_STATUS.FAILED, error: message };
  }
}

export async function declineParticipantShare(participantId: string): Promise<void> {
  await prisma.bookingParticipant.update({
    where: { id: participantId },
    data: { status: PARTICIPANT_STATUS.DECLINED, respondedAt: new Date() },
  });
}

export interface SettlementSummary {
  bookingId: string;
  capturedFromFriends: number;
  capturedFromOrganizer: number;
  releasedFromBackstop: number;
  currency: string;
}

/**
 * Final money movement for a booking.
 *
 * Safe to call more than once — participants already captured are skipped and a
 * spent backstop is not touched again. That matters because this runs from both
 * the "everyone has accepted" path and the deadline sweep, which can race.
 */
export async function settleBooking(bookingId: string): Promise<SettlementSummary> {
  const gateway = getPaymentGateway();

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { participants: true },
  });
  if (!booking) throw new Error("Booking not found");

  if (booking.status === BOOKING_STATUS.SETTLED) {
    return {
      bookingId,
      capturedFromFriends: 0,
      capturedFromOrganizer: 0,
      releasedFromBackstop: 0,
      currency: booking.currency,
    };
  }

  await prisma.booking.update({
    where: { id: bookingId },
    data: { status: BOOKING_STATUS.SETTLING },
  });

  let capturedFromFriends = 0;
  let shortfall = 0;

  for (const participant of booking.participants) {
    if (participant.role === "organizer") continue;

    if (participant.status === PARTICIPANT_STATUS.AUTHORIZED && participant.stripePaymentIntentId) {
      try {
        await gateway.capture(participant.stripePaymentIntentId, participant.shareAmount);
        await prisma.bookingParticipant.update({
          where: { id: participant.id },
          data: { status: PARTICIPANT_STATUS.CAPTURED },
        });
        capturedFromFriends += participant.shareAmount;
      } catch {
        // Hold expired or the card died between authorize and capture.
        await prisma.bookingParticipant.update({
          where: { id: participant.id },
          data: { status: PARTICIPANT_STATUS.COVERED_BY_ORGANIZER },
        });
        shortfall += participant.shareAmount;
      }
      continue;
    }

    if (participant.status === PARTICIPANT_STATUS.CAPTURED) continue;

    // Pending, declined or failed: the organizer is on the hook.
    await prisma.bookingParticipant.update({
      where: { id: participant.id },
      data: { status: PARTICIPANT_STATUS.COVERED_BY_ORGANIZER },
    });
    shortfall += participant.shareAmount;
  }

  let capturedFromOrganizer = 0;
  let releasedFromBackstop = 0;

  if (
    booking.backstopPaymentIntentId &&
    booking.backstopStatus === BACKSTOP_STATUS.AUTHORIZED
  ) {
    if (shortfall > 0) {
      // Partial capture takes the shortfall and releases the balance of the
      // hold in the same call.
      await gateway.capture(booking.backstopPaymentIntentId, shortfall);
      capturedFromOrganizer = shortfall;
      releasedFromBackstop = booking.backstopAmount - shortfall;
      await prisma.booking.update({
        where: { id: bookingId },
        data: { backstopStatus: BACKSTOP_STATUS.CAPTURED },
      });
    } else {
      await gateway.release(booking.backstopPaymentIntentId);
      releasedFromBackstop = booking.backstopAmount;
      await prisma.booking.update({
        where: { id: bookingId },
        data: { backstopStatus: BACKSTOP_STATUS.RELEASED },
      });
    }
  }

  await prisma.booking.update({
    where: { id: bookingId },
    data: { status: BOOKING_STATUS.SETTLED, settledAt: new Date() },
  });

  return {
    bookingId,
    capturedFromFriends,
    capturedFromOrganizer,
    releasedFromBackstop,
    currency: booking.currency,
  };
}

/** True once no friend is still deciding. */
export async function isReadyToSettle(bookingId: string): Promise<boolean> {
  const pending = await prisma.bookingParticipant.count({
    where: {
      bookingId,
      role: "friend",
      status: PARTICIPANT_STATUS.PENDING,
    },
  });
  return pending === 0;
}

/**
 * Deadline sweep. Run this on a schedule (cron, Vercel/Netlify scheduled
 * function, whatever) — `npm run settle`. Without it, holds expire and the
 * money is simply not collectible.
 */
export async function settleDueBookings(now = new Date()): Promise<SettlementSummary[]> {
  const due = await prisma.booking.findMany({
    where: {
      status: BOOKING_STATUS.CONFIRMED,
      settlementDeadline: { lte: now },
    },
    select: { id: true },
  });

  const results: SettlementSummary[] = [];
  for (const booking of due) {
    try {
      results.push(await settleBooking(booking.id));
    } catch (error) {
      console.error(`Settlement failed for ${booking.id}:`, error);
    }
  }
  return results;
}
