"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ShareActions({ bookingId, amount }: { bookingId: string; amount: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function respond(action: "accept" | "decline") {
    setPending(action);
    setError(null);
    try {
      const response = await fetch(`/api/bookings/${bookingId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not update your share");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="card border-[var(--color-border-strong)] p-5">
      <h2 className="text-sm font-semibold">Your share is {amount}</h2>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Accepting places a hold on your card. You are charged only when the trip settles.
      </p>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => respond("accept")}
          disabled={pending !== null}
          className="btn btn-primary flex-1"
        >
          {pending === "accept" ? "Authorizing…" : `Pay ${amount}`}
        </button>
        <button
          onClick={() => respond("decline")}
          disabled={pending !== null}
          className="btn btn-secondary"
        >
          {pending === "decline" ? "…" : "Can't make it"}
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-[var(--radius-control)] bg-[var(--color-danger-soft)] px-3 py-2 text-xs text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
