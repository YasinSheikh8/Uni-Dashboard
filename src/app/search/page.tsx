import { Suspense } from "react";
import Link from "next/link";
import { SearchForm } from "@/components/SearchForm";
import { HotelCard } from "@/components/HotelCard";
import { searchHotels, type SortMode } from "@/lib/suppliers/aggregator";
import { formatMoney } from "@/lib/money";

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
    <div className="mx-auto max-w-6xl px-5 py-8">
      <SearchForm compact defaults={query} />

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
      <p className="mt-10 text-sm text-[var(--color-ink-soft)]">
        Tell us where and when, and we&apos;ll price it everywhere at once.
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
  const totalSavings = result.hotels.reduce((sum, hotel) => sum + hotel.savedAmount, 0);

  const sortHref = (sort: SortMode) =>
    `/search?${new URLSearchParams({ ...query, sort }).toString()}`;

  return (
    <>
      <div className="mt-8 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.01em]">
            {result.hotels.length} stay{result.hotels.length === 1 ? "" : "s"} in{" "}
            {query.destination}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Checked {result.diagnostics.length} supplier
            {result.diagnostics.length === 1 ? "" : "s"} ·{" "}
            {result.diagnostics
              .map((entry) => `${entry.supplierLabel} ${entry.durationMs}ms`)
              .join(" · ")}
            {totalSavings > 0 && (
              <>
                {" · "}
                <span className="text-[var(--color-save)]">
                  {formatMoney(totalSavings, result.currency)} undercut across these results
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-1 text-sm">
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
        <p className="mt-4 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-warn-soft)] px-4 py-2.5 text-xs text-[var(--color-warn)]">
          {failed
            .map((entry) => `${entry.supplierLabel} did not answer (${entry.status})`)
            .join("; ")}
          . Showing what the other suppliers returned.
        </p>
      )}

      {result.hotels.length === 0 ? (
        <div className="card mt-6 p-8 text-center">
          <p className="text-sm text-[var(--color-ink-soft)]">
            Nothing available for those dates. Try shifting them by a day or two.
          </p>
        </div>
      ) : (
        <div className="mt-5 grid gap-3">
          {result.hotels.map((hotel) => (
            <HotelCard
              key={hotel.id}
              hotel={hotel}
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
      className={`rounded-[var(--radius-control)] px-3 py-1.5 ${
        active
          ? "bg-[var(--color-accent-soft)] font-semibold text-[var(--color-ink)]"
          : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
      }`}
    >
      {children}
    </Link>
  );
}

function ResultsSkeleton() {
  return (
    <div className="mt-10 grid gap-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="card flex overflow-hidden">
          <div className="skeleton h-40 w-56 shrink-0" />
          <div className="flex-1 space-y-3 p-5">
            <div className="skeleton h-4 w-2/5 rounded" />
            <div className="skeleton h-3 w-3/5 rounded" />
            <div className="skeleton h-3 w-1/4 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
