/**
 * LiteAPI (nuitee) adapter.
 *
 * Docs: https://docs.liteapi.travel/reference/post_hotels-rates
 *       https://docs.liteapi.travel/reference/post_rates-prebook
 *       https://docs.liteapi.travel/reference/post_rates-book
 *
 * Two calls make up a search: `/data/hotels` for property metadata (name,
 * address, coordinates, photo) and `/hotels/rates` for live prices. They are
 * joined on hotelId. Booking is the three-step prebook -> book flow LiteAPI
 * requires; a rate must be prebooked before it can be sold, which is also
 * where the final price is confirmed.
 *
 * Response parsing is deliberately defensive: every field is optional-checked
 * because supplier payloads drift and a missing photo should never take down a
 * search.
 */

import { toMinorUnits } from "../money";
import type {
  BookingRequest,
  BookingResult,
  HotelIdentity,
  RateProvider,
  RateQuote,
  SearchQuery,
  SupplierOffer,
} from "./types";

const SUPPLIER_ID = "liteapi";

interface LiteApiHotel {
  id?: string;
  hotelId?: string;
  name?: string;
  address?: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  stars?: number;
  rating?: number;
  reviewCount?: number;
  main_photo?: string;
  thumbnail?: string;
  hotelFacilities?: string[];
}

interface LiteApiRate {
  rateId?: string;
  name?: string;
  boardName?: string;
  boardType?: string;
  cancellationPolicies?: {
    refundableTag?: string;
    cancelPolicyInfos?: Array<{ cancelTime?: string; amount?: number }>;
  };
  retailRate?: {
    total?: Array<{ amount?: number; currency?: string }>;
    taxesAndFees?: Array<{ amount?: number; currency?: string; included?: boolean }>;
  };
}

interface LiteApiRoomType {
  offerId?: string;
  rates?: LiteApiRate[];
}

interface LiteApiRatesEntry {
  hotelId?: string;
  roomTypes?: LiteApiRoomType[];
}

function first<T>(value: T[] | undefined): T | undefined {
  return Array.isArray(value) && value.length > 0 ? value[0] : undefined;
}

export class LiteApiProvider implements RateProvider {
  readonly id = SUPPLIER_ID;
  readonly label = "LiteAPI";
  readonly bookable = true;

  private readonly apiKey = process.env.LITEAPI_KEY ?? "";
  private readonly baseUrl =
    process.env.LITEAPI_BASE_URL ?? "https://api.liteapi.travel/v3.0";

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      signal,
      headers: {
        "X-API-Key": this.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `LiteAPI ${path} failed: ${response.status} ${response.statusText} ${body.slice(0, 300)}`,
      );
    }

    return (await response.json()) as T;
  }

  async search(query: SearchQuery, signal?: AbortSignal): Promise<SupplierOffer[]> {
    const nights = nightsBetween(query.checkIn, query.checkOut);
    const limit = query.limit ?? 40;

    const locationParams = new URLSearchParams({ limit: String(limit) });
    if (query.countryCode) locationParams.set("countryCode", query.countryCode);
    if (query.destination) locationParams.set("cityName", query.destination);
    if (query.latitude != null && query.longitude != null) {
      locationParams.set("latitude", String(query.latitude));
      locationParams.set("longitude", String(query.longitude));
      locationParams.set("radius", "15000");
    }

    const metadataPromise = this.request<{ data?: LiteApiHotel[] }>(
      `/data/hotels?${locationParams.toString()}`,
      { method: "GET" },
      signal,
    );

    const ratesBody: Record<string, unknown> = {
      checkin: query.checkIn,
      checkout: query.checkOut,
      currency: query.currency,
      guestNationality: query.countryCode ?? "US",
      occupancies: Array.from({ length: query.rooms }, () => ({
        adults: Math.max(1, Math.ceil(query.adults / query.rooms)),
      })),
      limit,
    };
    if (query.countryCode) ratesBody.countryCode = query.countryCode;
    if (query.destination) ratesBody.cityName = query.destination;
    if (query.latitude != null && query.longitude != null) {
      ratesBody.latitude = query.latitude;
      ratesBody.longitude = query.longitude;
      ratesBody.radius = 15000;
    }

    const ratesPromise = this.request<{ data?: LiteApiRatesEntry[] }>(
      "/hotels/rates",
      { method: "POST", body: JSON.stringify(ratesBody) },
      signal,
    );

    const [metadata, rates] = await Promise.all([metadataPromise, ratesPromise]);

    const hotelsById = new Map<string, LiteApiHotel>();
    for (const hotel of metadata.data ?? []) {
      const id = hotel.id ?? hotel.hotelId;
      if (id) hotelsById.set(id, hotel);
    }

    const offers: SupplierOffer[] = [];

    for (const entry of rates.data ?? []) {
      const hotelId = entry.hotelId;
      if (!hotelId) continue;

      const meta = hotelsById.get(hotelId);
      // A price with no property behind it is unusable in a result list.
      if (!meta?.name) continue;

      const quotes: RateQuote[] = [];

      for (const roomType of entry.roomTypes ?? []) {
        for (const rate of roomType.rates ?? []) {
          const total = first(rate.retailRate?.total);
          if (!total?.amount || !total.currency) continue;

          const taxes = (rate.retailRate?.taxesAndFees ?? []).reduce(
            (sum, tax) => sum + (tax.amount ?? 0),
            0,
          );

          const refundableTag = rate.cancellationPolicies?.refundableTag;
          const deadline = first(rate.cancellationPolicies?.cancelPolicyInfos)?.cancelTime;

          quotes.push({
            supplier: SUPPLIER_ID,
            // The offerId is what prebook consumes, so that is the token we keep.
            supplierRateId: roomType.offerId ?? rate.rateId ?? "",
            roomName: rate.name ?? "Standard room",
            boardType: rate.boardName ?? rate.boardType,
            refundable: refundableTag === "RFN",
            cancellationDeadline: deadline,
            currency: total.currency,
            totalAmount: toMinorUnits(total.amount, total.currency),
            taxesAndFees: toMinorUnits(taxes, total.currency),
            nights,
            bookable: true,
          });
        }
      }

      if (quotes.length === 0) continue;
      quotes.sort((a, b) => a.totalAmount - b.totalAmount);

      const hotel: HotelIdentity = {
        supplier: SUPPLIER_ID,
        supplierHotelId: hotelId,
        name: meta.name,
        address: meta.address ?? "",
        city: meta.city ?? query.destination,
        country: meta.country ?? query.countryCode ?? "",
        latitude: meta.latitude,
        longitude: meta.longitude,
        starRating: meta.stars,
        reviewScore: meta.rating,
        reviewCount: meta.reviewCount,
        imageUrl: meta.main_photo ?? meta.thumbnail,
        amenities: (meta.hotelFacilities ?? []).slice(0, 12),
      };

      offers.push({ hotel, rates: quotes });
    }

    return offers;
  }

  async book(request: BookingRequest): Promise<BookingResult> {
    // Step 1 — prebook locks the rate and returns the price LiteAPI will honour.
    const prebook = await this.request<{
      data?: { prebookId?: string; price?: number; currency?: string };
    }>("/rates/prebook", {
      method: "POST",
      body: JSON.stringify({ offerId: request.supplierRateId, usePaymentSdk: false }),
    });

    const prebookId = prebook.data?.prebookId;
    if (!prebookId) {
      throw new Error("LiteAPI prebook returned no prebookId — rate is gone");
    }

    // Step 2 — sell it.
    const booked = await this.request<{
      data?: {
        bookingId?: string;
        clientReference?: string;
        supplierBookingId?: string;
        status?: string;
        price?: number;
        currency?: string;
      };
    }>("/rates/book", {
      method: "POST",
      body: JSON.stringify({
        prebookId,
        holder: {
          firstName: request.holder.firstName,
          lastName: request.holder.lastName,
          email: request.holder.email,
          phone: request.holder.phone,
        },
        guests: request.guests.map((guest) => ({
          occupancyNumber: 1,
          firstName: guest.firstName,
          lastName: guest.lastName,
          email: request.holder.email,
        })),
        clientReference: request.clientReference,
      }),
    });

    const bookingId = booked.data?.bookingId;
    if (!bookingId) throw new Error("LiteAPI book returned no bookingId");

    const currency = booked.data?.currency ?? prebook.data?.currency ?? "USD";
    const charged = booked.data?.price ?? prebook.data?.price ?? 0;

    return {
      supplier: SUPPLIER_ID,
      supplierBookingRef: bookingId,
      confirmationCode: booked.data?.supplierBookingId ?? bookingId,
      chargedAmount: toMinorUnits(charged, currency),
      currency,
    };
  }
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  const start = Date.parse(`${checkIn}T00:00:00Z`);
  const end = Date.parse(`${checkOut}T00:00:00Z`);
  const nights = Math.round((end - start) / 86_400_000);
  return Math.max(1, nights);
}
