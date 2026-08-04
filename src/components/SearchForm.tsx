"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

function isoDate(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

export function SearchForm({
  defaults,
  compact = false,
}: {
  defaults?: { destination?: string; checkIn?: string; checkOut?: string; guests?: string };
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const [destination, setDestination] = useState(defaults?.destination ?? "");
  const [checkIn, setCheckIn] = useState(defaults?.checkIn ?? isoDate(30));
  const [checkOut, setCheckOut] = useState(defaults?.checkOut ?? isoDate(33));
  const [guests, setGuests] = useState(defaults?.guests ?? "2");

  const invalidDates = checkOut <= checkIn;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (invalidDates) return;
    setPending(true);
    const params = new URLSearchParams({ destination, checkIn, checkOut, guests });
    router.push(`/search?${params.toString()}`);
  }

  return (
    <form
      onSubmit={submit}
      className={`card p-2 ${compact ? "" : "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.12)]"}`}
    >
      <div className="grid gap-2 sm:grid-cols-[1.6fr_1fr_1fr_0.7fr_auto]">
        <div className="px-2 py-1">
          <label className="label" htmlFor="destination">
            Where
          </label>
          <input
            id="destination"
            className="input border-0 px-0 py-0 focus:shadow-none"
            placeholder="City or hotel"
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            required
          />
        </div>

        <div className="border-l border-[var(--color-border)] px-3 py-1 sm:pl-4">
          <label className="label" htmlFor="checkIn">
            Check in
          </label>
          <input
            id="checkIn"
            type="date"
            className="input border-0 px-0 py-0 focus:shadow-none"
            value={checkIn}
            min={isoDate(0)}
            onChange={(event) => setCheckIn(event.target.value)}
            required
          />
        </div>

        <div className="border-l border-[var(--color-border)] px-3 py-1 sm:pl-4">
          <label className="label" htmlFor="checkOut">
            Check out
          </label>
          <input
            id="checkOut"
            type="date"
            className="input border-0 px-0 py-0 focus:shadow-none"
            value={checkOut}
            min={checkIn}
            onChange={(event) => setCheckOut(event.target.value)}
            required
          />
        </div>

        <div className="border-l border-[var(--color-border)] px-3 py-1 sm:pl-4">
          <label className="label" htmlFor="guests">
            Guests
          </label>
          <input
            id="guests"
            type="number"
            min={1}
            max={12}
            className="input border-0 px-0 py-0 focus:shadow-none"
            value={guests}
            onChange={(event) => setGuests(event.target.value)}
            required
          />
        </div>

        <div className="flex items-end p-1">
          <button
            type="submit"
            className="btn btn-primary h-11 w-full sm:w-auto"
            disabled={pending || invalidDates}
          >
            {pending ? "Searching…" : "Search"}
          </button>
        </div>
      </div>

      {invalidDates && (
        <p className="px-3 pb-2 text-xs text-[var(--color-danger)]">
          Check-out has to be after check-in.
        </p>
      )}
    </form>
  );
}
