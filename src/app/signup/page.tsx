import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { signUp } from "@/app/actions";
import { getCurrentUserId } from "@/lib/auth";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await getCurrentUserId()) redirect("/");
  const { next } = await searchParams;

  return (
    <div className="mx-auto max-w-md px-5 py-16">
      <AuthForm mode="signup" action={signUp} next={next} />
    </div>
  );
}
