/**
 * Normalized shapes every rate supplier is adapted into.
 *
 * The whole point of this layer: nothing downstream (aggregator, API routes,
 * UI, booking engine) ever sees a supplier-specific field. Adding a third
 * source is writing one file that implements `RateProvider` and registering it.
 */

export type SupplierId = string;

export interface SearchQuery {
  /** Free-text destination as typed by the user, e.g. "Lisbon". */
  destination: string;
  /** ISO 3166-1 alpha-2, when we managed to resolve one. */
  countryCode?: string;
  /** IATA city code, needed by Amadeus. */
  cityCode?: string;
  latitude?: number;
  longitude?: number;
  /** YYYY-MM-DD */
  checkIn: string;
  /** YYYY-MM-DD */
  checkOut: string;
  adults: number;
  rooms: number;
  /** ISO 4217. Every supplier is asked to quote in this currency. */
  currency: string;
  limit?: number;
}

export interface HotelIdentity {
  supplier: SupplierId;
  supplierHotelId: string;
  name: string;
  address: string;
  city: string;
  country: string;
  latitude?: number;
  longitude?: number;
  /** 1-5 stars, as published by the supplier. */
  starRating?: number;
  /** 0-10 guest review score. */
  reviewScore?: number;
  reviewCount?: number;
  imageUrl?: string;
  amenities: string[];
}

export interface RateQuote {
  supplier: SupplierId;
  /** Opaque supplier token used to prebook/book this exact rate. */
  supplierRateId: string;
  roomName: string;
  /** room-only, breakfast, half-board, all-inclusive… */
  boardType?: string;
  refundable: boolean;
  /** ISO timestamp after which free cancellation no longer applies. */
  cancellationDeadline?: string;
  currency: string;
  /** Total the guest pays for the whole stay, all taxes and fees in. Minor units. */
  totalAmount: number;
  /** Portion of totalAmount that is taxes and fees. Minor units. */
  taxesAndFees: number;
  nights: number;
}

export interface SupplierOffer {
  hotel: HotelIdentity;
  /** Cheapest-first. A supplier may return several room types per hotel. */
  rates: RateQuote[];
}

export interface BookingRequest {
  supplierRateId: string;
  supplierHotelId: string;
  checkIn: string;
  checkOut: string;
  holder: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  guests: Array<{ firstName: string; lastName: string }>;
  /** Our own booking id, passed through for reconciliation. */
  clientReference: string;
}

export interface BookingResult {
  supplier: SupplierId;
  supplierBookingRef: string;
  confirmationCode: string;
  /** What the supplier actually charged, in case it drifted from the quote. */
  chargedAmount: number;
  currency: string;
}

export interface RateProvider {
  readonly id: SupplierId;
  /** Human-readable, shown in the price-comparison breakdown. */
  readonly label: string;
  /** False when required credentials are missing — provider is skipped. */
  isConfigured(): boolean;
  search(query: SearchQuery, signal?: AbortSignal): Promise<SupplierOffer[]>;
  book(request: BookingRequest): Promise<BookingResult>;
}

/** One supplier's best quote for a hotel, as shown in the comparison table. */
export interface SupplierQuote {
  supplier: SupplierId;
  supplierLabel: string;
  supplierHotelId: string;
  rate: RateQuote;
  /** totalAmount converted into the search currency, for ranking. */
  comparableAmount: number;
}

/**
 * One real-world hotel, with every supplier that offered it collapsed into a
 * single row and the winner picked.
 */
export interface AggregatedHotel {
  /** Stable id for this hotel across suppliers, derived from the match key. */
  id: string;
  name: string;
  address: string;
  city: string;
  country: string;
  latitude?: number;
  longitude?: number;
  starRating?: number;
  reviewScore?: number;
  reviewCount?: number;
  imageUrl?: string;
  amenities: string[];

  /** The winning quote — what the user pays. */
  best: SupplierQuote;
  /** Every supplier's best quote, cheapest first. Includes `best`. */
  quotes: SupplierQuote[];
  /**
   * How much cheaper `best` is than the next-cheapest supplier for the same
   * hotel. Zero when only one supplier had it.
   */
  savedAmount: number;
  currency: string;
  nights: number;
}

export interface SearchDiagnostics {
  supplier: SupplierId;
  supplierLabel: string;
  /** ok | skipped | error | timeout */
  status: string;
  hotelsReturned: number;
  durationMs: number;
  error?: string;
}

export interface AggregatedSearchResult {
  hotels: AggregatedHotel[];
  diagnostics: SearchDiagnostics[];
  currency: string;
  nights: number;
  /** Suppliers that actually answered. */
  suppliersQueried: number;
}
