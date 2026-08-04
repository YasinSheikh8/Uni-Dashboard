import { NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { UnauthorizedError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isStripeConfigured } from "@/lib/payments";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ paymentMethodId: z.string().min(1) });

/**
 * Persists a card the browser just tokenized.
 *
 * The brand and last4 are read back from Stripe rather than trusted from the
 * client — the request only carries an id, and a caller could otherwise claim
 * any card details they liked. Ownership is verified too: the payment method
 * must belong to this user's customer.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = bodySchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    if (!isStripeConfigured()) {
      return NextResponse.json({ error: "Stripe is not configured" }, { status: 400 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const method = await stripe.paymentMethods.retrieve(parsed.data.paymentMethodId);

    const owner = typeof method.customer === "string" ? method.customer : method.customer?.id;
    if (!owner || owner !== user.stripeCustomerId) {
      return NextResponse.json({ error: "That card is not yours" }, { status: 403 });
    }

    const existing = await prisma.paymentMethod.findUnique({
      where: { stripePaymentMethodId: method.id },
    });
    if (existing) return NextResponse.json({ ok: true, alreadySaved: true });

    await prisma.paymentMethod.create({
      data: {
        userId: user.id,
        stripePaymentMethodId: method.id,
        brand: method.card?.brand ?? "card",
        last4: method.card?.last4 ?? "0000",
        expMonth: method.card?.exp_month ?? 0,
        expYear: method.card?.exp_year ?? 0,
        isDefault: user.paymentMethods.length === 0,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Sign in first" }, { status: 401 });
    }
    console.error("Saving card failed:", error);
    return NextResponse.json({ error: "Could not save that card" }, { status: 500 });
  }
}
