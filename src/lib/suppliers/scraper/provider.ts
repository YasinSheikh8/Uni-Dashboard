/**
 * Price-signal scraper.
 *
 * This is a comparison source, NOT a supplier. It reads publicly published
 * schema.org pricing off a target's search pages and contributes those numbers
 * to the comparison so the user can see when our bookable rate is not actually
 * the cheapest on the internet. `bookable` is false and `book()` throws — a
 * scraped price has no rate token behind it and cannot be sold.
 *
 * Operational rules, all enforced rather than documented:
 *   - Disabled unless SCRAPER_ENABLED=true. Nothing scrapes by default.
 *   - robots.txt is fetched and honoured per target, fail-closed.
 *   - Requests to a host are serialized with a minimum gap, taking whichever is
 *     larger: the site's crawl-delay or ours.
 *   - Results are cached, so repeated searches do not repeat requests.
 *   - Identifiable User-Agent with a contact URL.
 *
 * Worth being clear-eyed about: scraping a booking site's search results is
 * very likely against its terms of service regardless of how politely it is
 * done, the markup can change without notice, and the prices are not
 * transactable. Treat this as a signal for your own pricing, not as inventory.
 */

import { nightsBetween } from "../liteapi";
import { offersFromHtml, type ScrapedOffer } from "./jsonld";
import { mayFetch, USER_AGENT } from "./robots";
import { paced } from "./throttle";
import type {
  BookingRequest,
  BookingResult,
  HotelIdentity,
  RateProvider,
  RateQuote,
  SearchQuery,
  SupplierOffer,
} from "../types";

export interface ScrapeTarget {
  id: string;
  label: string;
  /** Builds the public search URL for a query. */
  buildUrl(query: SearchQuery): string;
  /** Used when a page omits priceCurrency. */
  currencyFallback: string;
}

/**
 * Built-in targets. These are URL templates only — whether you are permitted to
 * fetch them is between you and the site's terms, and robots.txt is checked at
 * request time either way.
 */
export const TARGETS: Record<string, ScrapeTarget> = {
  booking: {
    id: "booking",
    label: "Booking.com",
    currencyFallback: "EUR",
    buildUrl: (query) => {
      const params = new URLSearchParams({
        ss: query.destination,
        checkin: query.checkIn,
        checkout: query.checkOut,
        group_adults: String(query.adults),
        no_rooms: String(query.rooms),
        selected_currency: query.currency,
      });
      return `https://www.booking.com/searchresults.html?${params.toString()}`;
    },
  },
  hotels: {
    id: "hotels",
    label: "Hotels.com",
    currencyFallback: "USD",
    buildUrl: (query) => {
      const params = new URLSearchParams({
        "q-destination": query.destination,
        "q-check-in": query.checkIn,
        "q-check-out": query.checkOut,
        "q-rooms": String(query.rooms),
      });
      return `https://www.hotels.com/search.do?${params.toString()}`;
    },
  },
};

const CACHE_TTL_MS = Number.parseInt(process.env.SCRAPER_CACHE_TTL_MS ?? "900000", 10);
const cache = new Map<string, { offers: ScrapedOffer[]; fetchedAt: number }>();

export class ScraperProvider implements RateProvider {
  readonly bookable = false;

  constructor(
    private readonly target: ScrapeTarget,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get id(): string {
    return `scrape:${this.target.id}`;
  }

  get label(): string {
    return `${this.target.label} (reference)`;
  }

  isConfigured(): boolean {
    return process.env.SCRAPER_ENABLED === "true";
  }

  async search(query: SearchQuery, signal?: AbortSignal): Promise<SupplierOffer[]> {
    const url = this.target.buildUrl(query);
    const nights = nightsBetween(query.checkIn, query.checkOut);

    const cacheKey = `${this.target.id}|${url}`;
    const cached = cache.get(cacheKey);
    const offers =
      cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS
        ? cached.offers
        : await this.fetchOffers(url, nights, query, signal);

    if (!cached || Date.now() - cached.fetchedAt >= CACHE_TTL_MS) {
      cache.set(cacheKey, { offers, fetchedAt: Date.now() });
    }

    return offers.map((offer, index) => this.toSupplierOffer(offer, index, nights, query));
  }

  private async fetchOffers(
    url: string,
    nights: number,
    query: SearchQuery,
    signal?: AbortSignal,
  ): Promise<ScrapedOffer[]> {
    const permission = await mayFetch(url, this.fetchImpl);
    if (!permission.allowed) {
      throw new Error(`${this.target.label}: ${permission.reason}`);
    }

    const host = new URL(url).host;

    const html = await paced(host, permission.crawlDelayMs, async () => {
      const response = await this.fetchImpl(url, {
        signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en",
        },
        redirect: "follow",
      });

      if (!response.ok) {
        throw new Error(`${this.target.label} responded ${response.status}`);
      }
      return response.text();
    });

    return offersFromHtml(html, {
      nights,
      currencyFallback: query.currency || this.target.currencyFallback,
      baseUrl: url,
    });
  }

  private toSupplierOffer(
    offer: ScrapedOffer,
    index: number,
    nights: number,
    query: SearchQuery,
  ): SupplierOffer {
    const hotel: HotelIdentity = {
      supplier: this.id,
      supplierHotelId: `${this.target.id}-${index}`,
      name: offer.name,
      address: offer.address ?? "",
      city: offer.city ?? query.destination,
      country: offer.country ?? query.countryCode ?? "",
      latitude: offer.latitude,
      longitude: offer.longitude,
      starRating: offer.starRating,
      reviewScore: offer.reviewScore,
      reviewCount: offer.reviewCount,
      imageUrl: offer.imageUrl,
      amenities: [],
    };

    const rate: RateQuote = {
      supplier: this.id,
      // Deliberately not a rate token. Nothing can be booked with this.
      supplierRateId: "",
      roomName: offer.roomName ?? "Listed price",
      refundable: false,
      currency: offer.currency,
      totalAmount: offer.totalAmount,
      // Scraped listing prices rarely break out taxes.
      taxesAndFees: 0,
      nights,
      bookable: false,
      deepLinkUrl: offer.url,
    };

    return { hotel, rates: [rate] };
  }

  async book(_request: BookingRequest): Promise<BookingResult> {
    throw new Error(
      `${this.label} is a price-reference source and cannot be booked against. ` +
        "This is a bug: the booking engine should never select a non-bookable rate.",
    );
  }
}

/** Builds providers for whichever targets SCRAPER_TARGETS names. */
export function getScraperProviders(fetchImpl: typeof fetch = fetch): ScraperProvider[] {
  if (process.env.SCRAPER_ENABLED !== "true") return [];

  const requested = (process.env.SCRAPER_TARGETS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return requested
    .map((id) => TARGETS[id])
    .filter((target): target is ScrapeTarget => Boolean(target))
    .map((target) => new ScraperProvider(target, fetchImpl));
}

export function resetScraperCache(): void {
  cache.clear();
}
