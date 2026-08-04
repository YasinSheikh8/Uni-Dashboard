/**
 * Structured-data extraction.
 *
 * Prices are read from the schema.org JSON-LD that travel sites publish for
 * search engines, not by pattern-matching rendered markup. Two reasons: it is
 * the data the site intends machines to read, and it survives redesigns that
 * would break a CSS-selector scraper on the first deploy.
 *
 * Everything here is defensive. Publishers disagree about whether `offers` is
 * an object or an array, whether prices are numbers or strings, and whether
 * `@graph` wraps everything, so each shape is handled rather than assumed.
 */

import { toMinorUnits } from "../../money";

export interface ScrapedOffer {
  name: string;
  address?: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  starRating?: number;
  reviewScore?: number;
  reviewCount?: number;
  imageUrl?: string;
  /** Minor units. */
  totalAmount: number;
  currency: string;
  url?: string;
  roomName?: string;
}

type Json = Record<string, unknown>;

const SCRIPT_PATTERN =
  /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

export function extractJsonLdBlocks(html: string): Json[] {
  const found: Json[] = [];

  for (const match of html.matchAll(SCRIPT_PATTERN)) {
    const raw = match[1]?.trim();
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw) as unknown;
      collect(parsed, found);
    } catch {
      // One malformed block must not discard the rest of the page.
    }
  }

  return found;
}

function collect(node: unknown, sink: Json[]): void {
  if (Array.isArray(node)) {
    for (const entry of node) collect(entry, sink);
    return;
  }
  if (!node || typeof node !== "object") return;

  const record = node as Json;
  sink.push(record);

  // @graph is the common wrapper for multi-entity pages.
  if (Array.isArray(record["@graph"])) collect(record["@graph"], sink);
  // ItemList pages nest each hotel inside a ListItem.
  if (Array.isArray(record.itemListElement)) collect(record.itemListElement, sink);
  if (record.item) collect(record.item, sink);
}

function typeOf(node: Json): string[] {
  const value = node["@type"];
  if (typeof value === "string") return [value.toLowerCase()];
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.toLowerCase());
  }
  return [];
}

const LODGING_TYPES = new Set([
  "hotel", "lodgingbusiness", "resort", "motel", "bedandbreakfast",
  "hostel", "apartment", "accommodation", "campground",
]);

function text(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return undefined;
}

function numeric(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function firstOffer(node: Json): Json | null {
  const offers = node.offers;
  if (!offers) return null;
  if (Array.isArray(offers)) {
    // Cheapest offer on the listing.
    const priced = offers
      .filter((entry): entry is Json => Boolean(entry) && typeof entry === "object")
      .map((entry) => ({ entry, price: numeric(entry.price ?? entry.lowPrice) ?? Infinity }))
      .sort((a, b) => a.price - b.price);
    return priced[0]?.entry ?? null;
  }
  if (typeof offers === "object") return offers as Json;
  return null;
}

function addressOf(node: Json): { line?: string; city?: string; country?: string } {
  const address = node.address;
  if (typeof address === "string") return { line: address };
  if (!address || typeof address !== "object") return {};

  const record = address as Json;
  return {
    line: text(record.streetAddress),
    city: text(record.addressLocality) ?? text(record.addressRegion),
    country: text(record.addressCountry) ?? undefined,
  };
}

function imageOf(node: Json): string | undefined {
  const image = node.image;
  if (typeof image === "string") return image;
  if (Array.isArray(image)) {
    const first = image.find((entry) => typeof entry === "string");
    if (typeof first === "string") return first;
    const object = image.find((entry) => entry && typeof entry === "object") as Json | undefined;
    return object ? text(object.url) : undefined;
  }
  if (image && typeof image === "object") return text((image as Json).url);
  return undefined;
}

/**
 * Turns one page of HTML into scraped offers. `nights` is needed because
 * schema.org prices on listing pages are usually per night, not per stay.
 */
export function offersFromHtml(
  html: string,
  options: { nights: number; currencyFallback: string; baseUrl?: string },
): ScrapedOffer[] {
  const blocks = extractJsonLdBlocks(html);
  const offers: ScrapedOffer[] = [];
  const seen = new Set<string>();

  for (const block of blocks) {
    const types = typeOf(block);
    if (!types.some((type) => LODGING_TYPES.has(type))) continue;

    const name = text(block.name);
    if (!name) continue;

    const offer = firstOffer(block);
    if (!offer) continue;

    const rawPrice =
      numeric(offer.price) ??
      numeric(offer.lowPrice) ??
      numeric((offer.priceSpecification as Json | undefined)?.price);
    if (rawPrice == null || rawPrice <= 0) continue;

    const currency =
      text(offer.priceCurrency) ??
      text((offer.priceSpecification as Json | undefined)?.priceCurrency) ??
      options.currencyFallback;

    // Listing prices are nightly unless the offer says otherwise.
    const isTotal =
      text(offer.description)?.toLowerCase().includes("total") ??
      false;
    const perStay = isTotal ? rawPrice : rawPrice * options.nights;

    const key = `${name}|${rawPrice}|${currency}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const address = addressOf(block);
    const geo = block.geo as Json | undefined;
    const rating = block.aggregateRating as Json | undefined;
    const starRating = numeric(
      (block.starRating as Json | undefined)?.ratingValue ?? block.starRating,
    );

    let url = text(offer.url) ?? text(block.url);
    if (url && options.baseUrl) {
      try {
        url = new URL(url, options.baseUrl).toString();
      } catch {
        url = undefined;
      }
    }

    offers.push({
      name,
      address: address.line,
      city: address.city,
      country: address.country,
      latitude: numeric(geo?.latitude),
      longitude: numeric(geo?.longitude),
      starRating: starRating != null && starRating <= 5 ? starRating : undefined,
      reviewScore: normalizeRating(
        numeric(rating?.ratingValue),
        numeric(rating?.bestRating),
      ),
      reviewCount: numeric(rating?.reviewCount) ?? numeric(rating?.ratingCount),
      imageUrl: imageOf(block),
      totalAmount: toMinorUnits(perStay, currency),
      currency,
      url,
      roomName: text(offer.name),
    });
  }

  return offers;
}

/** Publishers use /5 and /10 scales interchangeably; our UI shows /10. */
function normalizeRating(value?: number, best?: number): number | undefined {
  if (value == null) return undefined;
  const scale = best ?? (value <= 5 ? 5 : 10);
  return Math.round((value / scale) * 10 * 10) / 10;
}
