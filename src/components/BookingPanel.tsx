"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatMoney, splitEqually } from "@/lib/money";

interface FriendOption {
  id: string;
  name: string;
  /** Absent for phone-only accounts; such a friend is invited by user id. */
  email: string | null;
  avatarColor: string;
}

interface Offer {
  supplier: string;
  supplierHotelId: string;
  supplierRateId: string;
  hotelName: string;
  hotelAddress: string;
  hotelCity: string;
  hotelCountry: string;
  hotelImageUrl?: string;
  hotelRating?: number;
  chainCode?: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  rooms: number;
  currency: string;
  totalAmount: number;
  priceComparison: string;
  savedAmount: number;
}

export function BookingPanel({
  offer,
  currentUser,
  friends,
  instantReady,
  taxesAndFees,
}: {
  offer: Offer;
  currentUser: { id: string; name: string; email: string | null };
  friends: FriendOption[];
  instantReady: boolean;
  taxesAndFees: number;
}) {
  const router = useRouter();
  const [splitting, setSplitting] = useState(false);
  const [selected, setSelected] = useState<FriendOption[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invited, setInvited] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const participants = useMemo(() => {
    const people: Array<{ label: string; key: string; email: string | null }> = [
      { label: `${currentUser.name} (you)`, key: currentUser.id, email: currentUser.email },
    ];
    if (splitting) {
      for (const friend of selected) {
        people.push({ label: friend.name, key: friend.id, email: friend.email });
      }
      for (const email of invited) people.push({ label: email, key: email, email });
    }
    return people;
  }, [splitting, selected, invited, currentUser]);

  // Mirrors the server's largest-remainder split exactly, so the preview and
  // the actual charges never differ by a cent.
  const shares = useMemo(
    () => splitEqually(offer.totalAmount, participants.length),
    [offer.totalAmount, participants.length],
  );

  const yourShare = shares[0] ?? offer.totalAmount;
  const friendsTotal = offer.totalAmount - yourShare;

  function addInvite() {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    if (currentUser.email && email === currentUser.email) return;
    if (invited.includes(email) || selected.some((f) => f.email === email)) return;
    setInvited((current) => [...current, email]);
    setInviteEmail("");
  }

  async function book() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offer,
          friends: splitting
            ? [
                ...selected.map((friend) => ({
                  email: friend.email ?? undefined,
                  name: friend.name,
                  userId: friend.id,
                })),
                ...invited.map((email) => ({ email })),
              ]
            : [],
        }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Booking failed");
      router.push(`/bookings/${payload.bookingId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Booking failed");
      setSubmitting(false);
    }
  }

  return (
    <aside className="lg:sticky lg:top-20 lg:self-start">
      <div className="card p-6">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-[var(--color-ink-soft)]">Total</span>
          <span className="tabular text-2xl font-semibold tracking-[-0.02em]">
            {formatMoney(offer.totalAmount, offer.currency)}
          </span>
        </div>
        <p className="mt-1 text-right text-xs text-[var(--color-ink-faint)]">
          includes {formatMoney(taxesAndFees, offer.currency)} taxes and fees
        </p>

        {offer.savedAmount > 0 && (
          <p className="mt-3 rounded-[var(--radius-control)] bg-[var(--color-save-soft)] px-3 py-2 text-xs font-medium text-[var(--color-save)]">
            {formatMoney(offer.savedAmount, offer.currency)} under the next supplier
          </p>
        )}

        <div className="mt-6 border-t border-[var(--color-border)] pt-5">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={splitting}
              onChange={(event) => setSplitting(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--color-ink)]"
            />
            <span>
              <span className="text-sm font-semibold">Split with friends</span>
              <span className="mt-0.5 block text-xs text-[var(--color-ink-soft)]">
                You pay your share now. The room is confirmed immediately either way.
              </span>
            </span>
          </label>

          {splitting && (
            <div className="mt-4 space-y-4">
              {friends.length > 0 && (
                <div>
                  <span className="label">Your friends</span>
                  <div className="flex flex-wrap gap-2">
                    {friends.map((friend) => {
                      const active = selected.some((entry) => entry.id === friend.id);
                      return (
                        <button
                          key={friend.id}
                          type="button"
                          onClick={() =>
                            setSelected((current) =>
                              active
                                ? current.filter((entry) => entry.id !== friend.id)
                                : [...current, friend],
                            )
                          }
                          className={`pill ${active ? "pill-save" : "pill-muted"} cursor-pointer`}
                        >
                          {friend.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <span className="label">Invite by email</span>
                <div className="flex gap-2">
                  <input
                    type="email"
                    className="input input-boxed"
                    placeholder="friend@example.com"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addInvite();
                      }
                    }}
                  />
                  <button type="button" onClick={addInvite} className="btn btn-secondary">
                    Add
                  </button>
                </div>
                {invited.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {invited.map((email) => (
                      <button
                        key={email}
                        type="button"
                        className="pill pill-muted cursor-pointer"
                        onClick={() =>
                          setInvited((current) => current.filter((entry) => entry !== email))
                        }
                        title="Remove"
                      >
                        {email} ×
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-[var(--radius-control)] bg-[var(--color-surface-sunken)] p-4">
                <span className="label">Split {participants.length} ways</span>
                <ul className="space-y-1.5 text-sm">
                  {participants.map((person, index) => (
                    <li key={person.key} className="flex justify-between gap-3">
                      <span className="truncate text-[var(--color-ink-soft)]">
                        {person.label}
                      </span>
                      <span className="tabular shrink-0 font-medium">
                        {formatMoney(shares[index] ?? 0, offer.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 border-t border-[var(--color-border)] pt-5">
          {instantReady ? (
            <>
              <button
                onClick={book}
                disabled={submitting}
                className="btn btn-primary w-full py-3 text-base"
              >
                {submitting
                  ? "Confirming…"
                  : `Book now · ${formatMoney(yourShare, offer.currency)}`}
              </button>
              <p className="mt-3 text-center text-xs leading-relaxed text-[var(--color-ink-faint)]">
                {splitting && friendsTotal > 0 ? (
                  <>
                    You&apos;re charged {formatMoney(yourShare, offer.currency)} now. We hold{" "}
                    {formatMoney(friendsTotal, offer.currency)} on your card as a guarantee
                    and release it as your friends pay their shares.
                  </>
                ) : (
                  <>Charged to your saved card. No further steps.</>
                )}
              </p>
            </>
          ) : (
            <>
              <Link href="/setup" className="btn btn-primary w-full py-3 text-base">
                Finish setup to book
              </Link>
              <p className="mt-3 text-center text-xs text-[var(--color-ink-faint)]">
                One-tap booking needs your traveler details and a saved card.
              </p>
            </>
          )}

          {error && (
            <p className="mt-3 rounded-[var(--radius-control)] bg-[var(--color-danger-soft)] px-3 py-2 text-xs text-[var(--color-danger)]">
              {error}
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
