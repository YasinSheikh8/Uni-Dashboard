/**
 * Payment gateway.
 *
 * Everything the app does with money goes through `PaymentGateway`, which has
 * two implementations: real Stripe, and an in-memory stub used when no Stripe
 * key is configured so the booking and split flows can be walked end to end in
 * development. The stub is obvious about what it is — it never pretends a card
 * was charged anywhere the user can see.
 *
 * Money model, worth being explicit about: the PLATFORM charges every
 * participant and the PLATFORM pays the supplier. Money never moves between two
 * users. That keeps this out of peer-to-peer money-transmission territory and
 * means no Stripe Connect is required. If you later let an organizer collect
 * cash and reimburse friends directly, that changes and you will need Connect
 * plus a licensing conversation.
 */

import "server-only";

import Stripe from "stripe";

export interface AuthorizeParams {
  customerId: string;
  paymentMethodId: string;
  amount: number;
  currency: string;
  description: string;
  metadata: Record<string, string>;
}

export interface PaymentIntentSummary {
  id: string;
  /** requires_capture | succeeded | canceled | requires_action | failed */
  status: string;
  amount: number;
  amountCaptured: number;
}

export interface PaymentGateway {
  readonly isLive: boolean;
  ensureCustomer(userId: string, email: string, name: string, existingId: string | null): Promise<string>;
  createSetupIntent(customerId: string): Promise<{ clientSecret: string }>;
  listCards(customerId: string): Promise<Array<{ id: string; brand: string; last4: string; expMonth: number; expYear: number }>>;
  /** Places a hold. Money is reserved, not taken. */
  authorize(params: AuthorizeParams): Promise<PaymentIntentSummary>;
  /** Takes the money. `amount` captures a partial hold and releases the rest. */
  capture(paymentIntentId: string, amount?: number): Promise<PaymentIntentSummary>;
  /** Releases a hold in full. */
  release(paymentIntentId: string): Promise<PaymentIntentSummary>;
  /** Authorize and capture in one step. */
  chargeNow(params: AuthorizeParams): Promise<PaymentIntentSummary>;
}

class StripeGateway implements PaymentGateway {
  readonly isLive = true;
  private readonly stripe: Stripe;

  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey);
  }

  async ensureCustomer(
    userId: string,
    email: string,
    name: string,
    existingId: string | null,
  ): Promise<string> {
    if (existingId) return existingId;
    const customer = await this.stripe.customers.create({
      email,
      name,
      metadata: { appUserId: userId },
    });
    return customer.id;
  }

  async createSetupIntent(customerId: string): Promise<{ clientSecret: string }> {
    const intent = await this.stripe.setupIntents.create({
      customer: customerId,
      // The whole point: charge this card later without the user present.
      usage: "off_session",
      payment_method_types: ["card"],
    });
    if (!intent.client_secret) throw new Error("Stripe returned no client secret");
    return { clientSecret: intent.client_secret };
  }

  async listCards(customerId: string) {
    const methods = await this.stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
    });
    return methods.data.map((method) => ({
      id: method.id,
      brand: method.card?.brand ?? "card",
      last4: method.card?.last4 ?? "0000",
      expMonth: method.card?.exp_month ?? 0,
      expYear: method.card?.exp_year ?? 0,
    }));
  }

  private summarize(intent: Stripe.PaymentIntent): PaymentIntentSummary {
    return {
      id: intent.id,
      status: intent.status,
      amount: intent.amount,
      amountCaptured: intent.amount_received ?? 0,
    };
  }

  async authorize(params: AuthorizeParams): Promise<PaymentIntentSummary> {
    const intent = await this.stripe.paymentIntents.create({
      amount: params.amount,
      currency: params.currency.toLowerCase(),
      customer: params.customerId,
      payment_method: params.paymentMethodId,
      description: params.description,
      metadata: params.metadata,
      capture_method: "manual",
      confirm: true,
      off_session: true,
    });
    return this.summarize(intent);
  }

  async capture(paymentIntentId: string, amount?: number): Promise<PaymentIntentSummary> {
    const intent = await this.stripe.paymentIntents.capture(
      paymentIntentId,
      amount != null ? { amount_to_capture: amount } : undefined,
    );
    return this.summarize(intent);
  }

  async release(paymentIntentId: string): Promise<PaymentIntentSummary> {
    const intent = await this.stripe.paymentIntents.cancel(paymentIntentId);
    return this.summarize(intent);
  }

  async chargeNow(params: AuthorizeParams): Promise<PaymentIntentSummary> {
    const intent = await this.stripe.paymentIntents.create({
      amount: params.amount,
      currency: params.currency.toLowerCase(),
      customer: params.customerId,
      payment_method: params.paymentMethodId,
      description: params.description,
      metadata: params.metadata,
      capture_method: "automatic",
      confirm: true,
      off_session: true,
    });
    return this.summarize(intent);
  }
}

/** Development stub. Holds intents in memory; nothing is ever charged. */
class StubGateway implements PaymentGateway {
  readonly isLive = false;
  private intents = new Map<string, PaymentIntentSummary>();
  private counter = 0;

  async ensureCustomer(userId: string, _email: string, _name: string, existingId: string | null) {
    return existingId ?? `cus_stub_${userId.slice(0, 12)}`;
  }

  async createSetupIntent() {
    return { clientSecret: `seti_stub_${++this.counter}_secret` };
  }

  async listCards() {
    return [{ id: "pm_stub_card", brand: "visa", last4: "4242", expMonth: 12, expYear: 2030 }];
  }

  async authorize(params: AuthorizeParams): Promise<PaymentIntentSummary> {
    const summary: PaymentIntentSummary = {
      id: `pi_stub_${++this.counter}`,
      status: "requires_capture",
      amount: params.amount,
      amountCaptured: 0,
    };
    this.intents.set(summary.id, summary);
    return summary;
  }

  async capture(paymentIntentId: string, amount?: number): Promise<PaymentIntentSummary> {
    const existing = this.intents.get(paymentIntentId);
    const base: PaymentIntentSummary = existing ?? {
      id: paymentIntentId,
      status: "requires_capture",
      amount: amount ?? 0,
      amountCaptured: 0,
    };
    const updated: PaymentIntentSummary = {
      ...base,
      status: "succeeded",
      amountCaptured: amount ?? base.amount,
    };
    this.intents.set(paymentIntentId, updated);
    return updated;
  }

  async release(paymentIntentId: string): Promise<PaymentIntentSummary> {
    const existing = this.intents.get(paymentIntentId);
    const updated: PaymentIntentSummary = {
      id: paymentIntentId,
      status: "canceled",
      amount: existing?.amount ?? 0,
      amountCaptured: 0,
    };
    this.intents.set(paymentIntentId, updated);
    return updated;
  }

  async chargeNow(params: AuthorizeParams): Promise<PaymentIntentSummary> {
    const summary: PaymentIntentSummary = {
      id: `pi_stub_${++this.counter}`,
      status: "succeeded",
      amount: params.amount,
      amountCaptured: params.amount,
    };
    this.intents.set(summary.id, summary);
    return summary;
  }
}

let gateway: PaymentGateway | null = null;

export function getPaymentGateway(): PaymentGateway {
  if (gateway) return gateway;
  const key = process.env.STRIPE_SECRET_KEY;
  gateway = key ? new StripeGateway(key) : new StubGateway();
  return gateway;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
