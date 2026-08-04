/**
 * Settlement sweep.
 *
 * Captures friends' authorized shares and charges the organizer's backstop for
 * anything nobody paid, for every booking past its deadline.
 *
 * This MUST run on a schedule — card authorizations expire after about seven
 * days, and an expired hold is money you cannot collect. Hourly is plenty:
 *
 *   0 * * * *  cd /path/to/app && npm run settle
 *
 * On Vercel or Netlify, wire the same call to a scheduled function instead.
 */

import { settleDueBookings } from "../src/lib/split";
import { formatMoney } from "../src/lib/money";

async function main() {
  const started = Date.now();
  const results = await settleDueBookings();

  if (results.length === 0) {
    console.log("Nothing due for settlement.");
    return;
  }

  for (const result of results) {
    console.log(
      [
        `booking ${result.bookingId}:`,
        `friends ${formatMoney(result.capturedFromFriends, result.currency)}`,
        `organizer ${formatMoney(result.capturedFromOrganizer, result.currency)}`,
        `released ${formatMoney(result.releasedFromBackstop, result.currency)}`,
      ].join(" "),
    );
  }

  console.log(`Settled ${results.length} booking(s) in ${Date.now() - started}ms.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import("../src/lib/db");
    await prisma.$disconnect();
  });
