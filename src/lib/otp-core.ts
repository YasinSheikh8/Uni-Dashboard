/**
 * Shared one-time-code policy and cryptography.
 *
 * Phone and email codes differ only in how they are delivered and which table
 * they live in. Everything that makes them safe — the hashing, the constant-time
 * comparison, the expiry and attempt limits — is here, so the two channels
 * cannot drift into having different security properties.
 */

import { createHash, randomInt, timingSafeEqual } from "node:crypto";

export const CODE_TTL_MS = 5 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
/** Minimum gap between sends to one identifier. */
export const RESEND_COOLDOWN_MS = 45 * 1000;
/** Cap per identifier per hour, bounding both abuse and spend. */
export const MAX_SENDS_PER_HOUR = 5;

/** Cryptographically secure. Math.random is not, and this guards an account. */
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Salted with the identifier, so identical codes issued to different people do
 * not produce identical hashes.
 */
export function hashCode(code: string, identifier: string): string {
  return createHash("sha256").update(`${identifier}:${code}`).digest("hex");
}

/**
 * Constant-time comparison. Using === on the hashes leaks timing information —
 * a small edge, but a free one to close.
 */
export function codeMatches(
  storedHash: string,
  code: string,
  identifier: string,
): boolean {
  const expected = Buffer.from(storedHash);
  const actual = Buffer.from(hashCode(code, identifier));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function isSixDigits(code: string): boolean {
  return /^\d{6}$/.test(code);
}

/** Shared shape returned by both channels' send paths. */
export interface SendCodeResult {
  ok: boolean;
  error?: string;
  /** Set only when no delivery provider is configured, for local development. */
  devCode?: string;
}

export interface VerifyResult {
  ok: boolean;
  identifier?: string;
  error?: string;
}

export function attemptsError(attemptsUsed: number): string {
  const left = MAX_ATTEMPTS - attemptsUsed;
  return left > 0 ? `Wrong code. ${left} attempts left.` : "Too many wrong attempts.";
}
