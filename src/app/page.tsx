import Link from "next/link";
import { SearchForm } from "@/components/SearchForm";
import { getCurrentUser, isInstantBookReady } from "@/lib/auth";
import { getProviders, isUsingFixtures } from "@/lib/suppliers";

export default async function HomePage() {
  const user = await getCurrentUser();
  const providers = getProviders();
  const ready = user ? isInstantBookReady(user) : false;

  return (
    <div className="mx-auto max-w-6xl px-5">
      <section className="pt-16 pb-10 sm:pt-24">
        <h1 className="max-w-2xl text-4xl font-semibold leading-[1.08] tracking-[-0.02em] sm:text-[3.25rem]">
          Find the room. Tap once. Split it with whoever is coming.
        </h1>
        <p className="mt-4 max-w-xl text-[1.05rem] leading-relaxed text-[var(--color-ink-soft)]">
          We price every room against {providers.length} suppliers at once and show you
          the cheaper one. Your details are saved, so booking is a single tap —
          and paying for it together takes one more.
        </p>

        <div className="mt-9">
          <SearchForm />
        </div>

        {user && !ready && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm">
            <span className="text-[var(--color-ink-soft)]">
              One-tap booking needs your traveler details and a card on file.
            </span>
            <Link href="/account" className="btn btn-secondary py-1.5 text-sm">
              Finish setup
            </Link>
          </div>
        )}
      </section>

      <section className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-border)] sm:grid-cols-3">
        <Feature
          title="Every supplier, one row"
          body="The same hotel from different suppliers is matched into a single result, so you compare rooms instead of listings."
        />
        <Feature
          title="Booked before they reply"
          body="Your card guarantees the room the moment you tap. Friends settle up afterwards — the reservation never waits on them."
        />
        <Feature
          title="Split without the spreadsheet"
          body="Add whoever is coming, shares are calculated to the cent, and everyone pays their own part in the app."
        />
      </section>

      {isUsingFixtures() && (
        <p className="mt-6 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-warn-soft)] px-4 py-3 text-sm text-[var(--color-warn)]">
          <strong className="font-semibold">Demo data.</strong> No supplier keys are
          configured, so results come from two built-in demo suppliers. Add
          <code className="mx-1 rounded bg-black/5 px-1 py-0.5 text-xs dark:bg-white/10">
            LITEAPI_KEY
          </code>
          or Amadeus credentials to <code className="text-xs">.env</code> for live rates.
        </p>
      )}
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-[var(--color-surface)] p-6">
      <h2 className="text-[0.95rem] font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-soft)]">{body}</p>
    </div>
  );
}
