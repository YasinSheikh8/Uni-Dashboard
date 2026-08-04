/**
 * Amadeus Self-Service adapter.
 *
 * Docs: https://developers.amadeus.com/self-service/category/hotels
 *   - POST /v1/security/oauth2/token         (client_credentials)
 *   - GET  /v1/reference-data/locations      (resolve "Lisbon" -> LIS)
 *   - GET  /v1/reference-data/locations/hotels/by-city
 *   - GET  /v3/shopping/hotel-offers
 *   - POST /v2/booking/hotel-orders
 *
 * Amadeus splits property discovery from pricing: you list hotel ids for a
 * city, then ask for offers on those ids in batches. Batches are capped and
 * partially failing ones are common (a hotel with no availability 400s the
 * whole batch on some environments), so batches are issued in parallel and
 * failures are tolerated rather than fatal.
 */

import { toMinorUnits } from "../money";
import { nightsBetween } from "./liteapi";
import type {
  BookingRequest,
  BookingResult,
  HotelIdentity,
  RateProvider,
  RateQuote,
  SearchQuery,
  SupplierOffer,
} from "./types";

const SUPPLIER_ID = "amadeus";
/** Amadeus rejects very long hotelIds lists; keep batches conservative. */
const BATCH_SIZE = 20;

interface AmadeusOffer {
  id?: string;
  checkInDate?: string;
  checkOutDate?: string;
  boardType?: string;
  room?: {
    typeEstimated?: { category?: string; beds?: number; bedType?: string };
    description?: { text?: string };
  };
  price?: {
    currency?: string;
    base?: string;
    total?: string;
    taxes?: Array<{ amount?: string; included?: boolean }>;
  };
  policies?: {
    refundable?: { cancellationRefund?: string };
    cancellations?: Array<{ deadline?: string; amount?: string }>;
  };
}

interface AmadeusHotelOffers {
  hotel?: {
    hotelId?: string;
    name?: string;
    cityCode?: string;
    latitude?: number;
    longitude?: number;
    address?: { lines?: string[]; cityName?: string; countryCode?: string };
    rating?: string;
    amenities?: string[];
  };
  offers?: AmadeusOffer[];
  available?: boolean;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

export class AmadeusProvider implements RateProvider {
  readonly id = SUPPLIER_ID;
  readonly label = "Amadeus";

  private readonly clientId = process.env.AMADEUS_CLIENT_ID ?? "";
  private readonly clientSecret = process.env.AMADEUS_CLIENT_SECRET ?? "";
  private readonly baseUrl =
    process.env.AMADEUS_BASE_URL ?? "https://test.api.amadeus.com";

  isConfigured(): boolean {
    return this.clientId.length > 0 && this.clientSecret.length > 0;
  }

  private async token(signal?: AbortSignal): Promise<string> {
    // 30s of slack so a token never expires mid-flight.
    if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
      return cachedToken.value;
    }

    const response = await fetch(`${this.baseUrl}/v1/security/oauth2/token`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Amadeus auth failed: ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as { access_token: string; expires_in: number };
    cachedToken = {
      value: json.access_token,
      expiresAt: Date.now() + json.expires_in * 1000,
    };
    return cachedToken.value;
  }

  private async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    const token = await this.token(signal);
    const response = await fetch(`${this.baseUrl}${path}`, {
      signal,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Amadeus ${path} failed: ${response.status} ${body.slice(0, 300)}`,
      );
    }
    return (await response.json()) as T;
  }

  /** "Lisbon" -> "LIS". Amadeus hotel search is city-code driven. */
  private async resolveCityCode(
    query: SearchQuery,
    signal?: AbortSignal,
  ): Promise<string | null> {
    if (query.cityCode) return query.cityCode;

    const params = new URLSearchParams({
      subType: "CITY",
      keyword: query.destination,
      "page[limit]": "1",
    });
    if (query.countryCode) params.set("countryCode", query.countryCode);

    const json = await this.get<{ data?: Array<{ iataCode?: string }> }>(
      `/v1/reference-data/locations?${params.toString()}`,
      signal,
    );
    return json.data?.[0]?.iataCode ?? null;
  }

  async search(query: SearchQuery, signal?: AbortSignal): Promise<SupplierOffer[]> {
    const cityCode = await this.resolveCityCode(query, signal);
    if (!cityCode) return [];

    const nights = nightsBetween(query.checkIn, query.checkOut);
    const limit = query.limit ?? 40;

    const hotelList = await this.get<{ data?: Array<{ hotelId?: string }> }>(
      `/v1/reference-data/locations/hotels/by-city?cityCode=${encodeURIComponent(cityCode)}`,
      signal,
    );

    const hotelIds = (hotelList.data ?? [])
      .map((entry) => entry.hotelId)
      .filter((id): id is string => Boolean(id))
      .slice(0, limit);

    if (hotelIds.length === 0) return [];

    const batches: string[][] = [];
    for (let i = 0; i < hotelIds.length; i += BATCH_SIZE) {
      batches.push(hotelIds.slice(i, i + BATCH_SIZE));
    }

    const results = await Promise.allSettled(
      batches.map((batch) => {
        const params = new URLSearchParams({
          hotelIds: batch.join(","),
          adults: String(query.adults),
          checkInDate: query.checkIn,
          checkOutDate: query.checkOut,
          roomQuantity: String(query.rooms),
          currency: query.currency,
          bestRateOnly: "false",
        });
        return this.get<{ data?: AmadeusHotelOffers[] }>(
          `/v3/shopping/hotel-offers?${params.toString()}`,
          signal,
        );
      }),
    );

    const offers: SupplierOffer[] = [];

    for (const result of results) {
      // A batch where every hotel is sold out returns an error on some
      // Amadeus environments. Losing one batch is not losing the search.
      if (result.status !== "fulfilled") continue;

      for (const entry of result.value.data ?? []) {
        const hotelInfo = entry.hotel;
        if (!hotelInfo?.hotelId || !hotelInfo.name) continue;
        if (entry.available === false) continue;

        const quotes: RateQuote[] = [];

        for (const offer of entry.offers ?? []) {
          const currency = offer.price?.currency;
          const total = offer.price?.total;
          if (!currency || !total) continue;

          const taxes = (offer.price?.taxes ?? []).reduce(
            (sum, tax) => sum + Number.parseFloat(tax.amount ?? "0"),
            0,
          );

          const refundable =
            offer.policies?.refundable?.cancellationRefund === "REFUNDABLE_UP_TO_DEADLINE";

          quotes.push({
            supplier: SUPPLIER_ID,
            supplierRateId: offer.id ?? "",
            roomName:
              offer.room?.description?.text?.split("\n")[0] ??
              offer.room?.typeEstimated?.category ??
              "Standard room",
            boardType: offer.boardType,
            refundable,
            cancellationDeadline: offer.policies?.cancellations?.[0]?.deadline,
            currency,
            totalAmount: toMinorUnits(total, currency),
            taxesAndFees: toMinorUnits(taxes, currency),
            nights,
          });
        }

        if (quotes.length === 0) continue;
        quotes.sort((a, b) => a.totalAmount - b.totalAmount);

        const hotel: HotelIdentity = {
          supplier: SUPPLIER_ID,
          supplierHotelId: hotelInfo.hotelId,
          name: titleCase(hotelInfo.name),
          address: (hotelInfo.address?.lines ?? []).join(", "),
          city: hotelInfo.address?.cityName ?? query.destination,
          country: hotelInfo.address?.countryCode ?? query.countryCode ?? "",
          latitude: hotelInfo.latitude,
          longitude: hotelInfo.longitude,
          starRating: hotelInfo.rating ? Number.parseInt(hotelInfo.rating, 10) : undefined,
          // Amadeus Self-Service does not return photography.
          imageUrl: undefined,
          amenities: (hotelInfo.amenities ?? []).slice(0, 12).map(prettifyAmenity),
        };

        offers.push({ hotel, rates: quotes });
      }
    }

    return offers;
  }

  async book(request: BookingRequest): Promise<BookingResult> {
    const token = await this.token();

    const response = await fetch(`${this.baseUrl}/v2/booking/hotel-orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/vnd.amadeus+json",
      },
      body: JSON.stringify({
        data: {
          type: "hotel-order",
          guests: request.guests.map((guest, index) => ({
            tid: index + 1,
            title: "MR",
            firstName: guest.firstName,
            lastName: guest.lastName,
            phone: request.holder.phone,
            email: request.holder.email,
          })),
          travelAgent: { contact: { email: request.holder.email } },
          roomAssociations: [
            {
              guestReferences: request.guests.map((_, index) => ({
                guestReference: String(index + 1),
              })),
              hotelOfferId: request.supplierRateId,
            },
          ],
          // Amadeus test environment accepts a placeholder card; production
          // hotel-orders settle against the agency's own payment arrangement.
          payment: { method: "CREDIT_CARD", paymentCard: undefined },
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Amadeus booking failed: ${response.status} ${body.slice(0, 400)}`);
    }

    const json = (await response.json()) as {
      data?: {
        id?: string;
        hotelBookings?: Array<{
          id?: string;
          bookingStatus?: string;
          hotelProviderInformation?: Array<{ confirmationNumber?: string }>;
usedRate?: { price?: { total?: string; currency?: string } };
        }>;
      };
    };

    const booking = json.data?.hotelBookings?.[0];
    const ref = json.data?.id ?? booking?.id;
    if (!ref) throw new Error("Amadeus booking returned no order id");

    const currency = booking?.usedRate?.price?.currency ?? "EUR";
    const total = booking?.usedRate?.price?.total ?? "0";

    return {
      supplier: SUPPLIER_ID,
      supplierBookingRef: ref,
      confirmationCode:
        booking?.hotelProviderInformation?.[0]?.confirmationNumber ?? ref,
      chargedAmount: toMinorUnits(total, currency),
      currency,
    };
  }
}

/** Amadeus shouts hotel names in caps; the UI should not. */
function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (word.length > 2 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

function prettifyAmenity(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .join(" ")
    .replace(/^./, (char) => char.toUpperCase());
}
