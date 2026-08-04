/**
 * Fan out to every configured supplier, collapse duplicate properties, and pick
 * the winner.
 *
 * This is the "best available price" engine. The rules that matter:
 *
 *   - Suppliers are queried in parallel and independently. One slow or broken
 *     supplier degrades the result set, it never fails the search.
 *   - Comparison is on the ALL-IN total for the whole stay, taxes and fees
 *     included. Comparing nightly headline rates is how booking sites end up
 *     "cheapest" only until checkout.
 *   - A hotel offered by several suppliers becomes one row. The saving we claim
 *     is against the next-cheapest supplier for the SAME property, which is the
 *     only honest way to state it.
 */

import { convert } from "./currency";
import { clusterHotels, clusterId } from "./match";
import { getProviders } from "./index";
import type {
  AggregatedHotel,
  AggregatedSearchResult,
  RateProvider,
  SearchDiagnostics,
  SearchQuery,
  SupplierOffer,
  SupplierQuote,
} from "./types";

/** A supplier gets this long to answer before we ship results without it. */
const SUPPLIER_TIMEOUT_MS = 9_000;

export type SortMode = "best_price" | "rating" | "stars";

interface SupplierRun {
  provider: RateProvider;
  offers: SupplierOffer[];
  diagnostics: SearchDiagnostics;
}

async function runSupplier(
  provider: RateProvider,
  query: SearchQuery,
): Promise<SupplierRun> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUPPLIER_TIMEOUT_MS);

  try {
    const offers = await provider.search(query, controller.signal);
    return {
      provider,
      offers,
      diagnostics: {
        supplier: provider.id,
        supplierLabel: provider.label,
        status: "ok",
        hotelsReturned: offers.length,
        durationMs: Date.now() - startedAt,
      },
    };
  } catch (error) {
    const aborted = controller.signal.aborted;
    return {
      provider,
      offers: [],
      diagnostics: {
        supplier: provider.id,
        supplierLabel: provider.label,
        status: aborted ? "timeout" : "error",
        hotelsReturned: 0,
        durationMs: Date.now() - startedAt,
        error: aborted
          ? `No response within ${SUPPLIER_TIMEOUT_MS}ms`
          : error instanceof Error
            ? error.message
            : String(error),
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function searchHotels(
  query: SearchQuery,
  sort: SortMode = "best_price",
  /** Test seam. Defaults to the configured registry. */
  providerOverride?: RateProvider[],
): Promise<AggregatedSearchResult> {
  const providers = providerOverride ?? getProviders();

  const runs = await Promise.all(
    providers.map((provider) => runSupplier(provider, query)),
  );

  const diagnostics = runs.map((run) => run.diagnostics);

  // Tag every offer with its provider so clustering can carry the label through.
  const tagged = runs.flatMap((run) =>
    run.offers.map((offer) => ({ ...offer, provider: run.provider })),
  );

  const clusters = clusterHotels(tagged);
  const hotels: AggregatedHotel[] = [];

  for (const cluster of clusters) {
    const quotes: SupplierQuote[] = [];

    for (const offer of cluster) {
      // Each supplier contributes its own cheapest rate for this property.
      const cheapest = offer.rates.reduce<(typeof offer.rates)[number] | null>(
        (best, rate) => (best === null || rate.totalAmount < best.totalAmount ? rate : best),
        null,
      );
      if (!cheapest) continue;

      const { amount } = convert(cheapest.totalAmount, cheapest.currency, query.currency);

      quotes.push({
        supplier: offer.provider.id,
        supplierLabel: offer.provider.label,
        supplierHotelId: offer.hotel.supplierHotelId,
        rate: cheapest,
        comparableAmount: amount,
        bookable: cheapest.bookable,
        deepLinkUrl: cheapest.deepLinkUrl,
      });
    }

    if (quotes.length === 0) continue;
    quotes.sort((a, b) => a.comparableAmount - b.comparableAmount);

    // The winner is the cheapest rate we can actually SELL. A scraped price
    // that undercuts it is real information, but it is not a booking — letting
    // it win here would hand the booking engine a rate with no token behind it.
    const bookableQuotes = quotes.filter((quote) => quote.bookable);
    const best = bookableQuotes[0] ?? null;
    const runnerUp = bookableQuotes[1];
    const savedAmount =
      best && runnerUp ? runnerUp.comparableAmount - best.comparableAmount : 0;

    // Cheapest reference quote that undercuts what we can sell.
    const cheaperElsewhere =
      quotes.find(
        (quote) =>
          !quote.bookable && (best === null || quote.comparableAmount < best.comparableAmount),
      ) ?? null;

    // Merge metadata across suppliers: prefer whichever record is richest,
    // since Amadeus has no photography and LiteAPI has no IATA context.
    const identities = cluster.map((offer) => offer.hotel);
    const withImage = identities.find((identity) => identity.imageUrl);
    const withCoords = identities.find(
      (identity) => identity.latitude != null && identity.longitude != null,
    );
    const withReviews = identities.find((identity) => identity.reviewScore != null);
    const primary =
      identities.find((identity) => identity.supplier === best?.supplier) ?? identities[0];

    hotels.push({
      id: clusterId(primary),
      name: primary.name,
      address: primary.address || (identities.find((i) => i.address)?.address ?? ""),
      city: primary.city,
      country: primary.country,
      latitude: withCoords?.latitude,
      longitude: withCoords?.longitude,
      starRating: identities.find((i) => i.starRating != null)?.starRating,
      reviewScore: withReviews?.reviewScore,
      reviewCount: withReviews?.reviewCount,
      imageUrl: withImage?.imageUrl,
      amenities: Array.from(new Set(identities.flatMap((i) => i.amenities))).slice(0, 12),
      best,
      quotes,
      savedAmount,
      cheaperElsewhere,
      currency: query.currency,
      nights: best?.rate.nights ?? quotes[0].rate.nights,
    });
  }

  sortHotels(hotels, sort);

  return {
    hotels,
    diagnostics,
    currency: query.currency,
    nights: hotels[0]?.nights ?? 1,
    suppliersQueried: diagnostics.filter((d) => d.status === "ok").length,
  };
}

function sortHotels(hotels: AggregatedHotel[], sort: SortMode): void {
  switch (sort) {
    case "rating":
      hotels.sort((a, b) => (b.reviewScore ?? 0) - (a.reviewScore ?? 0));
      break;
    case "stars":
      hotels.sort((a, b) => (b.starRating ?? 0) - (a.starRating ?? 0));
      break;
    case "best_price":
    default:
      // Referral-only rows sort on their reference price so they still land in
      // a sensible place rather than all collapsing to the bottom.
      hotels.sort((a, b) => priceOf(a) - priceOf(b));
      break;
  }
}

function priceOf(hotel: AggregatedHotel): number {
  return hotel.best?.comparableAmount ?? hotel.quotes[0]?.comparableAmount ?? Infinity;
}

/**
 * Serializable record of what every supplier quoted, stored on the booking.
 * This is what backs the "we checked N suppliers" line on the confirmation —
 * an audit trail, not a marketing string generated after the fact.
 */
export function buildPriceComparison(hotel: AggregatedHotel): string {
  return JSON.stringify({
    checkedAt: new Date().toISOString(),
    currency: hotel.currency,
    quotes: hotel.quotes.map((quote) => ({
      supplier: quote.supplier,
      label: quote.supplierLabel,
      room: quote.rate.roomName,
      refundable: quote.rate.refundable,
      bookable: quote.bookable,
      total: quote.comparableAmount,
      nativeTotal: quote.rate.totalAmount,
      nativeCurrency: quote.rate.currency,
    })),
    winner: hotel.best?.supplier ?? null,
    savedAmount: hotel.savedAmount,
  });
}
