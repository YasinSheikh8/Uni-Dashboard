"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { addCard, addFriend, saveProfile, type ActionState } from "@/app/actions";
import { AddCardForm } from "./AddCardForm";
import { LOYALTY_PROGRAMS } from "@/lib/loyalty";
import { addLoyaltyMembership, removeLoyaltyMembership } from "@/app/actions";

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
  accountEmail,
}: {
  accountEmail: string | null;
  profile: {
    firstName: string;
    lastName: string;
    phone: string;
    contactEmail: string | null;
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
        {/* Only asked for when the account itself has no address — a phone
            sign-in, or Apple's hide-my-email. The hotel needs somewhere to
            send the confirmation. */}
        {!accountEmail && (
          <Field
            name="contactEmail"
            label="Email for confirmations"
            defaultValue={profile?.contactEmail}
            placeholder="you@example.com"
            required
          />
        )}
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
  friends: Array<{ id: string; name: string; email: string | null; avatarColor: string }>;
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
              <span className="truncate text-[var(--color-ink-faint)]">
                {friend.email ?? "phone account"}
              </span>
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

/**
 * Rewards, for editing after setup.
 *
 * Same actions the wizard uses, so there is one code path for adding a
 * membership rather than two that can drift.
 */
export function LoyaltySection({
  memberships,
}: {
  memberships: Array<{ programCode: string; membershipNumber: string; tier: string | null }>;
}) {
  const [state, formAction, pending] = useActionState(
    addLoyaltyMembership,
    {} as ActionState,
  );
  const [selected, setSelected] = useState<string | null>(null);

  const held = new Set(memberships.map((entry) => entry.programCode));
  const program = LOYALTY_PROGRAMS.find((entry) => entry.code === selected);

  return (
    <div className="card p-6">
      <h2 className="text-sm font-semibold">Hotel rewards</h2>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Added to the reservation so the property recognises you at check-in.
      </p>

      {memberships.length > 0 && (
        <ul className="mt-4 space-y-2">
          {memberships.map((entry) => {
            const meta = LOYALTY_PROGRAMS.find((p) => p.code === entry.programCode);
            return (
              <li
                key={entry.programCode}
                className="flex items-center justify-between rounded-[var(--radius-control)] bg-[var(--color-surface-sunken)] px-4 py-3 text-sm"
              >
                <span>
                  <span className="font-medium">{meta?.name ?? entry.programCode}</span>
                  <span className="ml-2 text-[var(--color-ink-faint)]">
                    ····{entry.membershipNumber.slice(-4)}
                  </span>
                  {entry.tier && (
                    <span className="pill pill-save ml-2">{entry.tier}</span>
                  )}
                </span>
                <form action={removeLoyaltyMembership}>
                  <input type="hidden" name="programCode" value={entry.programCode} />
                  <button className="text-xs text-[var(--color-ink-faint)] hover:text-[var(--color-danger)]">
                    Remove
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {LOYALTY_PROGRAMS.filter((entry) => !held.has(entry.code)).map((entry) => (
          <button
            key={entry.code}
            type="button"
            onClick={() => setSelected(selected === entry.code ? null : entry.code)}
            className={`pill cursor-pointer ${
              selected === entry.code ? "pill-save" : "pill-muted"
            }`}
          >
            {entry.name}
          </button>
        ))}
      </div>

      {program && (
        <form action={formAction} className="mt-4">
          <input type="hidden" name="programCode" value={program.code} />
          <input
            name="membershipNumber"
            className="input input-boxed"
            placeholder={`Membership number — ${program.numberHint}`}
            required
          />
          <input
            name="tier"
            className="input input-boxed mt-2"
            placeholder="Tier, e.g. Gold (optional)"
          />
          <button type="submit" className="btn btn-secondary mt-3" disabled={pending}>
            {pending ? "Adding…" : `Add ${program.name}`}
          </button>
        </form>
      )}

      <Message state={state} />

      <p className="mt-4 text-xs leading-relaxed text-[var(--color-ink-faint)]">
        Most chains don&apos;t award points on third-party rates, so we don&apos;t
        promise them. Your number still reaches the property, which is where
        upgrades get decided.
      </p>
    </div>
  );
}
