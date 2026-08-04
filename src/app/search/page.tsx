import { Suspense } from "react";
import Link from "next/link";
import { SearchForm } from "@/components/SearchForm";
import { HotelCard } from "@/components/HotelCard";
import { searchHotels, type SortMode } from "@/lib/suppliers/aggregator";

export const dynamic = "force-dynamic";

interface SearchParams {
  destination?: string;
  checkIn?: string;
  checkOut?: string;
  guests?: string;
  rooms?: string;
  currency?: string;
  sort?: string;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const query = {
    destination: params.destination ?? "",
    checkIn: params.checkIn ?? "",
    checkOut: params.checkOut ?? "",
    guests: params.guests ?? "2",
    rooms: params.rooms ?? "1",
    currency: params.currency ?? "EUR",
    sort: (params.sort as SortMode) ?? "best_price",
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <SearchForm defaults={query} />

      <Suspense key={JSON.stringify(query)} fallback={<ResultsSkeleton />}>
        <Results query={query} />
      </Suspense>
    </div>
  );
}

async function Results({
  query,
}: {
  query: {
    destination: string;
    checkIn: string;
    checkOut: string;
    guests: string;
    rooms: string;
    currency: string;
    sort: SortMode;
  };
}) {
  if (!query.destination || !query.checkIn || !query.checkOut) {
    return (
      <p className="mt-16 text-center text-sm text-[var(--color-ink-soft)]">
        Tell us where and when.
      </p>
    );
  }

  const result = await searchHotels(
    {
      destination: query.destination,
      checkIn: query.checkIn,
      checkOut: query.checkOut,
      adults: Number.parseInt(query.guests, 10) || 2,
      rooms: Number.parseInt(query.rooms, 10) || 1,
      currency: query.currency,
      limit: 40,
    },
    query.sort,
  );

  const failed = result.diagnostics.filter((entry) => entry.status !== "ok");
  const sortHref = (sort: SortMode) =>
    `/search?${new URLSearchParams({ ...query, sort }).toString()}`;

  return (
    <>
      <div className="mt-12 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[1.75rem]">
            {result.hotels.length} stay{result.hotels.length === 1 ? "" : "s"} in{" "}
            {query.destination}
          </h1>
          {/* Source count, not source telemetry. Response times are a developer
              concern and belong in the disclosure below, not in the headline. */}
          <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
            Cheapest of {result.diagnostics.length} source
            {result.diagnostics.length === 1 ? "" : "s"}, all taxes in
          </p>
        </div>

        <div className="flex items-center gap-0.5 rounded-full bg-[var(--color-accent-soft)] p-1 text-sm">
          <SortLink href={sortHref("best_price")} active={query.sort === "best_price"}>
            Price
          </SortLink>
          <SortLink href={sortHref("rating")} active={query.sort === "rating"}>
            Rating
          </SortLink>
          <SortLink href={sortHref("stars")} active={query.sort === "stars"}>
            Stars
          </SortLink>
        </div>
      </div>

      {failed.length > 0 && (
        <p className="mt-5 text-xs text-[var(--color-warn)]">
          {failed.map((entry) => entry.supplierLabel).join(", ")} didn&apos;t respond.
          Showing everything else.
        </p>
      )}

      {result.hotels.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="text-sm text-[var(--color-ink-soft)]">
            Nothing available for those dates. Try shifting them a day or two.
          </p>
        </div>
      ) : (
        <div className="mt-7 grid gap-2.5">
          {result.hotels.map((hotel, index) => (
            <HotelCard
              key={hotel.id}
              hotel={hotel}
              index={index}
              query={{
                checkIn: query.checkIn,
                checkOut: query.checkOut,
                guests: query.guests,
                destination: query.destination,
              }}
            />
          ))}
        </div>
      )}

      {/* Kept, because being able to see which source answered and how fast is
          genuinely useful — just not at the top of the page. */}
      <details className="mt-14 text-xs text-[var(--color-ink-faint)]">
        <summary className="cursor-pointer select-none hover:text-[var(--color-ink-soft)]">
          Sources checked
        </summary>
        <ul className="mt-3 space-y-1.5">
          {result.diagnostics.map((entry) => (
            <li key={entry.supplier} className="flex justify-between gap-4">
              <span>{entry.supplierLabel}</span>
              <span className="tabular">
                {entry.status === "ok"
                  ? `${entry.hotelsReturned} hotels · ${entry.durationMs}ms`
                  : entry.status}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}

function SortLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3.5 py-1.5 transition-colors ${
        active
          ? "bg-[var(--color-surface)] font-medium text-[var(--color-ink)] shadow-[var(--elev-1)]"
          : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
      }`}
    >
      {children}
    </Link>
  );
}

function ResultsSkeleton() {
  return (
    <div className="mt-[6.5rem] grid gap-2.5">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="card flex items-center gap-5 p-3">
          <div className="skeleton h-[132px] w-[176px] shrink-0" />
          <div className="flex-1 space-y-3">
            <div className="skeleton h-4 w-2/5" />
            <div className="skeleton h-3 w-3/5" />
          </div>
          <div className="skeleton h-7 w-24 shrink-0" />
        </div>
      ))}
    </div>
  );
}
