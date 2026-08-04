import { redirect } from "next/navigation";
import { SetupWizard } from "@/components/SetupWizard";
import { getCurrentUser } from "@/lib/auth";
import { stepsFor } from "@/lib/onboarding";
import { isStripeConfigured } from "@/lib/payments";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?next=/setup");

  const steps = stepsFor(user);
  const memberships = await prisma.loyaltyMembership.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { programCode: true, membershipNumber: true, tier: true },
  });

  // Resume where they stopped rather than restarting the wizard.
  const firstUnanswered = steps.findIndex(
    (step) => step.id !== "loyalty" && step.id !== "done",
  );

  return (
    <SetupWizard
      steps={steps}
      startIndex={firstUnanswered === -1 ? 0 : firstUnanswered}
      defaults={{
        firstName: user.profile?.firstName || undefined,
        lastName: user.profile?.lastName || undefined,
        phone: user.profile?.phone || user.phone || undefined,
      }}
      memberships={memberships}
      stripeLive={isStripeConfigured()}
    />
  );
}
