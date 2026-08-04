"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { ActionState } from "@/app/actions";

export function AuthForm({
  mode,
  action,
  next,
}: {
  mode: "signin" | "signup";
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  next?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {} as ActionState);
  const isSignUp = mode === "signup";

  return (
    <form action={formAction} className="card space-y-4 p-7">
      <div>
        <h1 className="text-xl font-semibold tracking-[-0.01em]">
          {isSignUp ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          {isSignUp
            ? "Save your details once and book in a single tap after that."
            : "Sign in to book and settle up."}
        </p>
      </div>

      {next && <input type="hidden" name="next" value={next} />}

      {isSignUp && (
        <div>
          <label className="label" htmlFor="name">
            Name
          </label>
          <input id="name" name="name" className="input input-boxed" autoComplete="name" required />
        </div>
      )}

      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          className="input input-boxed"
          autoComplete="email"
          required
        />
      </div>

      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="input input-boxed"
          autoComplete={isSignUp ? "new-password" : "current-password"}
          minLength={8}
          required
        />
      </div>

      {state.error && (
        <p className="rounded-[var(--radius-control)] bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">
          {state.error}
        </p>
      )}

      <button type="submit" className="btn btn-primary w-full py-2.5" disabled={pending}>
        {pending ? "One moment…" : isSignUp ? "Create account" : "Sign in"}
      </button>

      <p className="text-center text-sm text-[var(--color-ink-soft)]">
        {isSignUp ? (
          <>
            Already have an account?{" "}
            <Link href="/signin" className="text-[var(--color-ink)] underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href="/signup" className="text-[var(--color-ink)] underline">
              Create an account
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
