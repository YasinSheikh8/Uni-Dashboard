import Link from "next/link";
import { SearchForm } from "@/components/SearchForm";
import { PriceStack } from "@/components/PriceStack";
import { getCurrentUser, isInstantBookReady } from "@/lib/auth";
import { isUsingFixtures } from "@/lib/suppliers";

export default async function HomePage() {
  const user = await getCurrentUser();
  const ready = user ? isInstantBookReady(user) : false;

  return (
    <div className="relative">
      <div className="aurora-wash" />

      <section className="relative mx-auto max-w-6xl px-6 pt-14 sm:pt-24">
        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-4">
          <div className="rise">
            <h1 className="display max-w-[15ch] text-[2.75rem] sm:text-[3.75rem] lg:text-[4.25rem]">
              One room. One tap. Split however you like.
            </h1>

            <p className="mt-6 max-w-[42ch] text-[1.0625rem] leading-relaxed text-[var(--color-ink-soft)]">
              We price every supplier at once and show you the cheaper one.
              Your details are already saved, so booking is a single tap.
            </p>
          </div>

          <div className="rise" style={{ animationDelay: "120ms" }}>
            <PriceStack />
          </div>
        </div>

        <div className="rise mt-4 sm:mt-8" style={{ animationDelay: "220ms" }}>
          <SearchForm />
        </div>

        {user && !ready && (
          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <span className="text-[var(--color-ink-soft)]">
              One-tap booking needs your details and a card.
            </span>
            <Link href="/account" className="font-medium underline underline-offset-4">
              Finish setup
            </Link>
          </div>
        )}
      </section>

      {/* Three statements, no boxes. Cards here would compete with the hero. */}
      <section className="mx-auto mt-28 max-w-6xl px-6 pb-24 sm:mt-40">
        <div className="grid gap-x-12 gap-y-10 sm:grid-cols-3">
          <Point
            index="01"
            title="Every supplier, one row"
            body="The same hotel from different suppliers is matched into a single result. You compare rooms, not listings."
          />
          <Point
            index="02"
            title="Booked before they reply"
            body="Your card guarantees the room the moment you tap. Friends settle up afterwards."
          />
          <Point
            index="03"
            title="Split to the cent"
            body="Add whoever is coming. Everyone pays their own share in the app."
          />
        </div>

        {isUsingFixtures() && (
          <p className="mt-20 text-xs leading-relaxed text-[var(--color-ink-faint)]">
            Running on demo suppliers — no supplier keys are configured. Add
            <code className="mx-1">LITEAPI_KEY</code> or Amadeus credentials for live rates.
          </p>
        )}
      </section>
    </div>
  );
}

function Point({
  index,
  title,
  body,
}: {
  index: string;
  title: string;
  body: string;
}) {
  return (
    <div>
      <span className="tabular text-xs font-medium text-[var(--color-ink-faint)]">
        {index}
      </span>
      <h2 className="mt-3 text-[1.0625rem] font-semibold tracking-[-0.01em]">{title}</h2>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-[var(--color-ink-soft)]">
        {body}
      </p>
    </div>
  );
}
