"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DestinationInput } from "./DestinationInput";

function isoDate(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

/**
 * One horizontal surface, four fields, one action. Field labels are small and
 * quiet; the values are what you read. Everything optional (rooms, currency,
 * sort) lives elsewhere — a search bar that asks six questions gets used for
 * none of them.
 */
export function SearchForm({
  defaults,
}: {
  defaults?: {
    destination?: string;
    checkIn?: string;
    checkOut?: string;
    guests?: string;
  };
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
    router.push(
      `/search?${new URLSearchParams({ destination, checkIn, checkOut, guests }).toString()}`,
    );
  }

  return (
    <form onSubmit={submit}>
      <div
        className="grid gap-px overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-border)] sm:grid-cols-[1.7fr_1fr_1fr_0.62fr_auto]"
        style={{ boxShadow: "var(--elev-3)" }}
      >
        {/* A combobox rather than a plain field: picking a suggestion writes
            "Lisbon, PT", which gives the supplier a complete location. A bare
            city is rejected by LiteAPI, which is how this used to fail. */}
        <label
          htmlFor="destination"
          className="cursor-text bg-[var(--color-surface)] px-5 py-3.5 transition-colors focus-within:bg-[var(--color-surface-sunken)]"
        >
          <span className="label mb-1">Where</span>
          <DestinationInput
            id="destination"
            name="destination"
            value={destination}
            onChange={setDestination}
            placeholder="City, e.g. Lisbon"
            className="input"
            required
          />
        </label>
        <Field
          id="checkIn"
          label="Check in"
          type="date"
          value={checkIn}
          min={isoDate(0)}
          onChange={setCheckIn}
          required
        />
        <Field
          id="checkOut"
          label="Check out"
          type="date"
          value={checkOut}
          min={checkIn}
          onChange={setCheckOut}
          required
        />
        <Field
          id="guests"
          label="Guests"
          type="number"
          value={guests}
          onChange={setGuests}
          min="1"
          max="12"
          required
        />

        <div className="flex items-center bg-[var(--color-surface)] p-2.5">
          <button
            type="submit"
            className="btn btn-aurora h-full w-full px-7 sm:w-auto"
            disabled={pending || invalidDates}
          >
            {pending ? "Searching…" : "Search"}
          </button>
        </div>
      </div>

      {invalidDates && (
        <p className="mt-2 pl-5 text-xs text-[var(--color-danger)]">
          Check-out has to be after check-in.
        </p>
      )}
    </form>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  min,
  max,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  min?: string;
  max?: string;
}) {
  return (
    <label
      htmlFor={id}
      className="cursor-text bg-[var(--color-surface)] px-5 py-3.5 transition-colors focus-within:bg-[var(--color-surface-sunken)]"
    >
      <span className="label mb-1">{label}</span>
      <input
        id={id}
        type={type}
        className="input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        min={min}
        max={max}
      />
    </label>
  );
}
