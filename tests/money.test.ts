import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatMoney, splitEqually, splitEvenly, toMinorUnits } from "../src/lib/money";

describe("splitEqually", () => {
  it("always sums back to the exact total", () => {
    for (const total of [1, 2, 99, 100, 101, 10_000, 14_237, 999_999]) {
      for (const people of [1, 2, 3, 4, 5, 6, 7, 11]) {
        const shares = splitEqually(total, people);
        assert.equal(shares.length, people);
        assert.equal(
          shares.reduce((sum, share) => sum + share, 0),
          total,
          `total ${total} across ${people} people`,
        );
      }
    }
  });

  it("distributes the odd cents rather than dropping them", () => {
    // 100 / 3 = 33.33… — someone has to take the extra cent.
    assert.deepEqual(splitEqually(100, 3), [34, 33, 33]);
  });

  it("keeps shares within one cent of each other", () => {
    const shares = splitEqually(1_000_001, 7);
    assert.ok(Math.max(...shares) - Math.min(...shares) <= 1);
  });
});

describe("splitEvenly", () => {
  it("honours weights", () => {
    assert.deepEqual(splitEvenly(300, [2, 1]), [200, 100]);
  });

  it("sums to the total with awkward weights", () => {
    const shares = splitEvenly(1_000, [1, 1, 1]);
    assert.equal(shares.reduce((sum, share) => sum + share, 0), 1_000);
  });

  it("rejects weights that sum to zero", () => {
    assert.throws(() => splitEvenly(100, [0, 0]));
  });
});

describe("toMinorUnits", () => {
  it("parses supplier strings without float drift", () => {
    assert.equal(toMinorUnits("412.76", "USD"), 41_276);
    assert.equal(toMinorUnits("0.1", "EUR"), 10);
    // 19.99 * 100 is 1998.9999... in IEEE754; rounding must save us.
    assert.equal(toMinorUnits(19.99, "EUR"), 1_999);
  });

  it("respects zero-decimal currencies", () => {
    assert.equal(toMinorUnits("15000", "JPY"), 15_000);
  });

  it("throws on unparseable input rather than silently zeroing", () => {
    assert.throws(() => toMinorUnits("not a price", "EUR"));
  });
});

describe("formatMoney", () => {
  it("renders minor units as major", () => {
    assert.equal(formatMoney(41_276, "USD"), "$412.76");
  });

  it("renders zero-decimal currencies without cents", () => {
    assert.equal(formatMoney(15_000, "JPY"), "¥15,000");
  });
});
