/**
 * Money handling. Everything is minor units (cents) as integers — floats never
 * touch a price in this codebase.
 */

/** Currencies whose minor unit is the major unit (no cents). */
const ZERO_DECIMAL = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG",
  "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
]);

export function decimalPlaces(currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2;
}

/** "142.50" | 142.5 -> 14250 */
export function toMinorUnits(amount: string | number, currency: string): number {
  const value = typeof amount === "string" ? Number.parseFloat(amount) : amount;
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot parse monetary amount: ${String(amount)}`);
  }
  const factor = 10 ** decimalPlaces(currency);
  return Math.round(value * factor);
}

/** 14250 -> 142.5 */
export function toMajorUnits(minor: number, currency: string): number {
  return minor / 10 ** decimalPlaces(currency);
}

export function formatMoney(
  minor: number,
  currency: string,
  locale = "en-US",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: decimalPlaces(currency),
    maximumFractionDigits: decimalPlaces(currency),
  }).format(toMajorUnits(minor, currency));
}

/**
 * Splits `total` into `weights.length` parts proportional to the weights, with
 * every part an integer and the parts summing to exactly `total`.
 *
 * Uses largest-remainder: the cents lost to rounding are handed out one at a
 * time to whoever was rounded down hardest. Naive per-share rounding leaves you
 * a cent short (or over) on the charge, which reconciles into a real bug.
 */
export function splitEvenly(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  if (weightSum <= 0) {
    throw new Error("Split weights must sum to a positive number");
  }

  const exact = weights.map((w) => (total * w) / weightSum);
  const floors = exact.map((value) => Math.floor(value));
  let remainder = total - floors.reduce((sum, v) => sum + v, 0);

  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);

  const result = [...floors];
  for (let i = 0; remainder > 0; i = (i + 1) % order.length) {
    result[order[i].index] += 1;
    remainder -= 1;
  }

  return result;
}

/** Equal split between `count` people, cents distributed deterministically. */
export function splitEqually(total: number, count: number): number[] {
  return splitEvenly(total, new Array(count).fill(1));
}
