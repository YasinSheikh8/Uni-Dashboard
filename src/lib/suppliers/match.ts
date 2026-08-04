/**
 * Cross-supplier hotel matching.
 *
 * LiteAPI and Amadeus assign completely different ids to the same building, so
 * "best price across suppliers" is only meaningful once we can tell that
 * LiteAPI's `lp1a2b3` and Amadeus's `MCLONGHM` are the same Marriott. Get this
 * wrong in one direction and you show the same hotel twice; wrong in the other
 * and you claim a saving between two different properties.
 *
 * Strategy, in order of confidence:
 *   1. Both have coordinates and sit within ~150m of each other, and their
 *      names are at least loosely similar  -> same hotel.
 *   2. No usable coordinates -> same city and a high name similarity.
 */

import type { HotelIdentity } from "./types";

const NOISE_WORDS = new Set([
  "hotel", "hotels", "the", "a", "an", "and", "by", "at", "of", "de", "la",
  "le", "el", "resort", "resorts", "spa", "inn", "suites", "suite", "apartments",
  "apartment", "residence", "residences", "collection", "boutique", "hostel",
  "guesthouse", "house", "lodge", "motel", "b&b", "bnb",
]);

export function normalizeName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0 && !NOISE_WORDS.has(token))
    .join(" ")
    .trim();
}

/** Dice coefficient over character bigrams. 0 = nothing alike, 1 = identical. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigrams = (s: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const gram = s.slice(i, i + 2);
      out.set(gram, (out.get(gram) ?? 0) + 1);
    }
    return out;
  };

  const left = bigrams(a);
  const right = bigrams(b);
  let intersection = 0;
  let leftTotal = 0;
  let rightTotal = 0;

  for (const count of left.values()) leftTotal += count;
  for (const count of right.values()) rightTotal += count;
  for (const [gram, count] of left) {
    const other = right.get(gram);
    if (other) intersection += Math.min(count, other);
  }

  return (2 * intersection) / (leftTotal + rightTotal);
}

/** Great-circle distance in metres. */
export function distanceMetres(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const SAME_BUILDING_METRES = 150;
/** Two hotels 40m apart with names this similar are the same place. */
const CO_LOCATED_NAME_THRESHOLD = 0.45;
/** With no coordinates to lean on, the name has to carry the whole decision. */
const NAME_ONLY_THRESHOLD = 0.86;

export function isSameHotel(a: HotelIdentity, b: HotelIdentity): boolean {
  const nameA = normalizeName(a.name);
  const nameB = normalizeName(b.name);
  const nameScore = similarity(nameA, nameB);

  const hasCoords =
    a.latitude != null && a.longitude != null &&
    b.latitude != null && b.longitude != null;

  if (hasCoords) {
    const metres = distanceMetres(a.latitude!, a.longitude!, b.latitude!, b.longitude!);
    if (metres > SAME_BUILDING_METRES) return false;
    // Same address can host two genuinely different properties (a Hilton and a
    // Hampton in one complex), so proximity alone is not enough.
    return nameScore >= CO_LOCATED_NAME_THRESHOLD;
  }

  if (normalizeName(a.city) !== normalizeName(b.city)) return false;
  return nameScore >= NAME_ONLY_THRESHOLD;
}

/**
 * Groups offers from every supplier into clusters that each represent one
 * real hotel. Linear scan against existing cluster heads — fine for the
 * few-hundred-hotel result sets these APIs return.
 */
export function clusterHotels<T extends { hotel: HotelIdentity }>(
  items: T[],
): T[][] {
  const clusters: T[][] = [];

  for (const item of items) {
    const existing = clusters.find((cluster) =>
      cluster.some((member) => isSameHotel(member.hotel, item.hotel)),
    );
    if (existing) existing.push(item);
    else clusters.push([item]);
  }

  return clusters;
}

/** Deterministic id for a cluster, stable across searches. */
export function clusterId(hotel: HotelIdentity): string {
  const base = `${normalizeName(hotel.name)}|${normalizeName(hotel.city)}`;
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    hash = (hash << 5) - hash + base.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
