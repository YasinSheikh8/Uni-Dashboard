import { redirect } from "next/navigation";
import { SignInPanel } from "@/components/SignInPanel";
import { enabledProviders } from "@/auth";
import { getCurrentUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  if (await getCurrentUserId()) redirect("/");
  const { next } = await searchParams;

  return (
    <div className="mx-auto max-w-md px-6 py-14">
      <SignInPanel
        next={next}
        providers={{ google: enabledProviders.google, apple: enabledProviders.apple }}
      />
    </div>
  );
}
