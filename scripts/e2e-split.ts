/**
 * End-to-end exercise of the money path against the real database.
 *
 * Walks the whole hybrid flow: organizer books and is charged their share, a
 * backstop hold covers the friends, one friend pays, one never answers, and
 * settlement captures the shortfall from the organizer and releases the rest.
 *
 * Run with:
 *   node --env-file=.env --import tsx --conditions=react-server scripts/e2e-split.ts
 */

import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";
import { createBooking } from "../src/lib/booking";
import { getCurrentUser } from "../src/lib/auth";
import { formatMoney } from "../src/lib/money";
import {
  BACKSTOP_STATUS,
  PARTICIPANT_STATUS,
  authorizeParticipantShare,
  settleBooking,
} from "../src/lib/split";
import { hashPassword } from "../src/lib/auth";

type User = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

async function makeUser(email: string, name: string, withCard: boolean): Promise<User> {
  await prisma.user.deleteMany({ where: { email } });

  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: await hashPassword("password123"),
      stripeCustomerId: `cus_test_${name.toLowerCase()}`,
      profile: {
        create: { firstName: name, lastName: "Tester", phone: "+351000000000" },
      },
      ...(withCard
        ? {
            paymentMethods: {
              create: {
                stripePaymentMethodId: `pm_test_${name.toLowerCase()}`,
                brand: "visa",
                last4: "4242",
                expMonth: 12,
                expYear: 2030,
                isDefault: true,
              },
            },
          }
        : {}),
    },
    include: { profile: true, paymentMethods: true },
  });

  return user;
}

async function main() {
  const organizer = await makeUser("organizer@test.local", "Ana", true);
  const payer = await makeUser("payer@test.local", "Bruno", true);
  const ghost = await makeUser("ghost@test.local", "Cleo", true);

  const total = 90_000; // €900.00

  const { bookingId } = await createBooking(
    organizer,
    {
      supplier: "fixture-a",
      supplierHotelId: "fixture-a-fx-lisbon-1",
      supplierRateId: "fixture-a|fx-lisbon-1|0|2026-09-10",
      hotelName: "Bairro Alto Hotel",
      hotelAddress: "Praça Luís de Camões 2",
      hotelCity: "Lisbon",
      hotelCountry: "PT",
      roomName: "Classic double",
      checkIn: "2026-09-10",
      checkOut: "2026-09-13",
      guests: 3,
      rooms: 1,
      currency: "EUR",
      totalAmount: total,
    },
    [
      { email: payer.email, name: payer.name, userId: payer.id },
      { email: ghost.email, name: ghost.name, userId: ghost.id },
    ],
  );

  console.log(`\nBooking ${bookingId} created.`);

  const afterBooking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { participants: true },
  });

  const shares = afterBooking.participants.map((p) => p.shareAmount);
  assert.equal(
    shares.reduce((sum, share) => sum + share, 0),
    total,
    "shares must sum to the booking total",
  );
  console.log(
    "  shares:",
    afterBooking.participants
      .map((p) => `${p.name ?? p.email} ${formatMoney(p.shareAmount, "EUR")} (${p.status})`)
      .join(", "),
  );

  assert.equal(afterBooking.status, "confirmed", "booking should be confirmed immediately");

  const organizerParticipant = afterBooking.participants.find((p) => p.role === "organizer")!;
  assert.equal(
    organizerParticipant.status,
    PARTICIPANT_STATUS.CAPTURED,
    "organizer's own share is captured at booking time",
  );

  const friendsTotal = total - organizerParticipant.shareAmount;
  assert.equal(afterBooking.backstopAmount, friendsTotal, "backstop covers all friend shares");
  assert.equal(afterBooking.backstopStatus, BACKSTOP_STATUS.AUTHORIZED);
  console.log(
    `  organizer charged ${formatMoney(organizerParticipant.shareAmount, "EUR")}, ` +
      `${formatMoney(afterBooking.backstopAmount, "EUR")} held as backstop`,
  );

  // Bruno pays. Cleo never answers.
  const payerParticipant = afterBooking.participants.find((p) => p.userId === payer.id)!;
  const accepted = await authorizeParticipantShare(payerParticipant.id);
  assert.equal(accepted.status, PARTICIPANT_STATUS.AUTHORIZED);
  console.log(`  ${payer.name} authorized ${formatMoney(payerParticipant.shareAmount, "EUR")}`);

  // Deadline hits with Cleo still silent.
  const settlement = await settleBooking(bookingId);
  console.log(
    `\nSettled: friends ${formatMoney(settlement.capturedFromFriends, "EUR")}, ` +
      `organizer backstop ${formatMoney(settlement.capturedFromOrganizer, "EUR")}, ` +
      `released ${formatMoney(settlement.releasedFromBackstop, "EUR")}`,
  );

  const ghostParticipant = afterBooking.participants.find((p) => p.userId === ghost.id)!;

  assert.equal(
    settlement.capturedFromFriends,
    payerParticipant.shareAmount,
    "the friend who paid is captured for exactly their share",
  );
  assert.equal(
    settlement.capturedFromOrganizer,
    ghostParticipant.shareAmount,
    "organizer covers exactly the no-show's share",
  );
  assert.equal(
    settlement.releasedFromBackstop,
    afterBooking.backstopAmount - ghostParticipant.shareAmount,
    "the rest of the backstop hold is released",
  );

  // The books must balance: every cent of the total is accounted for.
  const collected =
    organizerParticipant.shareAmount +
    settlement.capturedFromFriends +
    settlement.capturedFromOrganizer;
  assert.equal(collected, total, "collected must equal the booking total");
  console.log(`  collected ${formatMoney(collected, "EUR")} of ${formatMoney(total, "EUR")} ✓`);

  const final = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { participants: true },
  });
  assert.equal(final.status, "settled");
  assert.equal(final.backstopStatus, BACKSTOP_STATUS.CAPTURED);
  assert.equal(
    final.participants.find((p) => p.userId === ghost.id)?.status,
    PARTICIPANT_STATUS.COVERED_BY_ORGANIZER,
  );

  // Settlement must be safe to run twice — the deadline sweep and the
  // "everyone accepted" path can both fire.
  const second = await settleBooking(bookingId);
  assert.equal(second.capturedFromFriends, 0);
  assert.equal(second.capturedFromOrganizer, 0);
  console.log("  re-running settlement is a no-op ✓");

  console.log("\nAll assertions passed.\n");
}

main()
  .catch((error) => {
    console.error("\nFAILED:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
