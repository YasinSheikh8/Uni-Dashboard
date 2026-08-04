/**
 * Supplier registry.
 *
 * Adding a source is: implement `RateProvider`, register it here. Nothing else
 * in the codebase needs to change — the aggregator fans out over whatever this
 * returns, and the comparison UI renders however many quotes come back.
 */

import { AmadeusProvider } from "./amadeus";
import { FixtureProvider } from "./fixture";
import { LiteApiProvider } from "./liteapi";
import { getScraperProviders } from "./scraper/provider";
import type { RateProvider } from "./types";

let cached: RateProvider[] | null = null;

/** Sources that can actually sell a room. */
function bookableProviders(): RateProvider[] {
  const forceFixture = process.env.USE_FIXTURE_SUPPLIER === "true";

  if (!forceFixture) {
    const live = [new LiteApiProvider(), new AmadeusProvider()].filter((provider) =>
      provider.isConfigured(),
    );
    if (live.length > 0) return live;
  }

  // No credentials anywhere: two fixture suppliers, so cross-supplier matching
  // and best-price selection still run for real against disagreeing prices.
  return [
    new FixtureProvider("fixture-a", "Demo Supplier A", 1),
    new FixtureProvider("fixture-b", "Demo Supplier B", 1.07),
  ];
}

export function getProviders(): RateProvider[] {
  if (cached) return cached;

  // Scrapers are additive, never a replacement. They contribute reference
  // prices to the comparison; they can never be the source of a booking.
  cached = [...bookableProviders(), ...getScraperProviders()];
  return cached;
}

/** Test seam — forget the memoized registry after env changes. */
export function resetProviders(): void {
  cached = null;
}

export function isUsingFixtures(): boolean {
  return getProviders()
    .filter((provider) => provider.bookable)
    .every((provider) => provider.id.startsWith("fixture"));
}

/** Price-reference sources currently enabled, for UI disclosure. */
export function getReferenceProviders(): RateProvider[] {
  return getProviders().filter((provider) => !provider.bookable);
}

export function getProvider(id: string): RateProvider | undefined {
  return getProviders().find((provider) => provider.id === id);
}

export * from "./types";
