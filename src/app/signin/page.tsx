import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { signIn } from "@/app/actions";
import { getCurrentUserId } from "@/lib/auth";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await getCurrentUserId()) redirect("/");
  const { next } = await searchParams;

  return (
    <div className="mx-auto max-w-md px-5 py-16">
      <AuthForm mode="signin" action={signIn} next={next} />
    </div>
  );
}
