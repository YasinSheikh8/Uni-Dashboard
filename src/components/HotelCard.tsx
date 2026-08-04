import Link from "next/link";
import { HotelImage } from "./HotelImage";
import { formatMoney } from "@/lib/money";
import type { AggregatedHotel } from "@/lib/suppliers/types";

/**
 * One hotel, one price, one action.
 *
 * Everything a previous version showed here — amenity lists, board type,
 * refundability, review counts, star pills, the per-supplier price breakdown —
 * has moved to the detail page. Ten competing elements per row is not a
 * comparison, it is a wall. What survives is what you actually choose between:
 * where it is, how it scores, what it costs.
 *
 * Only the winning price is shown. Competing quotes are never surfaced — the
 * comparison happens upstream and the customer sees its result, not its working
 * out. The savings mark states a delta without naming who lost.
 */
export function HotelCard({
  hotel,
  query,
  index = 0,
}: {
  hotel: AggregatedHotel;
  query: { checkIn: string; checkOut: string; guests: string; destination: string };
  index?: number;
}) {
  const headline = hotel.best ?? hotel.quotes[0];
  const perNight = Math.round(headline.comparableAmount / Math.max(1, hotel.nights));

  const href = hotel.best
    ? `/book?${new URLSearchParams({
        hotel: hotel.id,
        supplier: hotel.best.supplier,
        rate: hotel.best.rate.supplierRateId,
        ...query,
      }).toString()}`
    : null;

  const body = (
    <>
      <HotelImage
        src={hotel.imageUrl}
        className="h-48 w-full shrink-0 object-cover sm:h-[132px] sm:w-[176px] sm:rounded-[14px]"
      />

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h3 className="truncate text-[1.0625rem] font-semibold tracking-[-0.012em]">
            {hotel.name}
          </h3>

          <p className="mt-1.5 truncate text-sm text-[var(--color-ink-soft)]">
            {hotel.reviewScore != null && (
              <span className="tabular font-medium text-[var(--color-ink)]">
                {hotel.reviewScore.toFixed(1)}
              </span>
            )}
            {hotel.reviewScore != null && (hotel.address || hotel.city) && (
              <span className="mx-1.5 text-[var(--color-ink-faint)]">·</span>
            )}
            {hotel.address || hotel.city}
          </p>

        </div>

        <div className="flex shrink-0 items-end gap-4 sm:flex-col sm:items-end sm:gap-1.5">
          <div>
            <div className="tabular text-[1.625rem] font-semibold leading-none tracking-[-0.02em]">
              {formatMoney(headline.comparableAmount, hotel.currency)}
            </div>
            <div className="mt-1.5 text-xs text-[var(--color-ink-faint)] sm:text-right">
              {formatMoney(perNight, hotel.currency)} / night
            </div>
          </div>

          {hotel.savedAmount > 0 && (
            <span className="pill pill-save">
              −{formatMoney(hotel.savedAmount, hotel.currency)}
            </span>
          )}

        </div>
      </div>
    </>
  );

  const shell =
    "card card-interactive flex flex-col gap-4 overflow-hidden p-3 sm:flex-row sm:items-center sm:gap-5 sm:p-3";

  // The aggregator drops rows with nothing bookable, so `href` is effectively
  // always set. The fallback stays as a type guard, not as a code path with a
  // competitor link in it.
  if (!href) return null;

  return (
    <article className="rise" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
      <Link href={href} className={shell}>
        {body}
      </Link>
    </article>
  );
}
