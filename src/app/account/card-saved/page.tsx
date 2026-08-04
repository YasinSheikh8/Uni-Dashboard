import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveSavedCard } from "@/lib/stripe-checkout";

export const dynamic = "force-dynamic";

/** Return leg of the Stripe Checkout setup flow. */
export default async function CardSavedPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?next=/account");

  const { session_id: sessionId } = await searchParams;
  if (!sessionId) redirect("/account");

  let saved = false;
  let message = "";

  try {
    const card = await resolveSavedCard(sessionId);
    if (card) {
      const existing = await prisma.paymentMethod.findUnique({
        where: { stripePaymentMethodId: card.id },
      });

      if (!existing) {
        await prisma.paymentMethod.create({
          data: {
            userId: user.id,
            stripePaymentMethodId: card.id,
            brand: card.brand,
            last4: card.last4,
            expMonth: card.expMonth,
            expYear: card.expYear,
            isDefault: user.paymentMethods.length === 0,
          },
        });
      }
      saved = true;
    } else {
      message = "Stripe did not return a card for that session.";
    }
  } catch (error) {
    message = error instanceof Error ? error.message : "Could not confirm the card";
  }

  return (
    <div className="mx-auto max-w-md px-5 py-20 text-center">
      <h1 className="text-xl font-semibold">{saved ? "Card saved" : "Something went wrong"}</h1>
      <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
        {saved ? "You can book in one tap now." : message}
      </p>
      <Link href="/account" className="btn btn-primary mt-6">
        Back to account
      </Link>
    </div>
  );
}
