import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveDestination,
  suggestDestinations,
  suggestionsFor,
} from "../src/lib/destinations";

describe("resolveDestination", () => {
  it("reads an explicit ISO code", () => {
    const r = resolveDestination("Lisbon, PT");
    assert.equal(r.city, "Lisbon");
    assert.equal(r.countryCode, "PT");
    assert.equal(r.source, "explicit");
  });

  it("reads an explicit country name", () => {
    const r = resolveDestination("Lisbon, Portugal");
    assert.equal(r.countryCode, "PT");
    assert.equal(r.source, "explicit");
  });

  it("resolves a bare major city", () => {
    // This is the case that was silently breaking LiteAPI.
    const r = resolveDestination("Lisbon");
    assert.equal(r.countryCode, "PT");
    assert.equal(r.source, "known-city");
  });

  it("is case and accent tolerant", () => {
    assert.equal(resolveDestination("LISBOA").countryCode, "PT");
    assert.equal(resolveDestination("münchen").countryCode, "DE");
  });

  it("handles multi-word cities", () => {
    assert.equal(resolveDestination("New York").countryCode, "US");
    assert.equal(resolveDestination("Cape Town").countryCode, "ZA");
  });

  it("falls back to the city when a trailing region is not a country", () => {
    const r = resolveDestination("Brooklyn, New York");
    assert.equal(r.city, "Brooklyn");
    assert.equal(r.source, "unresolved");
  });

  it("reports unresolved rather than guessing a country", () => {
    const r = resolveDestination("Somewhereville");
    assert.equal(r.countryCode, undefined);
    assert.equal(r.source, "unresolved");
  });

  it("survives empty input", () => {
    assert.equal(resolveDestination("   ").city, "");
  });
});

describe("suggestionsFor", () => {
  it("offers completions with their country attached", () => {
    const s = suggestionsFor("lis");
    assert.ok(s.some((entry) => entry.includes("PT")));
  });

  it("stays quiet on a single character", () => {
    assert.deepEqual(suggestionsFor("l"), []);
  });
});

describe("suggestDestinations", () => {
  it("ranks prefix matches before substring matches", () => {
    const results = suggestDestinations("por");
    assert.ok(results.length > 0);
    assert.equal(results[0].city.toLowerCase().startsWith("por"), true);
  });

  it("returns a value the resolver can round-trip", () => {
    // This is the contract that fixes the LiteAPI bug: whatever the list puts
    // in the box must resolve to a complete location.
    for (const suggestion of suggestDestinations("lis")) {
      const resolved = resolveDestination(suggestion.value);
      assert.equal(resolved.countryCode, suggestion.countryCode);
      assert.equal(resolved.source, "explicit");
    }
  });

  it("collapses alternate spellings onto one row", () => {
    const values = suggestDestinations("lisb").map((s) => s.value);
    assert.equal(values.filter((v) => v.endsWith(", PT")).length, 1, values.join(","));
  });

  it("still matches an accented or local spelling", () => {
    assert.equal(suggestDestinations("münch")[0]?.value, "Munich, DE");
    assert.equal(suggestDestinations("munch")[0]?.value, "Munich, DE");
  });

  it("labels with the country name, not the code", () => {
    assert.equal(suggestDestinations("lisb")[0].label, "Lisbon, Portugal");
  });

  it("stays quiet under two characters", () => {
    assert.deepEqual(suggestDestinations("l"), []);
  });

  it("returns nothing for an unknown place rather than guessing", () => {
    assert.deepEqual(suggestDestinations("zzzzz"), []);
  });
});
