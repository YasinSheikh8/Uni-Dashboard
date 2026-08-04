/**
 * Deterministic fixture supplier.
 *
 * Exists so the app runs end to end — search, compare, book, split — before
 * anyone has signed up for a supplier key. Two instances with different price
 * seeds are registered when no real credentials are present, which means the
 * cross-supplier matching and best-price logic are exercised for real rather
 * than short-circuited.
 *
 * Prices are a hash of (hotel, dates, supplier seed), so they are stable across
 * reloads — a result list that reshuffles on every refresh makes the price
 * comparison impossible to eyeball.
 */

import type {
  BookingRequest,
  BookingResult,
  HotelIdentity,
  RateProvider,
  RateQuote,
  SearchQuery,
  SupplierOffer,
} from "./types";
import { nightsBetween } from "./liteapi";

interface FixtureHotel {
  id: string;
  name: string;
  address: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  stars: number;
  reviewScore: number;
  reviewCount: number;
  imageUrl: string;
  amenities: string[];
  /** Nightly rack rate in major units, before per-supplier variance. */
  baseNightly: number;
}

const CATALOG: FixtureHotel[] = [
  {
    id: "fx-lisbon-1", name: "Bairro Alto Hotel", address: "Praça Luís de Camões 2",
    city: "Lisbon", country: "PT", latitude: 38.7107, longitude: -9.1434,
    stars: 5, reviewScore: 9.2, reviewCount: 1840,
    imageUrl: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80",
    amenities: ["Rooftop bar", "Free WiFi", "Air conditioning", "Concierge", "Breakfast"],
    baseNightly: 340,
  },
  {
    id: "fx-lisbon-2", name: "Memmo Alfama", address: "Travessa das Merceeiras 27",
    city: "Lisbon", country: "PT", latitude: 38.7118, longitude: -9.1289,
    stars: 4, reviewScore: 8.9, reviewCount: 2210,
    imageUrl: "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800&q=80",
    amenities: ["Outdoor pool", "Free WiFi", "Terrace", "Bar"],
    baseNightly: 245,
  },
  {
    id: "fx-lisbon-3", name: "The Ivens Autograph Collection", address: "Rua Capelo 5",
    city: "Lisbon", country: "PT", latitude: 38.7096, longitude: -9.1418,
    stars: 5, reviewScore: 9.4, reviewCount: 980,
    imageUrl: "https://images.unsplash.com/photo-1590490360182-c33d57733427?w=800&q=80",
    amenities: ["Spa", "Restaurant", "Free WiFi", "Fitness centre", "Room service"],
    baseNightly: 410,
  },
  {
    id: "fx-lisbon-4", name: "Lisboa Pessoa Hotel", address: "Rua dos Fanqueiros 148",
    city: "Lisbon", country: "PT", latitude: 38.7124, longitude: -9.1364,
    stars: 4, reviewScore: 8.6, reviewCount: 1520,
    imageUrl: "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800&q=80",
    amenities: ["Rooftop pool", "Free WiFi", "Breakfast", "Bar"],
    baseNightly: 198,
  },
  {
    id: "fx-lisbon-5", name: "Hotel Avenida Palace", address: "Rua 1º de Dezembro 123",
    city: "Lisbon", country: "PT", latitude: 38.7148, longitude: -9.1409,
    stars: 5, reviewScore: 9.0, reviewCount: 3100,
    imageUrl: "https://images.unsplash.com/photo-1445019980597-93fa8acb246c?w=800&q=80",
    amenities: ["Historic building", "Free WiFi", "Bar", "Concierge", "Fitness centre"],
    baseNightly: 288,
  },
  {
    id: "fx-lisbon-6", name: "Casa Balthazar", address: "Rua do Duque 26",
    city: "Lisbon", country: "PT", latitude: 38.7132, longitude: -9.1421,
    stars: 4, reviewScore: 9.1, reviewCount: 640,
    imageUrl: "https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=800&q=80",
    amenities: ["Plunge pool", "Free WiFi", "Kitchenette", "City view"],
    baseNightly: 225,
  },
  {
    id: "fx-lisbon-7", name: "Hotel da Baixa", address: "Rua da Prata 231",
    city: "Lisbon", country: "PT", latitude: 38.7119, longitude: -9.1375,
    stars: 4, reviewScore: 8.4, reviewCount: 1180,
    imageUrl: "https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=800&q=80",
    amenities: ["Free WiFi", "Bar", "Air conditioning", "Breakfast"],
    baseNightly: 176,
  },
  {
    id: "fx-lisbon-8", name: "Corpo Santo Lisbon Historical Hotel",
    address: "Largo do Corpo Santo 25",
    city: "Lisbon", country: "PT", latitude: 38.7076, longitude: -9.1447,
    stars: 5, reviewScore: 9.5, reviewCount: 2740,
    imageUrl: "https://images.unsplash.com/photo-1582719508461-905c673771fd?w=800&q=80",
    amenities: ["Free WiFi", "Lounge", "Breakfast", "Fitness centre", "Bar"],
    baseNightly: 312,
  },
];

const ROOM_TYPES = [
  { name: "Classic double", multiplier: 1, board: "Room only", refundable: false },
  { name: "Superior double", multiplier: 1.18, board: "Breakfast included", refundable: true },
  { name: "Deluxe king", multiplier: 1.42, board: "Breakfast included", refundable: true },
];

/** Stable 32-bit hash so a given (hotel, dates, supplier) always prices the same. */
function hash(input: string): number {
  let value = 2166136261;
  for (let i = 0; i < input.length; i++) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return Math.abs(value);
}

/** Deterministic float in [min, max). */
function seeded(input: string, min: number, max: number): number {
  return min + (hash(input) % 10_000) / 10_000 * (max - min);
}

export class FixtureProvider implements RateProvider {
  readonly id: string;
  readonly label: string;
  /** Per-supplier price bias, so the two fixture sources genuinely disagree. */
  private readonly bias: number;

  constructor(id: string, label: string, bias: number) {
    this.id = id;
    this.label = label;
    this.bias = bias;
  }

  isConfigured(): boolean {
    return true;
  }

  async search(query: SearchQuery): Promise<SupplierOffer[]> {
    const nights = nightsBetween(query.checkIn, query.checkOut);

    // Simulate real network latency so loading states are actually exercised.
    await new Promise((resolve) => setTimeout(resolve, 120 + (hash(this.id) % 260)));

    const destination = query.destination.trim().toLowerCase();
    const matches = CATALOG.filter(
      (hotel) =>
        destination.length === 0 ||
        hotel.city.toLowerCase().includes(destination) ||
        destination.includes(hotel.city.toLowerCase()) ||
        hotel.name.toLowerCase().includes(destination),
    );

    // Unknown destination: still return the catalog so a demo never dead-ends.
    const pool = matches.length > 0 ? matches : CATALOG;

    return pool
      // Each fixture supplier is missing a couple of properties, exactly like
      // real suppliers with different contracted inventory.
      .filter((hotel) => hash(`${this.id}:${hotel.id}:inventory`) % 10 !== 0)
      .map((hotel) => {
        const identity: HotelIdentity = {
          supplier: this.id,
          supplierHotelId: `${this.id}-${hotel.id}`,
          name: hotel.name,
          address: hotel.address,
          city: hotel.city,
          country: hotel.country,
          // Jitter the coordinates a little: real suppliers never agree
          // exactly, and the matcher has to survive that.
          latitude: hotel.latitude + seeded(`${this.id}:${hotel.id}:lat`, -0.0004, 0.0004),
          longitude: hotel.longitude + seeded(`${this.id}:${hotel.id}:lng`, -0.0004, 0.0004),
          starRating: hotel.stars,
          reviewScore: hotel.reviewScore,
          reviewCount: hotel.reviewCount,
          imageUrl: hotel.imageUrl,
          amenities: hotel.amenities,
        };

        const supplierFactor =
          this.bias * seeded(`${this.id}:${hotel.id}:${query.checkIn}`, 0.88, 1.14);

        const rates: RateQuote[] = ROOM_TYPES.map((room, index) => {
          const nightly = hotel.baseNightly * room.multiplier * supplierFactor;
          const total = Math.round(nightly * nights * 100);
          const taxes = Math.round(total * 0.11);

          return {
            supplier: this.id,
            supplierRateId: `${this.id}|${hotel.id}|${index}|${query.checkIn}`,
            roomName: room.name,
            boardType: room.board,
            refundable: room.refundable,
            cancellationDeadline: room.refundable
              ? new Date(Date.parse(`${query.checkIn}T00:00:00Z`) - 86_400_000 * 2).toISOString()
              : undefined,
            currency: query.currency,
            totalAmount: total,
            taxesAndFees: taxes,
            nights,
          };
        }).sort((a, b) => a.totalAmount - b.totalAmount);

        return { hotel: identity, rates };
      });
  }

  async book(request: BookingRequest): Promise<BookingResult> {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const ref = `${this.id.toUpperCase()}-${hash(request.clientReference).toString(36).toUpperCase().slice(0, 8)}`;
    return {
      supplier: this.id,
      supplierBookingRef: ref,
      confirmationCode: ref,
      chargedAmount: 0, // caller keeps the quoted amount for fixtures
      currency: "EUR",
    };
  }
}
