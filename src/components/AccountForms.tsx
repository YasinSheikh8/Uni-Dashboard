"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { addCard, addFriend, saveProfile, type ActionState } from "@/app/actions";
import { AddCardForm } from "./AddCardForm";

function Message({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <p className="mt-3 rounded-[var(--radius-control)] bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <p className="mt-3 rounded-[var(--radius-control)] bg-[var(--color-save-soft)] px-3 py-2 text-sm text-[var(--color-save)]">
        {state.success}
      </p>
    );
  }
  return null;
}

export function ProfileForm({
  profile,
}: {
  profile: {
    firstName: string;
    lastName: string;
    phone: string;
    nationality: string | null;
    addressLine1: string | null;
    addressCity: string | null;
    addressZip: string | null;
    addressCountry: string | null;
  } | null;
}) {
  const [state, formAction, pending] = useActionState(saveProfile, {} as ActionState);

  return (
    <form action={formAction} className="card p-6">
      <h2 className="text-sm font-semibold">Traveler details</h2>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Filled in once. Every booking after that is a single tap.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field name="firstName" label="First name" defaultValue={profile?.firstName} required />
        <Field name="lastName" label="Last name" defaultValue={profile?.lastName} required />
        <Field name="phone" label="Phone" defaultValue={profile?.phone} required />
        <Field name="nationality" label="Nationality" defaultValue={profile?.nationality} placeholder="GB" />
        <Field name="addressLine1" label="Address" defaultValue={profile?.addressLine1} />
        <Field name="addressCity" label="City" defaultValue={profile?.addressCity} />
        <Field name="addressZip" label="Postcode" defaultValue={profile?.addressZip} />
        <Field name="addressCountry" label="Country" defaultValue={profile?.addressCountry} placeholder="GB" />
      </div>

      <Message state={state} />

      <button type="submit" className="btn btn-primary mt-5" disabled={pending}>
        {pending ? "Saving…" : "Save details"}
      </button>
    </form>
  );
}

function Field({
  name,
  label,
  defaultValue,
  required,
  placeholder,
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        className="input input-boxed"
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        required={required}
      />
    </div>
  );
}

export function CardSection({
  cards,
  stripeLive,
}: {
  cards: Array<{ id: string; brand: string; last4: string; expMonth: number; expYear: number }>;
  stripeLive: boolean;
}) {
  const [state, formAction, pending] = useActionState(addCard, {} as ActionState);
  const router = useRouter();

  return (
    <div className="card p-6">
      <h2 className="text-sm font-semibold">Payment</h2>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Charged when you book, and used to hold your friends&apos; shares until they pay.
      </p>

      {cards.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {cards.map((card) => (
            <li
              key={card.id}
              className="flex items-center justify-between rounded-[var(--radius-control)] bg-[var(--color-surface-sunken)] px-4 py-3 text-sm"
            >
              <span className="font-medium capitalize">
                {card.brand} ···· {card.last4}
              </span>
              <span className="tabular text-xs text-[var(--color-ink-faint)]">
                {String(card.expMonth).padStart(2, "0")}/{String(card.expYear).slice(-2)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-[var(--color-ink-faint)]">No card saved yet.</p>
      )}

      <Message state={state} />

      {stripeLive ? (
        // Collected in place — no hop to a hosted checkout page.
        <AddCardForm onSaved={() => router.refresh()} />
      ) : (
        <>
          <form action={formAction}>
            <button type="submit" className="btn btn-secondary mt-4" disabled={pending}>
              {pending ? "Adding…" : "Add test card"}
            </button>
          </form>
          <p className="mt-3 text-xs text-[var(--color-ink-faint)]">
            Stripe is not configured, so this attaches a stub card and no money moves.
            Set <code>STRIPE_SECRET_KEY</code> to collect real cards.
          </p>
        </>
      )}
    </div>
  );
}

export function FriendsSection({
  friends,
}: {
  friends: Array<{ id: string; name: string; email: string; avatarColor: string }>;
}) {
  const [state, formAction, pending] = useActionState(addFriend, {} as ActionState);

  return (
    <div className="card p-6">
      <h2 className="text-sm font-semibold">Friends</h2>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Anyone here is one tap away when you split a booking.
      </p>

      {friends.length > 0 && (
        <ul className="mt-4 space-y-2">
          {friends.map((friend) => (
            <li key={friend.id} className="flex items-center gap-3 text-sm">
              <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold text-white"
                style={{ background: friend.avatarColor }}
              >
                {friend.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="font-medium">{friend.name}</span>
              <span className="truncate text-[var(--color-ink-faint)]">{friend.email}</span>
            </li>
          ))}
        </ul>
      )}

      <form action={formAction} className="mt-4 flex gap-2">
        <input
          name="email"
          type="email"
          className="input input-boxed"
          placeholder="friend@example.com"
          required
        />
        <button type="submit" className="btn btn-secondary" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </button>
      </form>

      <Message state={state} />
    </div>
  );
}
