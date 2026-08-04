import { NextResponse } from "next/server";
import { UnauthorizedError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPaymentGateway, isStripeConfigured } from "@/lib/payments";

export const dynamic = "force-dynamic";

/**
 * Issues a SetupIntent so a card can be collected on our own page.
 *
 * The card itself is entered into Stripe's iframe and tokenized in the
 * browser — it never touches this server, which keeps the PCI surface at
 * SAQ-A — but the user stays on Hotelbook the whole time. No redirect.
 */
export async function POST() {
  try {
    const user = await requireUser();

    if (!isStripeConfigured()) {
      return NextResponse.json({ stub: true });
    }

    const gateway = getPaymentGateway();
    const customerId = await gateway.ensureCustomer(
      user.id,
      user.email,
      user.name,
      user.stripeCustomerId,
    );

    if (customerId !== user.stripeCustomerId) {
      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const { clientSecret } = await gateway.createSetupIntent(customerId);
    return NextResponse.json({ clientSecret });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Sign in first" }, { status: 401 });
    }
    console.error("SetupIntent failed:", error);
    return NextResponse.json({ error: "Could not start card setup" }, { status: 500 });
  }
}
