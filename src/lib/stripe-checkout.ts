import "server-only";

import Stripe from "stripe";

/**
 * Hosted card-capture. Setup mode collects and stores a card for later
 * off-session charges without any card data reaching this server, which keeps
 * the PCI surface at SAQ-A.
 */
export async function createCheckoutSetupSession(customerId: string): Promise<string> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");

  const stripe = new Stripe(key);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    mode: "setup",
    customer: customerId,
    payment_method_types: ["card"],
    success_url: `${appUrl}/account/card-saved?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/account`,
  });

  if (!session.url) throw new Error("Stripe returned no checkout URL");
  return session.url;
}

/** Resolves the card the user just saved, for persisting locally. */
export async function resolveSavedCard(sessionId: string) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");

  const stripe = new Stripe(key);
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["setup_intent"],
  });

  const setupIntent = session.setup_intent as Stripe.SetupIntent | null;
  const paymentMethodId =
    typeof setupIntent?.payment_method === "string"
      ? setupIntent.payment_method
      : setupIntent?.payment_method?.id;

  if (!paymentMethodId) return null;

  const method = await stripe.paymentMethods.retrieve(paymentMethodId);
  return {
    id: method.id,
    brand: method.card?.brand ?? "card",
    last4: method.card?.last4 ?? "0000",
    expMonth: method.card?.exp_month ?? 0,
    expYear: method.card?.exp_year ?? 0,
  };
}
