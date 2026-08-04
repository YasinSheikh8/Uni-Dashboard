"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  addLoyaltyMembership,
  completeOnboarding,
  removeLoyaltyMembership,
  saveStepEmail,
  saveStepName,
  saveStepPhone,
  type ActionState,
} from "@/app/actions";
import { AddCardForm } from "./AddCardForm";
import { LOYALTY_PROGRAMS } from "@/lib/loyalty";

/**
 * Setup, one question at a time.
 *
 * The previous version put eight fields, a card form and a friends list on one
 * page and asked people to deal with all of it. This asks for one thing per
 * screen, saves each answer as it is given, and shows how much is left.
 *
 * Two rules it follows:
 *   - never ask something we already know. The step list is computed from the
 *     account, so a Google user is not asked their name and a phone user is not
 *     asked their number.
 *   - never trap anyone. Optional steps say so and can be skipped, and leaving
 *     halfway loses nothing because each step commits on its own.
 */

export interface WizardStep {
  id: string;
  title: string;
  optional: boolean;
}

interface Membership {
  programCode: string;
  membershipNumber: string;
  tier: string | null;
}

function Next({ label = "Continue" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-aurora mt-6 w-full py-3" disabled={pending}>
      {pending ? "Saving…" : label}
    </button>
  );
}

export function SetupWizard({
  steps,
  startIndex,
  defaults,
  memberships,
  stripeLive,
}: {
  steps: WizardStep[];
  startIndex: number;
  defaults: { firstName?: string; lastName?: string; phone?: string };
  memberships: Membership[];
  stripeLive: boolean;
}) {
  const router = useRouter();

  /**
   * The step list is FROZEN on mount.
   *
   * `stepsFor` derives the list from the account, and each step writes to that
   * same account — so letting the prop flow through live meant saving your name
   * removed the name step, shrank the list from six to five, and slid the
   * index onto the wrong question. Answering "what's your name?" skipped
   * straight past "your phone number".
   *
   * Freezing it means the sequence you started is the sequence you finish.
   * Live data that does NOT reorder anything, such as `memberships`, still
   * flows through normally.
   */
  const [frozenSteps] = useState(steps);
  const [index, setIndex] = useState(startIndex);
  const step = frozenSteps[index];
  const isLast = index === frozenSteps.length - 1;

  function advance() {
    if (isLast) return;
    setIndex((current) => Math.min(current + 1, frozenSteps.length - 1));
  }

  return (
    <div className="mx-auto max-w-md px-6 py-12">
      {/* Progress. Segments rather than a bar, so "three things left" is
          countable at a glance instead of estimated from a percentage. */}
      <div className="mb-8 flex items-center gap-1.5">
        {frozenSteps.map((entry, position) => (
          <span
            key={entry.id}
            className="h-1 flex-1 rounded-full transition-colors duration-500"
            style={{
              background:
                position <= index
                  ? "linear-gradient(90deg, var(--aurora-1), var(--aurora-2))"
                  : "var(--color-border)",
            }}
          />
        ))}
      </div>

      <div key={step.id} className="rise">
        <p className="text-xs font-medium text-[var(--color-ink-faint)]">
          Step {index + 1} of {frozenSteps.length}
          {step.optional && " · optional"}
        </p>
        <h1 className="mt-2 text-[1.75rem] font-semibold tracking-[-0.025em]">
          {step.title}
        </h1>

        <div className="mt-7">
          {step.id === "name" && (
            <NameStep defaults={defaults} onDone={advance} />
          )}
          {step.id === "phone" && <PhoneStep defaults={defaults} onDone={advance} />}
          {step.id === "email" && <EmailStep onDone={advance} />}
          {step.id === "loyalty" && (
            <LoyaltyStep memberships={memberships} onDone={advance} />
          )}
          {step.id === "card" && (
            <CardStep stripeLive={stripeLive} onDone={advance} router={router} />
          )}
          {step.id === "done" && <DoneStep />}
        </div>

        {index > 0 && step.id !== "done" && (
          <button
            type="button"
            onClick={() => setIndex((current) => current - 1)}
            className="mt-6 w-full text-center text-sm text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
          >
            Back
          </button>
        )}
      </div>
    </div>
  );
}

function useStep(
  action: (state: ActionState, data: FormData) => Promise<ActionState>,
  onDone: () => void,
) {
  const [state, formAction] = useActionState(async (prev: ActionState, data: FormData) => {
    const result = await action(prev, data);
    if (result.success) onDone();
    return result;
  }, {} as ActionState);
  return [state, formAction] as const;
}

function Error_({ state }: { state: ActionState }) {
  if (!state.error) return null;
  return (
    <p className="mt-3 rounded-[var(--radius-control)] bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">
      {state.error}
    </p>
  );
}

function NameStep({
  defaults,
  onDone,
}: {
  defaults: { firstName?: string; lastName?: string };
  onDone: () => void;
}) {
  const [state, formAction] = useStep(saveStepName, onDone);
  return (
    <form action={formAction}>
      <p className="mb-5 text-sm text-[var(--color-ink-soft)]">
        As it appears on the ID you&apos;ll check in with.
      </p>
      <div className="grid gap-3">
        <input
          name="firstName"
          className="input input-boxed"
          placeholder="First name"
          defaultValue={defaults.firstName}
          autoFocus
          required
        />
        <input
          name="lastName"
          className="input input-boxed"
          placeholder="Last name"
          defaultValue={defaults.lastName}
          required
        />
      </div>
      <Error_ state={state} />
      <Next />
    </form>
  );
}

function PhoneStep({
  defaults,
  onDone,
}: {
  defaults: { phone?: string };
  onDone: () => void;
}) {
  const [state, formAction] = useStep(saveStepPhone, onDone);
  return (
    <form action={formAction}>
      <p className="mb-5 text-sm text-[var(--color-ink-soft)]">
        Hotels occasionally need to reach you about a late arrival.
      </p>
      <input
        name="phone"
        type="tel"
        autoComplete="tel"
        className="input input-boxed"
        placeholder="+44 7700 900123"
        defaultValue={defaults.phone}
        autoFocus
        required
      />
      <Error_ state={state} />
      <Next />
    </form>
  );
}

function EmailStep({ onDone }: { onDone: () => void }) {
  const [state, formAction] = useStep(saveStepEmail, onDone);
  return (
    <form action={formAction}>
      <p className="mb-5 text-sm text-[var(--color-ink-soft)]">
        Your account has no email attached, and the hotel sends your confirmation
        to one.
      </p>
      <input
        name="contactEmail"
        type="email"
        autoComplete="email"
        className="input input-boxed"
        placeholder="you@example.com"
        autoFocus
        required
      />
      <Error_ state={state} />
      <Next />
    </form>
  );
}

function LoyaltyStep({
  memberships,
  onDone,
}: {
  memberships: Membership[];
  onDone: () => void;
}) {
  const [state, formAction] = useActionState(addLoyaltyMembership, {} as ActionState);
  const [selected, setSelected] = useState<string | null>(null);

  const held = new Set(memberships.map((entry) => entry.programCode));
  const program = LOYALTY_PROGRAMS.find((entry) => entry.code === selected);

  return (
    <div>
      <p className="mb-5 text-sm leading-relaxed text-[var(--color-ink-soft)]">
        Add your membership numbers and we&apos;ll put them on the reservation, so
        the hotel knows who you are at check-in.
      </p>

      {memberships.length > 0 && (
        <ul className="mb-5 space-y-2">
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

      <div className="flex flex-wrap gap-2">
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
            autoFocus
            required
          />
          <input
            name="tier"
            className="input input-boxed mt-2"
            placeholder="Tier, e.g. Gold (optional)"
          />
          <Error_ state={state} />
          <button type="submit" className="btn btn-secondary mt-3 w-full">
            Add {program.name}
          </button>
        </form>
      )}

      {/* Said plainly rather than implied. Overpromising here would be the
          kind of thing someone only discovers at checkout. */}
      <p className="mt-6 rounded-[var(--radius-control)] bg-[var(--color-surface-sunken)] px-4 py-3 text-xs leading-relaxed text-[var(--color-ink-soft)]">
        Most chains don&apos;t award points on rates booked through a third party,
        so we won&apos;t promise them. What this does do is put your number and tier
        in front of the property, which is where upgrades and late check-out
        actually get decided.
      </p>

      <button type="button" onClick={onDone} className="btn btn-aurora mt-6 w-full py-3">
        {memberships.length > 0 ? "Continue" : "Skip for now"}
      </button>
    </div>
  );
}

function CardStep({
  stripeLive,
  onDone,
  router,
}: {
  stripeLive: boolean;
  onDone: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <div>
      <p className="mb-5 text-sm leading-relaxed text-[var(--color-ink-soft)]">
        Saved once so booking is a single tap. It also guarantees the room while
        friends settle their shares.
      </p>

      {stripeLive ? (
        <AddCardForm
          onSaved={() => {
            router.refresh();
            onDone();
          }}
        />
      ) : (
        <p className="rounded-[var(--radius-control)] bg-[var(--color-warn-soft)] px-4 py-3 text-sm text-[var(--color-warn)]">
          Stripe isn&apos;t configured on this environment, so there&apos;s no card to
          add yet.
        </p>
      )}

      <button
        type="button"
        onClick={onDone}
        className="mt-5 w-full text-center text-sm text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
      >
        I&apos;ll do this later
      </button>
    </div>
  );
}

function DoneStep() {
  return (
    <form action={completeOnboarding}>
      <p className="text-sm leading-relaxed text-[var(--color-ink-soft)]">
        That&apos;s everything. Find a room and it&apos;s one tap from here.
      </p>
      <button type="submit" className="btn btn-aurora mt-6 w-full py-3">
        Start searching
      </button>
    </form>
  );
}
