/**
 * Currency normalization for cross-supplier comparison.
 *
 * Primary defence is that we ask every supplier to quote in the search
 * currency — both LiteAPI and Amadeus honour a currency parameter, so in the
 * common case no conversion happens at all and `convert` is a no-op.
 *
 * This table only exists for the case where a supplier ignores the request and
 * answers in the property's local currency. Rates are indicative, NOT live.
 * Comparing a converted quote against a native one at stale rates can flip a
 * ranking, so `wasConverted` is surfaced in the comparison UI rather than
 * hidden. Before this goes anywhere near production money, replace this with a
 * real FX feed (ECB daily reference rates are free) behind the same interface.
 */

const RATES_PER_USD: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 157,
  CHF: 0.88,
  CAD: 1.36,
  AUD: 1.52,
  NZD: 1.64,
  SEK: 10.5,
  NOK: 10.7,
  DKK: 6.86,
  PLN: 3.95,
  CZK: 23.2,
  HUF: 355,
  TRY: 34.5,
  AED: 3.67,
  SAR: 3.75,
  INR: 84,
  SGD: 1.34,
  HKD: 7.8,
  THB: 34.5,
  MYR: 4.45,
  IDR: 15900,
  PHP: 58,
  KRW: 1380,
  CNY: 7.25,
  ZAR: 18.2,
  BRL: 5.8,
  MXN: 20.1,
  ARS: 1010,
};

export function isConvertible(currency: string): boolean {
  return currency.toUpperCase() in RATES_PER_USD;
}

export interface Converted {
  amount: number;
  wasConverted: boolean;
}

/**
 * Converts a minor-unit amount between currencies. Returns the input unchanged
 * when the currencies match or when we have no rate for one of them — an
 * unconvertible quote is left alone and flagged rather than silently dropped.
 */
export function convert(
  minorAmount: number,
  from: string,
  to: string,
): Converted {
  const source = from.toUpperCase();
  const target = to.toUpperCase();
  if (source === target) return { amount: minorAmount, wasConverted: false };

  const fromRate = RATES_PER_USD[source];
  const toRate = RATES_PER_USD[target];
  if (!fromRate || !toRate) {
    return { amount: minorAmount, wasConverted: false };
  }

  const usd = minorAmount / fromRate;
  return { amount: Math.round(usd * toRate), wasConverted: true };
}
