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
import type { RateProvider } from "./types";

let cached: RateProvider[] | null = null;

export function getProviders(): RateProvider[] {
  if (cached) return cached;

  const forceFixture = process.env.USE_FIXTURE_SUPPLIER === "true";

  if (!forceFixture) {
    const live = [new LiteApiProvider(), new AmadeusProvider()].filter((provider) =>
      provider.isConfigured(),
    );
    if (live.length > 0) {
      cached = live;
      return cached;
    }
  }

  // No credentials anywhere: two fixture suppliers, so cross-supplier matching
  // and best-price selection still run for real against disagreeing prices.
  cached = [
    new FixtureProvider("fixture-a", "Demo Supplier A", 1),
    new FixtureProvider("fixture-b", "Demo Supplier B", 1.07),
  ];
  return cached;
}

/** Test seam — forget the memoized registry after env changes. */
export function resetProviders(): void {
  cached = null;
}

export function isUsingFixtures(): boolean {
  return getProviders().every((provider) => provider.id.startsWith("fixture"));
}

export function getProvider(id: string): RateProvider | undefined {
  return getProviders().find((provider) => provider.id === id);
}

export * from "./types";
