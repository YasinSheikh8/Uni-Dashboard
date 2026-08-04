import "server-only";

import type { Prisma } from "@prisma/client";

/**
 * Matches the participant rows belonging to a given user.
 *
 * Identity is userId first, email second. Email alone is not enough any more:
 * a phone sign-in or Apple's "hide my email" produces an account with no
 * address, and matching on a null email would match every other email-less
 * participant on the booking.
 */
export function participantIdentity(user: {
  id: string;
  email: string | null;
}): Prisma.BookingParticipantWhereInput {
  const clauses: Prisma.BookingParticipantWhereInput[] = [{ userId: user.id }];
  if (user.email) clauses.push({ email: user.email });
  return { OR: clauses };
}

/** Same test, in memory, for rows already loaded. */
export function isMe(
  participant: { userId: string | null; email: string | null },
  user: { id: string; email: string | null },
): boolean {
  if (participant.userId) return participant.userId === user.id;
  return Boolean(user.email && participant.email === user.email);
}
