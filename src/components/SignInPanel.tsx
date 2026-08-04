"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  requestPhoneCode,
  signIn,
  signInWithApple,
  signInWithGoogle,
  signUp,
  verifyPhoneCodeAction,
  type ActionState,
} from "@/app/actions";
import { AppleMark, GoogleMark } from "./BrandIcons";

/**
 * One door.
 *
 * Every route in lands on this panel, and none of them asks a question it does
 * not need. Google and Apple are one tap. Phone is a number, then a code that
 * submits itself the moment six digits are present — no "continue" to hunt for.
 * Email and password still exist for accounts that predate the rest, but they
 * are behind a disclosure rather than occupying the front door.
 *
 * There is deliberately no separate "sign up" path for the social and phone
 * routes: a first-time Google user and a returning one do the same thing, and
 * the account is created behind the scenes. Making people choose between two
 * doors that look identical is the least seamless part of most sign-in screens.
 */

type PhoneState = ActionState & { devCode?: string; phone?: string };

function SubmitButton({
  children,
  className = "btn btn-primary w-full py-3",
  disabled,
}: {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled}>
      {pending ? "One moment…" : children}
    </button>
  );
}

export function SignInPanel({
  next,
  providers,
}: {
  next?: string;
  providers: { google: boolean; apple: boolean };
}) {
  const [stage, setStage] = useState<"choose" | "code">("choose");
  const [showEmail, setShowEmail] = useState(false);
  const [emailMode, setEmailMode] = useState<"signin" | "signup">("signin");

  const [phoneState, phoneAction] = useActionState<PhoneState, FormData>(
    requestPhoneCode,
    {},
  );
  const [codeState, codeAction] = useActionState<ActionState, FormData>(
    verifyPhoneCodeAction,
    {},
  );
  const [signInState, signInAction] = useActionState<ActionState, FormData>(signIn, {});
  const [signUpState, signUpAction] = useActionState<ActionState, FormData>(signUp, {});

  const [code, setCode] = useState("");
  const codeFormRef = useRef<HTMLFormElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  // Advance to the code step as soon as one has actually been sent.
  useEffect(() => {
    if (phoneState.success && phoneState.phone) {
      setStage("code");
      setCode("");
      requestAnimationFrame(() => codeInputRef.current?.focus());
    }
  }, [phoneState]);

  // Submit the moment the code is complete. Asking someone to type six digits
  // and then find a button is a step that does not need to exist.
  useEffect(() => {
    if (code.length === 6 && !codeState.error) {
      codeFormRef.current?.requestSubmit();
    }
  }, [code, codeState.error]);

  const anySocial = providers.google || providers.apple;

  if (stage === "code") {
    return (
      <div className="card p-7">
        <button
          type="button"
          onClick={() => setStage("choose")}
          className="text-sm text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
        >
          ← Back
        </button>

        <h1 className="mt-4 text-xl font-semibold tracking-[-0.01em]">Enter your code</h1>
        <p className="mt-1.5 text-sm text-[var(--color-ink-soft)]">
          Sent to {phoneState.phone}
        </p>

        <form ref={codeFormRef} action={codeAction} className="mt-5">
          <input type="hidden" name="phone" value={phoneState.phone ?? ""} />
          {next && <input type="hidden" name="next" value={next} />}

          <input
            ref={codeInputRef}
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            className="input input-boxed text-center text-2xl tracking-[0.5em]"
            placeholder="······"
            aria-label="Six digit code"
          />

          {phoneState.devCode && (
            <p className="mt-3 rounded-[var(--radius-control)] bg-[var(--color-warn-soft)] px-3 py-2 text-xs text-[var(--color-warn)]">
              No SMS provider configured, so here is the code: <strong>{phoneState.devCode}</strong>
            </p>
          )}

          {codeState.error && (
            <p className="mt-3 rounded-[var(--radius-control)] bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">
              {codeState.error}
            </p>
          )}

          <SubmitButton className="btn btn-primary mt-4 w-full py-3">Continue</SubmitButton>
        </form>

        <form action={phoneAction} className="mt-3">
          <input type="hidden" name="phone" value={phoneState.phone ?? ""} />
          <SubmitButton className="btn btn-ghost w-full text-sm">
            Send a new code
          </SubmitButton>
        </form>
      </div>
    );
  }

  return (
    <div className="card p-7">
      <h1 className="text-xl font-semibold tracking-[-0.01em]">Continue to BKR</h1>
      <p className="mt-1.5 text-sm text-[var(--color-ink-soft)]">
        No separate sign-up. However you continue, your account is waiting.
      </p>

      {anySocial && (
        <div className="mt-6 grid gap-2">
          {providers.google && (
            <form action={signInWithGoogle}>
              {next && <input type="hidden" name="next" value={next} />}
              <SubmitButton className="btn btn-secondary w-full py-3">
                <GoogleMark />
                Continue with Google
              </SubmitButton>
            </form>
          )}

          {providers.apple && (
            <form action={signInWithApple}>
              {next && <input type="hidden" name="next" value={next} />}
              <SubmitButton className="btn w-full bg-black py-3 text-white hover:opacity-90">
                <AppleMark />
                Continue with Apple
              </SubmitButton>
            </form>
          )}
        </div>
      )}

      {anySocial && (
        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-[var(--color-border)]" />
          <span className="text-xs text-[var(--color-ink-faint)]">or</span>
          <span className="h-px flex-1 bg-[var(--color-border)]" />
        </div>
      )}

      <form action={phoneAction} className={anySocial ? "" : "mt-6"}>
        <label className="label" htmlFor="phone">
          Phone number
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          placeholder="+44 7700 900123"
          className="input input-boxed"
          required
        />

        {phoneState.error && (
          <p className="mt-2 text-sm text-[var(--color-danger)]">{phoneState.error}</p>
        )}

        <SubmitButton className="btn btn-aurora mt-3 w-full py-3">
          Text me a code
        </SubmitButton>
      </form>

      <div className="mt-6 border-t border-[var(--color-border)] pt-5">
        {!showEmail ? (
          <button
            type="button"
            onClick={() => setShowEmail(true)}
            className="w-full text-center text-sm text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
          >
            Use email and password instead
          </button>
        ) : (
          <form action={emailMode === "signin" ? signInAction : signUpAction}>
            {next && <input type="hidden" name="next" value={next} />}

            {emailMode === "signup" && (
              <div className="mb-3">
                <label className="label" htmlFor="name">
                  Name
                </label>
                <input id="name" name="name" className="input input-boxed" required />
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
                autoComplete="email"
                className="input input-boxed"
                required
              />
            </div>

            <div className="mt-3">
              <label className="label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={emailMode === "signup" ? "new-password" : "current-password"}
                minLength={8}
                className="input input-boxed"
                required
              />
            </div>

            {(signInState.error || signUpState.error) && (
              <p className="mt-3 rounded-[var(--radius-control)] bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">
                {signInState.error ?? signUpState.error}
              </p>
            )}

            <SubmitButton className="btn btn-secondary mt-4 w-full py-2.5">
              {emailMode === "signin" ? "Sign in" : "Create account"}
            </SubmitButton>

            <button
              type="button"
              onClick={() => setEmailMode(emailMode === "signin" ? "signup" : "signin")}
              className="mt-3 w-full text-center text-sm text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
            >
              {emailMode === "signin"
                ? "New here? Create an account"
                : "Already have an account? Sign in"}
            </button>
          </form>
        )}
      </div>

      <p className="mt-6 text-center text-xs leading-relaxed text-[var(--color-ink-faint)]">
        We only ever text you a sign-in code. Standard message rates apply.
      </p>
    </div>
  );
}
