import Link from "next/link";
import { HotelImage } from "./HotelImage";
import { formatMoney } from "@/lib/money";
import type { AggregatedHotel } from "@/lib/suppliers/types";

/**
 * One real hotel, with every supplier that offered it collapsed behind the
 * winning price. The comparison is shown rather than asserted — if we claim a
 * saving, the losing quote is right there next to it.
 */
export function HotelCard({
  hotel,
  query,
}: {
  hotel: AggregatedHotel;
  query: { checkIn: string; checkOut: string; guests: string; destination: string };
}) {
  const perNight = Math.round(hotel.best.comparableAmount / Math.max(1, hotel.nights));
  const losing = hotel.quotes.slice(1);

  const href = `/book?${new URLSearchParams({
    hotel: hotel.id,
    supplier: hotel.best.supplier,
    rate: hotel.best.rate.supplierRateId,
    ...query,
  }).toString()}`;

  return (
    <article className="card group overflow-hidden transition-shadow hover:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_28px_-14px_rgba(0,0,0,0.18)]">
      <div className="flex flex-col sm:flex-row">
        <div className="relative h-44 w-full shrink-0 overflow-hidden bg-[var(--color-surface-sunken)] sm:h-auto sm:w-56">
          <HotelImage
            src={hotel.imageUrl}
            className="h-full min-h-36 w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        </div>

        <div className="flex flex-1 flex-col justify-between gap-4 p-5 sm:flex-row">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-[1.05rem] font-semibold tracking-[-0.01em]">
                {hotel.name}
              </h3>
              {hotel.starRating ? (
                <span className="pill pill-muted">{hotel.starRating}★</span>
              ) : null}
            </div>

            <p className="mt-1 truncate text-sm text-[var(--color-ink-soft)]">
              {hotel.address || hotel.city}
            </p>

            {hotel.reviewScore != null && (
              <p className="mt-2 text-sm">
                <span className="font-semibold">{hotel.reviewScore.toFixed(1)}</span>
                <span className="text-[var(--color-ink-faint)]">
                  {" "}
                  / 10
                  {hotel.reviewCount ? ` · ${hotel.reviewCount.toLocaleString()} reviews` : ""}
                </span>
              </p>
            )}

            {hotel.amenities.length > 0 && (
              <p className="mt-2 truncate text-xs text-[var(--color-ink-faint)]">
                {hotel.amenities.slice(0, 4).join(" · ")}
              </p>
            )}

            <p className="mt-3 text-xs text-[var(--color-ink-faint)]">
              {hotel.best.rate.roomName}
              {hotel.best.rate.boardType ? ` · ${hotel.best.rate.boardType}` : ""}
              {hotel.best.rate.refundable ? " · Free cancellation" : " · Non-refundable"}
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end sm:text-right">
            {hotel.savedAmount > 0 && (
              <span className="pill pill-save">
                Save {formatMoney(hotel.savedAmount, hotel.currency)}
              </span>
            )}

            <div className="tabular text-2xl font-semibold tracking-[-0.02em]">
              {formatMoney(hotel.best.comparableAmount, hotel.currency)}
            </div>
            <div className="text-xs text-[var(--color-ink-faint)]">
              {formatMoney(perNight, hotel.currency)} / night · {hotel.nights} night
              {hotel.nights === 1 ? "" : "s"} · all in
            </div>

            <div className="mt-1 text-xs text-[var(--color-ink-faint)]">
              via <span className="text-[var(--color-ink-soft)]">{hotel.best.supplierLabel}</span>
              {losing.length > 0 && (
                <>
                  {" · "}
                  {losing
                    .map(
                      (quote) =>
                        `${quote.supplierLabel} ${formatMoney(quote.comparableAmount, hotel.currency)}`,
                    )
                    .join(" · ")}
                </>
              )}
            </div>

            <Link href={href} className="btn btn-primary mt-3 w-full sm:w-auto">
              Select
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
