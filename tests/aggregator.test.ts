import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { searchHotels } from "../src/lib/suppliers/aggregator";
import { FixtureProvider } from "../src/lib/suppliers/fixture";
import type {
  RateProvider,
  SearchQuery,
  SupplierOffer,
} from "../src/lib/suppliers/types";

const QUERY: SearchQuery = {
  destination: "Lisbon",
  checkIn: "2026-09-10",
  checkOut: "2026-09-13",
  adults: 2,
  rooms: 1,
  currency: "EUR",
};

/** Stands in for a scraper: always undercuts, never sellable. */
class UndercuttingReference implements RateProvider {
  readonly id = "scrape:test";
  readonly label = "CheapSite (reference)";
  readonly bookable = false;

  constructor(private readonly hotels: Array<{ name: string; total: number }>) {}

  isConfigured() {
    return true;
  }

  async search(): Promise<SupplierOffer[]> {
    return this.hotels.map((entry, index) => ({
      hotel: {
        supplier: this.id,
        supplierHotelId: `ref-${index}`,
        name: entry.name,
        address: "",
        city: "Lisbon",
        country: "PT",
        amenities: [],
      },
      rates: [
        {
          supplier: this.id,
          supplierRateId: "",
          roomName: "Listed price",
          refundable: false,
          currency: "EUR",
          totalAmount: entry.total,
          taxesAndFees: 0,
          nights: 3,
          bookable: false,
          deepLinkUrl: "https://cheapsite.example/h/1",
        },
      ],
    }));
  }

  async book(): Promise<never> {
    throw new Error("not bookable");
  }
}

describe("searchHotels with a reference source", () => {
  it("never lets an unbookable quote become the booking winner", async () => {
    const supplier = new FixtureProvider("fixture-a", "Demo Supplier A", 1);
    const baseline = await searchHotels(QUERY, "best_price", [supplier]);
    const target = baseline.hotels[0];
    assert.ok(target.best, "fixture supplier should produce a bookable winner");

    // Undercut it by €100.
    const undercut = target.best!.comparableAmount - 10_000;
    const reference = new UndercuttingReference([{ name: target.name, total: undercut }]);

    const result = await searchHotels(QUERY, "best_price", [supplier, reference]);
    const merged = result.hotels.find((hotel) => hotel.name === target.name);

    assert.ok(merged, "the reference quote should merge into the existing hotel row");
    assert.equal(merged!.best!.bookable, true, "winner must be bookable");
    assert.equal(merged!.best!.supplier, "fixture-a");
    assert.equal(
      merged!.best!.comparableAmount,
      target.best!.comparableAmount,
      "the bookable price must not change because something cheaper was observed",
    );
  });

  it("surfaces the cheaper reference price instead of hiding it", async () => {
    const supplier = new FixtureProvider("fixture-a", "Demo Supplier A", 1);
    const baseline = await searchHotels(QUERY, "best_price", [supplier]);
    const target = baseline.hotels[0];
    const undercut = target.best!.comparableAmount - 10_000;

    const reference = new UndercuttingReference([{ name: target.name, total: undercut }]);
    const result = await searchHotels(QUERY, "best_price", [supplier, reference]);
    const merged = result.hotels.find((hotel) => hotel.name === target.name)!;

    assert.ok(merged.cheaperElsewhere, "a cheaper reference price must be disclosed");
    assert.equal(merged.cheaperElsewhere!.comparableAmount, undercut);
    assert.equal(merged.cheaperElsewhere!.bookable, false);
    assert.equal(merged.cheaperElsewhere!.deepLinkUrl, "https://cheapsite.example/h/1");
  });

  it("does not claim a saving against a source that cannot sell", async () => {
    const supplier = new FixtureProvider("fixture-a", "Demo Supplier A", 1);
    const baseline = await searchHotels(QUERY, "best_price", [supplier]);
    const target = baseline.hotels[0];

    // Reference price ABOVE ours: savedAmount compares bookable sources only,
    // so a pricier listing must not inflate the claimed saving.
    const reference = new UndercuttingReference([
      { name: target.name, total: target.best!.comparableAmount + 50_000 },
    ]);
    const result = await searchHotels(QUERY, "best_price", [supplier, reference]);
    const merged = result.hotels.find((hotel) => hotel.name === target.name)!;

    assert.equal(merged.savedAmount, 0);
    assert.equal(merged.cheaperElsewhere, null);
  });

  it("marks a hotel only a reference source has as unbookable", async () => {
    const supplier = new FixtureProvider("fixture-a", "Demo Supplier A", 1);
    const reference = new UndercuttingReference([
      { name: "Reference Only Palace", total: 12_345 },
    ]);

    const result = await searchHotels(QUERY, "best_price", [supplier, reference]);
    const orphan = result.hotels.find((hotel) => hotel.name === "Reference Only Palace");

    assert.ok(orphan, "the hotel should still appear as a referral row");
    assert.equal(orphan!.best, null, "there is nothing bookable to select");
    assert.equal(orphan!.quotes.length, 1);
  });
});
