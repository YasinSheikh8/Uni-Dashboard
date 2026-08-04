import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attemptsError,
  codeMatches,
  generateCode,
  hashCode,
  isSixDigits,
  MAX_ATTEMPTS,
} from "../src/lib/otp-core";

describe("generateCode", () => {
  it("always produces six digits, including leading zeros", () => {
    for (let i = 0; i < 500; i++) {
      const code = generateCode();
      assert.match(code, /^\d{6}$/, `bad code: ${code}`);
    }
  });

  it("is not obviously deterministic", () => {
    const seen = new Set(Array.from({ length: 200 }, generateCode));
    assert.ok(seen.size > 100, `only ${seen.size} distinct codes in 200 draws`);
  });
});

describe("hashCode", () => {
  it("never returns the code itself", () => {
    const hash = hashCode("123456", "a@b.c");
    assert.ok(!hash.includes("123456"));
    assert.equal(hash.length, 64);
  });

  it("salts by identifier, so the same code hashes differently per user", () => {
    assert.notEqual(hashCode("123456", "a@b.c"), hashCode("123456", "d@e.f"));
  });
});

describe("codeMatches", () => {
  it("accepts the right code for the right identifier", () => {
    assert.equal(codeMatches(hashCode("123456", "a@b.c"), "123456", "a@b.c"), true);
  });

  it("rejects the right code for a different identifier", () => {
    // A code issued to one person must not authenticate another.
    assert.equal(codeMatches(hashCode("123456", "a@b.c"), "123456", "d@e.f"), false);
  });

  it("rejects a wrong code", () => {
    assert.equal(codeMatches(hashCode("123456", "a@b.c"), "654321", "a@b.c"), false);
  });

  it("survives a malformed stored hash rather than throwing", () => {
    assert.equal(codeMatches("short", "123456", "a@b.c"), false);
  });
});

describe("isSixDigits", () => {
  it("accepts exactly six digits", () => {
    assert.equal(isSixDigits("000000"), true);
  });
  it("rejects anything else", () => {
    for (const bad of ["12345", "1234567", "12345a", "", " 123456"]) {
      assert.equal(isSixDigits(bad), false, `accepted: ${JSON.stringify(bad)}`);
    }
  });
});

describe("attemptsError", () => {
  it("counts down remaining attempts", () => {
    assert.match(attemptsError(1), new RegExp(`${MAX_ATTEMPTS - 1} attempts left`));
  });
  it("stops offering attempts once they are used up", () => {
    assert.match(attemptsError(MAX_ATTEMPTS), /Too many/);
  });
});
