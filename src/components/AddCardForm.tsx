"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadStripe, type Stripe, type StripeElements } from "@stripe/stripe-js";

/**
 * Card capture, in place.
 *
 * Stripe's Payment Element is mounted directly into this page — the card is
 * tokenized inside Stripe's iframe so no card data reaches our server, but the
 * user never leaves Hotelbook. `redirect: "if_required"` keeps confirmation
 * on-page; a 3-D Secure challenge, when the bank demands one, appears as a
 * modal over the page rather than a navigation.
 *
 * `@stripe/react-stripe-js` is deliberately not used — the vanilla SDK does
 * this in about the same number of lines without another React dependency to
 * keep in step with React 19.
 */

let stripePromise: Promise<Stripe | null> | null = null;

function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    stripePromise = key ? loadStripe(key) : Promise.resolve(null);
  }
  return stripePromise;
}

export function AddCardForm({ onSaved }: { onSaved: () => void }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stripeRef = useRef<Stripe | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);

  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);

  const dark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  const start = useCallback(async () => {
    setStatus("loading");
    setError(null);

    try {
      const response = await fetch("/api/account/setup-intent", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not start card setup");

      if (payload.stub) {
        throw new Error(
          "Stripe is not configured on this environment, so a real card cannot be collected.",
        );
      }

      const stripe = await getStripe();
      if (!stripe) throw new Error("Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
      stripeRef.current = stripe;

      const elements = stripe.elements({
        clientSecret: payload.clientSecret,
        appearance: {
          theme: dark ? "night" : "stripe",
          variables: {
            colorPrimary: "#6366f1",
            colorBackground: dark ? "#131318" : "#ffffff",
            colorText: dark ? "#f4f4f7" : "#0e0e12",
            borderRadius: "12px",
            fontFamily: "ui-sans-serif, -apple-system, system-ui, sans-serif",
          },
        },
      });
      elementsRef.current = elements;

      const paymentElement = elements.create("payment", {
        // Nothing to ship, so do not ask for an address we will not use.
        fields: { billingDetails: { address: { country: "auto", postalCode: "auto" } } },
      });

      // Wait a tick so the mount node exists once status flips to "ready".
      setStatus("ready");
      requestAnimationFrame(() => {
        if (mountRef.current) paymentElement.mount(mountRef.current);
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong");
      setStatus("idle");
    }
  }, [dark]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const stripe = stripeRef.current;
    const elements = elementsRef.current;
    if (!stripe || !elements) return;

    setStatus("saving");
    setError(null);

    const result = await stripe.confirmSetup({
      elements,
      redirect: "if_required",
    });

    if (result.error) {
      setError(result.error.message ?? "Your bank declined that card");
      setStatus("ready");
      return;
    }

    const paymentMethodId =
      typeof result.setupIntent?.payment_method === "string"
        ? result.setupIntent.payment_method
        : result.setupIntent?.payment_method?.id;

    if (!paymentMethodId) {
      setError("Stripe did not return a card");
      setStatus("ready");
      return;
    }

    const response = await fetch("/api/account/payment-methods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentMethodId }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error ?? "Could not save that card");
      setStatus("ready");
      return;
    }

    setStatus("idle");
    onSaved();
  }

  useEffect(() => {
    return () => {
      elementsRef.current = null;
      stripeRef.current = null;
    };
  }, []);

  if (status === "idle" || status === "loading") {
    return (
      <div>
        <button
          type="button"
          onClick={start}
          className="btn btn-secondary mt-4"
          disabled={status === "loading"}
        >
          {status === "loading" ? "Opening…" : "Add a card"}
        </button>
        {error && (
          <p className="mt-3 rounded-[var(--radius-control)] bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={save} className="mt-5">
      <div ref={mountRef} />

      {error && (
        <p className="mt-3 rounded-[var(--radius-control)] bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={status === "saving"}>
          {status === "saving" ? "Saving…" : "Save card"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setStatus("idle");
            setError(null);
          }}
          disabled={status === "saving"}
        >
          Cancel
        </button>
      </div>

      <p className="mt-3 text-xs text-[var(--color-ink-faint)]">
        Handled by Stripe. Card details never reach our servers, and you stay on
        Hotelbook the whole time.
      </p>
    </form>
  );
}
