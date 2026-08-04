import { redirect } from "next/navigation";
import { CardSection, FriendsSection, ProfileForm } from "@/components/AccountForms";
import { signOut } from "@/app/actions";
import { getCurrentUser, isInstantBookReady } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isStripeConfigured } from "@/lib/payments";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?next=/account");

  const friendships = await prisma.friendship.findMany({
    where: {
      status: "accepted",
      OR: [{ requesterId: user.id }, { addresseeId: user.id }],
    },
    include: {
      requester: { select: { id: true, name: true, email: true, avatarColor: true } },
      addressee: { select: { id: true, name: true, email: true, avatarColor: true } },
    },
  });

  const friends = friendships.map((friendship) =>
    friendship.requesterId === user.id ? friendship.addressee : friendship.requester,
  );

  const ready = isInstantBookReady(user);

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Account</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            {user.email ?? user.phone ?? "Signed in"}
          </p>
        </div>
        <form action={signOut}>
          <button type="submit" className="btn btn-ghost text-sm">
            Sign out
          </button>
        </form>
      </div>

      <div
        className={`mt-6 rounded-[var(--radius-control)] px-4 py-3 text-sm ${
          ready
            ? "bg-[var(--color-save-soft)] text-[var(--color-save)]"
            : "bg-[var(--color-warn-soft)] text-[var(--color-warn)]"
        }`}
      >
        {ready
          ? "One-tap booking is on. Pick a room and you're done."
          : "Add your traveler details and a card to unlock one-tap booking."}
      </div>

      <div className="mt-6 space-y-4">
        <ProfileForm profile={user.profile} accountEmail={user.email} />
        <CardSection
          cards={user.paymentMethods.map((method) => ({
            id: method.id,
            brand: method.brand,
            last4: method.last4,
            expMonth: method.expMonth,
            expYear: method.expYear,
          }))}
          stripeLive={isStripeConfigured()}
        />
        <FriendsSection friends={friends} />
      </div>
    </div>
  );
}
