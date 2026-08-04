import { redirect } from "next/navigation";

/**
 * There is no separate sign-up. Google, Apple and phone all create the account
 * on first use, and the email form has its own toggle — so a second door would
 * only be a place to get stuck. Old links still work.
 */
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  redirect(next ? `/signin?next=${encodeURIComponent(next)}` : "/signin");
}
