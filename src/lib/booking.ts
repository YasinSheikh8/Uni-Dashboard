/**
 * Booking engine — where inventory and money meet.
 *
 * Sequence, and the reasoning behind the order:
 *
 *   1. Persist the booking as pending_payment, so there is a row to reconcile
 *      against if anything below dies halfway.
 *   2. Authorize the organizer's own share AND the friends' backstop. Holds
 *      only — nothing is captured yet.
 *   3. Ask the supplier to sell the room.
 *   4. Only once the supplier confirms, capture the organizer's share and leave
 *      the backstop held until settlement.
 *
 * Authorizing before selling is the important part. If the supplier rejects the
 * rate (they go stale in seconds) we release the holds and the guest was never
 * charged. If we captured first we would be issuing refunds for rooms that
 * never existed.
 */

import "server-only";

import { prisma } from "./db";
import { getPaymentGateway } from "./payments";
import { getProvider } from "./suppliers";
import { nightsBetween } from "./suppliers/liteapi";
import {
  BACKSTOP_STATUS,
  BOOKING_STATUS,
  PARTICIPANT_STATUS,
  computeShares,
  settlementDeadline,
  type ShareInput,
} from "./split";
import type { CurrentUser } from "./auth";

export interface BookingOffer {
  supplier: string;
  supplierHotelId: string;
  supplierRateId: string;
  hotelName: string;
  hotelAddress: string;
  hotelCity: string;
  hotelCountry: string;
  hotelImageUrl?: string;
  hotelRating?: number;
  roomName: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  rooms: number;
  currency: string;
  totalAmount: number;
  priceComparison?: string;
  savedAmount?: number;
}

export class BookingError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "BookingError";
  }
}

export async function createBooking(
  user: CurrentUser,
  offer: BookingOffer,
  friends: ShareInput[],
): Promise<{ bookingId: string }> {
  const gateway = getPaymentGateway();

  const profile = user.profile;
  if (!profile) {
    throw new BookingError("Complete your traveler profile before booking");
  }

  const card =
    user.paymentMethods.find((method) => method.isDefault) ?? user.paymentMethods[0];
  if (!card) throw new BookingError("Add a card before booking");

  const customerId = await gateway.ensureCustomer(
    user.id,
    user.email,
    user.name,
    user.stripeCustomerId,
  );
  if (customerId !== user.stripeCustomerId) {
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customerId },
    });
  }

  const shares = computeShares(
    offer.totalAmount,
    { email: user.email, name: user.name, userId: user.id },
    friends,
  );
  const organizerShare = shares.find((share) => share.role === "organizer")!;
  const friendShares = shares.filter((share) => share.role === "friend");
  const backstopAmount = friendShares.reduce((sum, share) => sum + share.amount, 0);

  const nights = nightsBetween(offer.checkIn, offer.checkOut);

  const booking = await prisma.booking.create({
    data: {
      organizerId: user.id,
      status: BOOKING_STATUS.PENDING_PAYMENT,
      supplier: offer.supplier,
      supplierHotelId: offer.supplierHotelId,
      supplierRateId: offer.supplierRateId,
      hotelName: offer.hotelName,
      hotelAddress: offer.hotelAddress,
      hotelCity: offer.hotelCity,
      hotelCountry: offer.hotelCountry,
      hotelImageUrl: offer.hotelImageUrl,
      hotelRating: offer.hotelRating,
      roomName: offer.roomName,
      checkIn: new Date(`${offer.checkIn}T00:00:00Z`),
      checkOut: new Date(`${offer.checkOut}T00:00:00Z`),
      nights,
      guests: offer.guests,
      rooms: offer.rooms,
      currency: offer.currency,
      totalAmount: offer.totalAmount,
      priceComparison: offer.priceComparison,
      savedAmount: offer.savedAmount,
      backstopAmount,
      settlementDeadline: friendShares.length > 0 ? settlementDeadline() : null,
      participants: {
        create: shares.map((share) => ({
          userId: share.userId ?? null,
          email: share.email,
          name: share.name,
          role: share.role,
          shareAmount: share.amount,
          status: PARTICIPANT_STATUS.PENDING,
        })),
      },
    },
    include: { participants: true },
  });

  let organizerIntentId: string | null = null;
  let backstopIntentId: string | null = null;

  try {
    // --- Step 2: hold the organizer's money -------------------------------
    const organizerIntent = await gateway.authorize({
      customerId,
      paymentMethodId: card.stripePaymentMethodId,
      amount: organizerShare.amount,
      currency: offer.currency,
      description: `${offer.hotelName} — your share`,
      metadata: { bookingId: booking.id, kind: "organizer_share" },
    });
    organizerIntentId = organizerIntent.id;

    if (backstopAmount > 0) {
      const backstopIntent = await gateway.authorize({
        customerId,
        paymentMethodId: card.stripePaymentMethodId,
        amount: backstopAmount,
        currency: offer.currency,
        description: `${offer.hotelName} — guarantee for friends' shares`,
        metadata: { bookingId: booking.id, kind: "backstop" },
      });
      backstopIntentId = backstopIntent.id;
    }

    // --- Step 3: sell the room --------------------------------------------
    const provider = getProvider(offer.supplier);
    if (!provider) throw new BookingError(`Unknown supplier: ${offer.supplier}`);

    // Belt and braces. The aggregator already refuses to make a non-bookable
    // quote the winner, but a crafted request could name a scrape source
    // directly, and a scraped price has no rate token to sell against.
    if (!provider.bookable) {
      throw new BookingError(
        `${provider.label} is a price-reference source and cannot be booked`,
      );
    }

    const result = await provider.book({
      supplierRateId: offer.supplierRateId,
      supplierHotelId: offer.supplierHotelId,
      checkIn: offer.checkIn,
      checkOut: offer.checkOut,
      holder: {
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: user.email,
        phone: profile.phone,
      },
      guests: [{ firstName: profile.firstName, lastName: profile.lastName }],
      clientReference: booking.id,
    });

    // --- Step 4: take the organizer's share, keep the backstop held --------
    await gateway.capture(organizerIntentId, organizerShare.amount);

    const organizerParticipant = booking.participants.find(
      (participant) => participant.role === "organizer",
    )!;

    await prisma.$transaction([
      prisma.bookingParticipant.update({
        where: { id: organizerParticipant.id },
        data: {
          status: PARTICIPANT_STATUS.CAPTURED,
          stripePaymentIntentId: organizerIntentId,
          respondedAt: new Date(),
        },
      }),
      prisma.booking.update({
        where: { id: booking.id },
        data: {
          status: BOOKING_STATUS.CONFIRMED,
          supplierBookingRef: result.supplierBookingRef,
          confirmationCode: result.confirmationCode,
          backstopPaymentIntentId: backstopIntentId,
          backstopStatus: backstopIntentId
            ? BACKSTOP_STATUS.AUTHORIZED
            : BACKSTOP_STATUS.NONE,
        },
      }),
    ]);

    return { bookingId: booking.id };
  } catch (error) {
    // Release every hold we placed. The guest is not charged for a booking
    // that did not happen.
    for (const intentId of [organizerIntentId, backstopIntentId]) {
      if (!intentId) continue;
      try {
        await gateway.release(intentId);
      } catch (releaseError) {
        // Log loudly: an unreleased hold is real money frozen on a real card.
        console.error(`Failed to release hold ${intentId}:`, releaseError);
      }
    }

    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: BOOKING_STATUS.FAILED },
    });

    throw new BookingError(
      error instanceof Error ? error.message : "Booking failed",
      error,
    );
  }
}
