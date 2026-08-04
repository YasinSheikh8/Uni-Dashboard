import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { buildCodeMessage } from "../src/lib/otp-message";

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe("buildCodeMessage", () => {
  it("appends the domain-bound line so iOS and Android can autofill", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://bkr.vercel.app";
    const body = buildCodeMessage("123456");
    assert.match(body, /^123456 is your BKR code/);
    assert.ok(body.endsWith("@bkr.vercel.app #123456"));
  });

  it("keeps the code readable to a human, not just to the OS", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://bkr.vercel.app";
    assert.match(buildCodeMessage("999000"), /999000 is your BKR code/);
  });

  it("omits the line when the origin is unknown", () => {
    // A wrong domain suppresses autofill entirely, so no line beats a guess.
    const body = buildCodeMessage("123456");
    assert.ok(!body.includes("@"));
  });

  it("omits the line when NEXT_PUBLIC_APP_URL is not a URL", () => {
    process.env.NEXT_PUBLIC_APP_URL = "not a url";
    assert.ok(!buildCodeMessage("123456").includes("@"));
  });

  it("uses the host only, never the scheme or path", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://bkr.vercel.app/setup?x=1";
    const body = buildCodeMessage("424242");
    assert.ok(body.includes("@bkr.vercel.app #424242"));
    assert.ok(!body.includes("https://"));
  });
});
