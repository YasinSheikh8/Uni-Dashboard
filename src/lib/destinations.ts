/**
 * Turns what someone types into a location a supplier will accept.
 *
 * This exists because suppliers do not accept a bare city name. LiteAPI wants
 * cityName AND countryCode (or coordinates, or hotel ids); Amadeus wants an
 * IATA city code. Sending "Lisbon" on its own is an incomplete location and the
 * request is rejected — which is exactly how a working integration ends up
 * looking like "the supplier didn't respond".
 *
 * Resolution order, most reliable first:
 *   1. An explicit country in the text: "Lisbon, PT" or "Lisbon, Portugal".
 *   2. A built-in table of major travel cities.
 *   3. Give up and return the city alone, so callers can decide what to do
 *      rather than being handed a wrong country.
 *
 * A built-in table rather than a geocoding API on purpose: it needs no key, no
 * network call on the hot path, and no third-party outage in the middle of a
 * search. It covers the destinations people actually type; anything outside it
 * falls back to asking for the country, which is better than guessing wrong and
 * quietly searching another continent.
 */

export interface ResolvedDestination {
  /** City name as the supplier should receive it. */
  city: string;
  /** ISO 3166-1 alpha-2, when we could work it out. */
  countryCode?: string;
  /** How it was resolved, for diagnostics. */
  source: "explicit" | "known-city" | "unresolved";
}

/** ISO alpha-2 by lowercased country name and common aliases. */
const COUNTRY_NAMES: Record<string, string> = {
  portugal: "PT", spain: "ES", france: "FR", italy: "IT", germany: "DE",
  netherlands: "NL", holland: "NL", belgium: "BE", austria: "AT",
  switzerland: "CH", "czech republic": "CZ", czechia: "CZ", poland: "PL",
  hungary: "HU", greece: "GR", croatia: "HR", ireland: "IE", denmark: "DK",
  sweden: "SE", norway: "NO", finland: "FI", iceland: "IS", turkey: "TR",
  "united kingdom": "GB", uk: "GB", england: "GB", scotland: "GB",
  "united states": "US", usa: "US", "united states of america": "US",
  canada: "CA", mexico: "MX", brazil: "BR", argentina: "AR", chile: "CL",
  colombia: "CO", peru: "PE", japan: "JP", china: "CN", "hong kong": "HK",
  singapore: "SG", thailand: "TH", vietnam: "VN", indonesia: "ID",
  malaysia: "MY", philippines: "PH", "south korea": "KR", korea: "KR",
  india: "IN", australia: "AU", "new zealand": "NZ", "south africa": "ZA",
  egypt: "EG", morocco: "MA", "united arab emirates": "AE", uae: "AE",
  "saudi arabia": "SA", qatar: "QA", israel: "IL",
};

/**
 * Major travel destinations. Keyed by lowercased city name.
 * Not exhaustive by design — it covers what people type, and anything missing
 * degrades to asking rather than to a wrong answer.
 */
const CITY_COUNTRIES: Record<string, string> = {
  // Europe
  lisbon: "PT", lisboa: "PT", porto: "PT", faro: "PT", madeira: "PT",
  madrid: "ES", barcelona: "ES", seville: "ES", sevilla: "ES", valencia: "ES",
  malaga: "ES", ibiza: "ES", palma: "ES", bilbao: "ES", granada: "ES",
  paris: "FR", nice: "FR", lyon: "FR", marseille: "FR", bordeaux: "FR",
  cannes: "FR", toulouse: "FR", strasbourg: "FR",
  rome: "IT", roma: "IT", milan: "IT", milano: "IT", venice: "IT",
  venezia: "IT", florence: "IT", firenze: "IT", naples: "IT", napoli: "IT",
  turin: "IT", bologna: "IT", verona: "IT", palermo: "IT",
  berlin: "DE", munich: "DE", münchen: "DE", hamburg: "DE", frankfurt: "DE",
  cologne: "DE", köln: "DE", düsseldorf: "DE", dusseldorf: "DE",
  stuttgart: "DE", dresden: "DE",
  amsterdam: "NL", rotterdam: "NL", "the hague": "NL", utrecht: "NL",
  brussels: "BE", bruges: "BE", antwerp: "BE", ghent: "BE",
  vienna: "AT", salzburg: "AT", innsbruck: "AT",
  zurich: "CH", geneva: "CH", basel: "CH", lucerne: "CH", interlaken: "CH",
  prague: "CZ", praha: "CZ", warsaw: "PL", krakow: "PL", kraków: "PL",
  budapest: "HU", athens: "GR", santorini: "GR", mykonos: "GR",
  thessaloniki: "GR", crete: "GR", rhodes: "GR",
  dubrovnik: "HR", split: "HR", zagreb: "HR",
  dublin: "IE", cork: "IE", galway: "IE",
  copenhagen: "DK", stockholm: "SE", gothenburg: "SE", oslo: "NO",
  bergen: "NO", helsinki: "FI", reykjavik: "IS", reykjavík: "IS",
  istanbul: "TR", antalya: "TR", cappadocia: "TR", izmir: "TR",
  london: "GB", manchester: "GB", edinburgh: "GB", glasgow: "GB",
  liverpool: "GB", birmingham: "GB", bristol: "GB", bath: "GB",
  oxford: "GB", cambridge: "GB", brighton: "GB", belfast: "GB",
  cardiff: "GB", leeds: "GB", newcastle: "GB", york: "GB",

  // Americas
  "new york": "US", "los angeles": "US", "san francisco": "US", chicago: "US",
  miami: "US", "las vegas": "US", boston: "US", seattle: "US", denver: "US",
  austin: "US", "new orleans": "US", nashville: "US", orlando: "US",
  "san diego": "US", washington: "US", philadelphia: "US", atlanta: "US",
  honolulu: "US", portland: "US", phoenix: "US", dallas: "US", houston: "US",
  toronto: "CA", vancouver: "CA", montreal: "CA", quebec: "CA", calgary: "CA",
  "mexico city": "MX", cancun: "MX", cancún: "MX", "playa del carmen": "MX",
  tulum: "MX", guadalajara: "MX", "cabo san lucas": "MX",
  "rio de janeiro": "BR", "sao paulo": "BR", "são paulo": "BR",
  "buenos aires": "AR", santiago: "CL", bogota: "CO", bogotá: "CO",
  cartagena: "CO", medellin: "CO", medellín: "CO", lima: "PE", cusco: "PE",

  // Asia Pacific
  tokyo: "JP", kyoto: "JP", osaka: "JP", hokkaido: "JP", sapporo: "JP",
  fukuoka: "JP", hiroshima: "JP", nagoya: "JP",
  beijing: "CN", shanghai: "CN", shenzhen: "CN", guangzhou: "CN",
  "hong kong": "HK", singapore: "SG",
  bangkok: "TH", phuket: "TH", "chiang mai": "TH", krabi: "TH", pattaya: "TH",
  hanoi: "VN", "ho chi minh city": "VN", "da nang": "VN", "hoi an": "VN",
  bali: "ID", jakarta: "ID", ubud: "ID", seminyak: "ID",
  "kuala lumpur": "MY", penang: "MY", manila: "PH", cebu: "PH",
  seoul: "KR", busan: "KR",
  delhi: "IN", "new delhi": "IN", mumbai: "IN", bangalore: "IN", goa: "IN",
  jaipur: "IN", chennai: "IN", kolkata: "IN",
  sydney: "AU", melbourne: "AU", brisbane: "AU", perth: "AU", adelaide: "AU",
  "gold coast": "AU", cairns: "AU",
  auckland: "NZ", queenstown: "NZ", wellington: "NZ", christchurch: "NZ",

  // Africa and Middle East
  "cape town": "ZA", johannesburg: "ZA", durban: "ZA",
  cairo: "EG", "sharm el sheikh": "EG", hurghada: "EG", luxor: "EG",
  marrakech: "MA", marrakesh: "MA", casablanca: "MA", fes: "MA",
  dubai: "AE", "abu dhabi": "AE", riyadh: "SA", jeddah: "SA", doha: "QA",
  "tel aviv": "IL", jerusalem: "IL",
};

/** Uppercase ISO alpha-2 codes, so "PT" in the input is recognised as a country. */
const ISO_CODES = new Set(Object.values(COUNTRY_NAMES));

export function resolveDestination(input: string): ResolvedDestination {
  const trimmed = input.trim();
  if (!trimmed) return { city: "", source: "unresolved" };

  // 1. Explicit country after a comma: "Lisbon, PT" / "Lisbon, Portugal".
  const parts = trimmed.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const tail = parts[parts.length - 1];
    const city = parts.slice(0, -1).join(", ");

    if (tail.length === 2 && ISO_CODES.has(tail.toUpperCase())) {
      return { city, countryCode: tail.toUpperCase(), source: "explicit" };
    }

    const named = COUNTRY_NAMES[tail.toLowerCase()];
    if (named) return { city, countryCode: named, source: "explicit" };

    // A trailing segment we do not recognise is probably a region
    // ("Brooklyn, New York"), so fall through and try the leading city.
  }

  // 2. Known city.
  const cityOnly = parts[0] ?? trimmed;
  const known = CITY_COUNTRIES[cityOnly.toLowerCase()];
  if (known) return { city: cityOnly, countryCode: known, source: "known-city" };

  // 3. Unresolved — the caller decides, rather than us guessing a country.
  return { city: cityOnly, source: "unresolved" };
}

/** Suggestions shown when we cannot resolve a country. */
export function suggestionsFor(input: string): string[] {
  const needle = input.trim().toLowerCase();
  if (needle.length < 2) return [];

  return Object.keys(CITY_COUNTRIES)
    .filter((city) => city.startsWith(needle))
    .slice(0, 5)
    .map((city) => {
      const titled = city.replace(/(^|\s)\w/g, (char) => char.toUpperCase());
      return `${titled}, ${CITY_COUNTRIES[city]}`;
    });
}
