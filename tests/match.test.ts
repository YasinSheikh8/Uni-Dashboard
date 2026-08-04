import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clusterHotels, isSameHotel, normalizeName, similarity } from "../src/lib/suppliers/match";
import type { HotelIdentity } from "../src/lib/suppliers/types";

function hotel(partial: Partial<HotelIdentity> & { name: string }): HotelIdentity {
  return {
    supplier: "test",
    supplierHotelId: partial.name,
    address: "",
    city: "Lisbon",
    country: "PT",
    amenities: [],
    ...partial,
  };
}

describe("normalizeName", () => {
  it("strips noise words and punctuation", () => {
    assert.equal(normalizeName("The Bairro Alto Hotel"), "bairro alto");
  });

  it("strips diacritics so suppliers spelling it differently still match", () => {
    assert.equal(normalizeName("Hôtel Münchén"), normalizeName("Hotel Munchen"));
  });
});

describe("similarity", () => {
  it("scores identical strings at 1", () => {
    assert.equal(similarity("marriott", "marriott"), 1);
  });

  it("scores unrelated strings low", () => {
    assert.ok(similarity("marriott", "pestana") < 0.2);
  });
});

describe("isSameHotel", () => {
  it("matches the same building across suppliers despite coordinate jitter", () => {
    const a = hotel({ name: "Bairro Alto Hotel", latitude: 38.7107, longitude: -9.1434 });
    const b = hotel({ name: "The Bairro Alto", latitude: 38.7108, longitude: -9.1435 });
    assert.equal(isSameHotel(a, b), true);
  });

  it("does not merge two different hotels at one address", () => {
    // Hilton and Hampton genuinely share complexes; proximity alone must not win.
    const a = hotel({ name: "Hilton Garden Inn", latitude: 38.71, longitude: -9.14 });
    const b = hotel({ name: "Pestana Palace", latitude: 38.71, longitude: -9.14 });
    assert.equal(isSameHotel(a, b), false);
  });

  it("does not merge the same brand in different cities", () => {
    const a = hotel({ name: "Marriott", city: "Lisbon", latitude: 38.7, longitude: -9.1 });
    const b = hotel({ name: "Marriott", city: "Porto", latitude: 41.1, longitude: -8.6 });
    assert.equal(isSameHotel(a, b), false);
  });

  it("falls back to strict name matching without coordinates", () => {
    const a = hotel({ name: "Memmo Alfama" });
    const b = hotel({ name: "Memmo Alfama Hotel" });
    assert.equal(isSameHotel(a, b), true);

    const c = hotel({ name: "Memmo Principe Real" });
    assert.equal(isSameHotel(a, c), false);
  });
});

describe("clusterHotels", () => {
  it("collapses one property offered by two suppliers into a single cluster", () => {
    const items = [
      { hotel: hotel({ name: "Memmo Alfama", latitude: 38.7118, longitude: -9.1289 }) },
      { hotel: hotel({ name: "Memmo Alfama Hotel", latitude: 38.7119, longitude: -9.1289 }) },
      { hotel: hotel({ name: "Hotel da Baixa", latitude: 38.7119, longitude: -9.1375 }) },
    ];

    const clusters = clusterHotels(items);
    assert.equal(clusters.length, 2);
    assert.equal(clusters.find((cluster) => cluster.length === 2)?.length, 2);
  });
});
