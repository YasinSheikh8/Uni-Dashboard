import "server-only";

import { prisma } from "./db";
import { isEmailConfigured, sendEmail } from "./email";
import {
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  MAX_SENDS_PER_HOUR,
  RESEND_COOLDOWN_MS,
  attemptsError,
  codeMatches,
  generateCode,
  hashCode,
  isSixDigits,
  type SendCodeResult,
  type VerifyResult,
} from "./otp-core";

/**
 * Email sign-in with one-time codes.
 *
 * Same guarantees as the phone channel, from the same shared policy: codes are
 * hashed at rest, single-use, expire in five minutes, burn after five wrong
 * guesses, are rate limited per address, and are compared in constant time.
 * Requesting a new code invalidates the previous one, so an attacker cannot
 * widen the guessing surface by triggering several at once.
 */

export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  // Deliberately simple: real validation is whether the code arrives.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
  if (email.length > 254) return null;
  return email;
}

function body(code: string): { text: string; html: string } {
  const text =
    `${code} is your BKR sign-in code.\n\n` +
    "It expires in 5 minutes. If you didn't ask for it, you can ignore this email.";

  const html = `
    <div style="font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:420px;margin:0 auto;padding:32px 24px;color:#0e0e12">
      <p style="margin:0 0 24px;font-size:15px;color:#5a5a68">Your BKR sign-in code</p>
      <p style="margin:0 0 24px;font-size:38px;font-weight:600;letter-spacing:0.18em;font-variant-numeric:tabular-nums">${code}</p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#5a5a68">
        Expires in 5 minutes. If you didn't ask for this, you can ignore it —
        nothing will happen to your account.
      </p>
    </div>`;

  return { text, html };
}

export async function sendEmailCode(rawEmail: string): Promise<SendCodeResult> {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, error: "Enter a valid email address" };

  const now = new Date();

  const recent = await prisma.emailOtp.findFirst({
    where: { email },
    orderBy: { createdAt: "desc" },
  });

  if (recent && now.getTime() - recent.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil(
      (RESEND_COOLDOWN_MS - (now.getTime() - recent.createdAt.getTime())) / 1000,
    );
    return { ok: false, error: `Wait ${wait}s before asking for another code.` };
  }

  const lastHour = await prisma.emailOtp.count({
    where: { email, createdAt: { gte: new Date(now.getTime() - 3_600_000) } },
  });
  if (lastHour >= MAX_SENDS_PER_HOUR) {
    return { ok: false, error: "Too many codes requested. Try again in an hour." };
  }

  // Only one live code per address at a time.
  await prisma.emailOtp.updateMany({
    where: { email, consumed: false },
    data: { consumed: true },
  });

  const code = generateCode();

  await prisma.emailOtp.create({
    data: {
      email,
      codeHash: hashCode(code, email),
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
    },
  });

  try {
    const { text, html } = body(code);
    await sendEmail({ to: email, subject: `${code} is your BKR code`, text, html });
  } catch (error) {
    console.error("Email send failed:", error);
    return { ok: false, error: "Could not send the code. Try again shortly." };
  }

  // Safe to surface only because this happens exclusively when no email
  // provider exists, i.e. local development.
  return { ok: true, devCode: isEmailConfigured() ? undefined : code };
}

export async function verifyEmailCode(
  rawEmail: string,
  code: string,
): Promise<VerifyResult> {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, error: "Invalid email address" };
  if (!isSixDigits(code)) return { ok: false, error: "Enter the 6-digit code" };

  const record = await prisma.emailOtp.findFirst({
    where: { email, consumed: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  if (!record) {
    return { ok: false, error: "That code has expired. Ask for a new one." };
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    await prisma.emailOtp.update({
      where: { id: record.id },
      data: { consumed: true },
    });
    return { ok: false, error: "Too many wrong attempts. Ask for a new code." };
  }

  if (!codeMatches(record.codeHash, code, email)) {
    await prisma.emailOtp.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, error: attemptsError(record.attempts + 1) };
  }

  await prisma.emailOtp.update({
    where: { id: record.id },
    data: { consumed: true },
  });

  return { ok: true, identifier: email };
}

/** Housekeeping, called alongside the phone-code sweep. */
export async function purgeExpiredEmailCodes(): Promise<number> {
  const { count } = await prisma.emailOtp.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 86_400_000) } },
  });
  return count;
}
