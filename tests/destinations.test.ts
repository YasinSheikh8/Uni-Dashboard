import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveDestination, suggestionsFor } from "../src/lib/destinations";

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
