import "server-only";

import type { CurrentUser } from "./auth";

/**
 * The setup wizard's step order.
 *
 * Steps are derived from the account rather than stored as a fixed list,
 * because which questions apply depends on how someone signed in: a phone user
 * already gave us a number, a Google user already gave us a name and an email,
 * and only an account with no email needs to be asked for one. Asking a
 * question we already know the answer to is the thing that makes setup feel
 * long.
 */

export type StepId = "name" | "phone" | "email" | "loyalty" | "card" | "done";

export interface Step {
  id: StepId;
  title: string;
  /** Optional steps can be skipped without blocking booking. */
  optional: boolean;
}

export function stepsFor(user: CurrentUser): Step[] {
  const steps: Step[] = [];

  const hasName = Boolean(user.profile?.firstName && user.profile?.lastName);
  if (!hasName) {
    steps.push({ id: "name", title: "What's your name?", optional: false });
  }

  if (!user.profile?.phone) {
    steps.push({ id: "phone", title: "Your phone number", optional: false });
  }

  // Only when the account itself has no address — the hotel needs somewhere to
  // send the confirmation.
  if (!user.email && !user.profile?.contactEmail) {
    steps.push({ id: "email", title: "Where should confirmations go?", optional: false });
  }

  steps.push({ id: "loyalty", title: "Hotel rewards", optional: true });

  if (user.paymentMethods.length === 0) {
    steps.push({ id: "card", title: "Add a card", optional: false });
  }

  steps.push({ id: "done", title: "You're set", optional: false });
  return steps;
}

/** The first step still needing an answer, so a return visit resumes in place. */
export function nextStep(user: CurrentUser): StepId {
  const steps = stepsFor(user);
  const pending = steps.find((step) => step.id !== "loyalty" && step.id !== "done");
  return pending?.id ?? (user.onboardedAt ? "done" : "loyalty");
}
