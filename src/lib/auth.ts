/**
 * Session access for the rest of the app.
 *
 * Auth.js owns signing in and out; this module is the read side. It keeps the
 * same shape it had when sessions were a hand-rolled JWT cookie, so pages, API
 * routes and the booking engine did not have to change when the provider set
 * grew to Google, Apple and phone.
 */

import "server-only";

import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "./db";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  const id = (session?.user as { id?: string } | undefined)?.id;
  return id ?? null;
}

export async function getCurrentUser() {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  return prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true, paymentMethods: true },
  });
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** For API routes: throws a 401-shaped error when signed out. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Not signed in");
    this.name = "UnauthorizedError";
  }
}

/**
 * True when the user can book in one tap: complete traveler details and a saved
 * card. This is the gate for the whole instant-booking promise.
 *
 * It deliberately does not care HOW they signed in. What a booking needs is a
 * name, a phone number, a card, and somewhere to send the confirmation — so an
 * account with no email of its own qualifies as soon as the traveler profile
 * supplies a contact address.
 */
export function isInstantBookReady(user: {
  email: string | null;
  profile: {
    firstName: string;
    lastName: string;
    phone: string;
    contactEmail: string | null;
  } | null;
  paymentMethods: unknown[];
}): boolean {
  return Boolean(
    user.profile?.firstName &&
      user.profile?.lastName &&
      user.profile?.phone &&
      // Some address must exist for the hotel's confirmation, from either side.
      (user.email || user.profile?.contactEmail) &&
      user.paymentMethods.length > 0,
  );
}
