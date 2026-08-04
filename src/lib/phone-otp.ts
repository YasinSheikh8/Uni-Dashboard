import "server-only";

import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "./db";
import { isSmsConfigured, sendSms } from "./sms";
import { buildCodeMessage } from "./otp-message";

/**
 * Phone sign-in with one-time codes.
 *
 * A six-digit code is only ~20 bits, so the security comes from the constraints
 * around it rather than from the code itself:
 *
 *   - codes are stored HASHED, so a database leak does not hand over live codes;
 *   - each code is single-use and expires in 5 minutes;
 *   - 5 wrong guesses burns the code entirely;
 *   - requesting a new code invalidates the previous one, so an attacker cannot
 *     widen the guessing surface by triggering many codes at once;
 *   - sending is rate limited per number.
 *
 * Codes are compared in constant time. Comparing hashes with === leaks timing
 * information, which is a small edge but a free one to close.
 */

const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
/** Minimum gap between sends to one number. */
const RESEND_COOLDOWN_MS = 45 * 1000;
/** Cap on sends per number per hour, to bound SMS spend and abuse. */
const MAX_SENDS_PER_HOUR = 5;

function hash(code: string, phone: string): string {
  // Salted with the phone number so identical codes for different numbers do
  // not produce identical hashes.
  return createHash("sha256").update(`${phone}:${code}`).digest("hex");
}

/**
 * Normalizes user input to E.164.
 *
 * Deliberately strict: we accept a leading + with 8-15 digits, or a bare
 * international number. We do NOT guess country codes from a bare local number —
 * silently assuming a country sends someone else's phone a code.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.replace(/[\s()\-.]/g, "");
  const withPlus = trimmed.startsWith("00") ? `+${trimmed.slice(2)}` : trimmed;
  if (!/^\+[1-9]\d{7,14}$/.test(withPlus)) return null;
  return withPlus;
}

export interface SendCodeResult {
  ok: boolean;
  error?: string;
  /** Only set when SMS is unconfigured, so development can display the code. */
  devCode?: string;
}

export async function sendPhoneCode(rawPhone: string): Promise<SendCodeResult> {
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return {
      ok: false,
      error: "Enter your number in international format, e.g. +44 7700 900123",
    };
  }

  const now = new Date();

  const recent = await prisma.phoneOtp.findFirst({
    where: { phone },
    orderBy: { createdAt: "desc" },
  });

  if (recent && now.getTime() - recent.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil(
      (RESEND_COOLDOWN_MS - (now.getTime() - recent.createdAt.getTime())) / 1000,
    );
    return { ok: false, error: `Wait ${wait}s before asking for another code.` };
  }

  const lastHour = await prisma.phoneOtp.count({
    where: { phone, createdAt: { gte: new Date(now.getTime() - 3_600_000) } },
  });
  if (lastHour >= MAX_SENDS_PER_HOUR) {
    return { ok: false, error: "Too many codes requested. Try again in an hour." };
  }

  // Invalidate anything outstanding so only one code per number is ever live.
  await prisma.phoneOtp.updateMany({
    where: { phone, consumed: false },
    data: { consumed: true },
  });

  // randomInt is cryptographically secure; Math.random is not.
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");

  await prisma.phoneOtp.create({
    data: {
      phone,
      codeHash: hash(code, phone),
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
    },
  });

  try {
    await sendSms(phone, buildCodeMessage(code));
  } catch (error) {
    console.error("SMS send failed:", error);
    return { ok: false, error: "Could not send the code. Try again shortly." };
  }

  // Surfacing the code is only safe because it happens exclusively when no SMS
  // provider exists, i.e. local development.
  return { ok: true, devCode: isSmsConfigured() ? undefined : code };
}

export interface VerifyResult {
  ok: boolean;
  phone?: string;
  error?: string;
}

export async function verifyPhoneCode(
  rawPhone: string,
  code: string,
): Promise<VerifyResult> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { ok: false, error: "Invalid phone number" };
  if (!/^\d{6}$/.test(code)) return { ok: false, error: "Enter the 6-digit code" };

  const record = await prisma.phoneOtp.findFirst({
    where: { phone, consumed: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  if (!record) {
    return { ok: false, error: "That code has expired. Ask for a new one." };
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    await prisma.phoneOtp.update({
      where: { id: record.id },
      data: { consumed: true },
    });
    return { ok: false, error: "Too many wrong attempts. Ask for a new code." };
  }

  const expected = Buffer.from(record.codeHash);
  const actual = Buffer.from(hash(code, phone));
  const matches = expected.length === actual.length && timingSafeEqual(expected, actual);

  if (!matches) {
    await prisma.phoneOtp.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    const left = MAX_ATTEMPTS - (record.attempts + 1);
    return {
      ok: false,
      error: left > 0 ? `Wrong code. ${left} attempts left.` : "Too many wrong attempts.",
    };
  }

  await prisma.phoneOtp.update({
    where: { id: record.id },
    data: { consumed: true },
  });

  return { ok: true, phone };
}

/** Housekeeping, called from the settlement cron so it needs no schedule of its own. */
export async function purgeExpiredCodes(): Promise<number> {
  const { count } = await prisma.phoneOtp.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 86_400_000) } },
  });
  return count;
}
