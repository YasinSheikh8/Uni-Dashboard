/**
 * Hotel loyalty programmes.
 *
 * What this does: stores a guest's membership numbers, works out which
 * programme a given hotel belongs to, and puts the membership number on the
 * reservation when we book.
 *
 * What it honestly does NOT do: guarantee points or elite benefits. Rates sold
 * through bedbanks and wholesale APIs are usually excluded from chain loyalty
 * programmes — most chains only credit stays booked direct. Passing the number
 * through still has real value (many properties will apply status perks at
 * check-in at their own discretion, and it flags the guest to the hotel), but
 * promising points for a third-party booking would be a lie. The UI says so
 * plainly rather than implying otherwise.
 *
 * Matching is primarily on brand names in the hotel's own name, because that is
 * the one field every supplier returns. Chain codes are used when a supplier
 * provides them, which is more reliable but less widely available.
 */

export interface LoyaltyProgram {
  code: string;
  name: string;
  /** Operator, shown as context when the brand is not obvious. */
  group: string;
  /** Lowercase brand tokens that appear in hotel names. */
  brands: string[];
  /** Supplier chain codes, where a supplier reports one. */
  chainCodes: string[];
  /** Rough shape of the membership number, for input validation. */
  numberPattern: RegExp;
  numberHint: string;
}

export const LOYALTY_PROGRAMS: LoyaltyProgram[] = [
  {
    code: "bonvoy",
    name: "Marriott Bonvoy",
    group: "Marriott",
    brands: [
      "marriott", "courtyard", "westin", "sheraton", "st regis", "st. regis",
      "ritz-carlton", "ritz carlton", "aloft", "moxy", "residence inn",
      "fairfield", "ac hotel", "le meridien", "le méridien", "renaissance",
      "autograph collection", "tribute portfolio", "four points", "element",
      "springhill", "towneplace", "delta hotels", "gaylord", "edition",
      "luxury collection", "w hotel",
    ],
    chainCodes: ["MC", "MD", "AK", "BR", "CY", "DE", "EB", "FP", "JW", "LC", "OX", "PR", "RC", "SI", "TO", "WH", "WI", "XR", "AL", "AR", "BG", "ET", "MV", "RI", "SH", "TX"],
    numberPattern: /^\d{8,9}$/,
    numberHint: "8 or 9 digits",
  },
  {
    code: "honors",
    name: "Hilton Honors",
    group: "Hilton",
    brands: [
      "hilton", "conrad", "waldorf astoria", "doubletree", "embassy suites",
      "hampton", "homewood suites", "home2 suites", "curio collection",
      "canopy", "tapestry collection", "tru by hilton", "lxr", "signia",
      "motto", "tempo by hilton",
    ],
    chainCodes: ["HH", "HI", "CN", "WA", "DT", "ES", "HX", "HG", "HT", "QQ", "OL", "UP", "PY"],
    numberPattern: /^\d{9,11}$/,
    numberHint: "9 to 11 digits",
  },
  {
    code: "ihg",
    name: "IHG One Rewards",
    group: "IHG",
    brands: [
      "intercontinental", "holiday inn", "crowne plaza", "kimpton",
      "hotel indigo", "staybridge", "candlewood", "even hotel", "avid",
      "voco", "regent", "six senses", "hualuxe", "atwell suites",
    ],
    chainCodes: ["IC", "HI", "CP", "KI", "IN", "SB", "CW", "EV", "VA", "RG", "UL", "YZ"],
    numberPattern: /^\d{9,12}$/,
    numberHint: "9 to 12 digits",
  },
  {
    code: "hyatt",
    name: "World of Hyatt",
    group: "Hyatt",
    brands: [
      "hyatt", "andaz", "park hyatt", "grand hyatt", "thompson hotels",
      "alila", "miraval", "caption by hyatt", "the unbound collection",
      "destination by hyatt", "jdv by hyatt",
    ],
    chainCodes: ["HY", "PH", "GH", "AN", "HR", "UC", "JD", "TS"],
    numberPattern: /^\d{6,9}$/,
    numberHint: "6 to 9 digits",
  },
  {
    code: "all",
    name: "ALL — Accor Live Limitless",
    group: "Accor",
    brands: [
      "sofitel", "pullman", "novotel", "mercure", "ibis", "raffles", "fairmont",
      "swissotel", "mgallery", "mama shelter", "25hours", "adagio", "banyan tree",
      "movenpick", "mövenpick", "grand mercure", "peppers", "tribe",
    ],
    chainCodes: ["RT", "SO", "PU", "NO", "MC", "IB", "RF", "FA", "SW", "MG", "AD", "MD"],
    numberPattern: /^[0-9A-Z]{10,16}$/i,
    numberHint: "10 to 16 characters",
  },
  {
    code: "wyndham",
    name: "Wyndham Rewards",
    group: "Wyndham",
    brands: [
      "wyndham", "ramada", "days inn", "super 8", "travelodge", "baymont",
      "la quinta", "microtel", "howard johnson", "wingate", "hawthorn",
      "trademark collection", "americinn", "dolce",
    ],
    chainCodes: ["WY", "RA", "DI", "SE", "TL", "BU", "LQ", "MT", "HJ", "WG"],
    numberPattern: /^\d{8,12}$/,
    numberHint: "8 to 12 digits",
  },
  {
    code: "choice",
    name: "Choice Privileges",
    group: "Choice Hotels",
    brands: [
      "comfort inn", "comfort suites", "quality inn", "sleep inn", "clarion",
      "cambria", "mainstay suites", "econo lodge", "rodeway inn", "ascend",
      "woodspring suites", "suburban studios",
    ],
    chainCodes: ["CI", "CC", "QI", "SZ", "CL", "CX", "MS", "EL", "RI", "AC"],
    numberPattern: /^\d{8,10}$/,
    numberHint: "8 to 10 digits",
  },
  {
    code: "radisson",
    name: "Radisson Rewards",
    group: "Radisson",
    brands: [
      "radisson", "park inn", "park plaza", "country inn", "prizeotel",
      "art'otel",
    ],
    chainCodes: ["RD", "PI", "PP", "CX", "AO"],
    numberPattern: /^\d{8,12}$/,
    numberHint: "8 to 12 digits",
  },
  {
    code: "bestwestern",
    name: "Best Western Rewards",
    group: "Best Western",
    brands: ["best western", "sadie hotel", "aiden", "glo hotel", "vib hotel", "surestay"],
    chainCodes: ["BW", "WV", "SU"],
    numberPattern: /^\d{8,12}$/,
    numberHint: "8 to 12 digits",
  },
  {
    code: "melia",
    name: "MeliáRewards",
    group: "Meliá",
    brands: ["melia", "meliá", "gran melia", "innside", "sol by melia", "paradisus"],
    chainCodes: ["ME", "SM", "IN", "PA"],
    numberPattern: /^\d{8,14}$/,
    numberHint: "8 to 14 digits",
  },
];

export function getProgram(code: string): LoyaltyProgram | undefined {
  return LOYALTY_PROGRAMS.find((program) => program.code === code);
}

/**
 * Works out which programme a hotel belongs to.
 *
 * Chain code first when the supplier gave us one, since it is unambiguous.
 * Brand-name matching is the fallback, and it is deliberately conservative:
 * a token must appear as a whole word, so "Ibis" does not match "Ibiza" and
 * "W Hotel" does not match every hotel with a W in the name.
 */
export function programForHotel(hotel: {
  name: string;
  chainCode?: string | null;
}): LoyaltyProgram | null {
  if (hotel.chainCode) {
    const upper = hotel.chainCode.toUpperCase();
    const byCode = LOYALTY_PROGRAMS.find((program) => program.chainCodes.includes(upper));
    if (byCode) return byCode;
  }

  const name = hotel.name.toLowerCase();
  for (const program of LOYALTY_PROGRAMS) {
    for (const brand of program.brands) {
      // Word-boundary match on the brand token.
      const pattern = new RegExp(`(^|[^a-z])${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`);
      if (pattern.test(name)) return program;
    }
  }

  return null;
}

export function validateMembershipNumber(
  programCode: string,
  membershipNumber: string,
): { ok: boolean; error?: string } {
  const program = getProgram(programCode);
  if (!program) return { ok: false, error: "Unknown programme" };

  const cleaned = membershipNumber.replace(/[\s-]/g, "");
  if (!cleaned) return { ok: false, error: "Enter your membership number" };
  if (!program.numberPattern.test(cleaned)) {
    return {
      ok: false,
      error: `${program.name} numbers are ${program.numberHint}`,
    };
  }
  return { ok: true };
}

export function normalizeMembershipNumber(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}
