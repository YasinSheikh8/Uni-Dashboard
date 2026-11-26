/**
 * App lock. This is a single-person app holding a Moodle token on the server,
 * so every page and API route sits behind a passcode (APP_PASSCODE). The
 * session is an HMAC-signed cookie; uses Web Crypto so it runs in middleware.
 */
export const SESSION_COOKIE = "w1_session";
export const SESSION_DAYS = 30;

const enc = new TextEncoder();

function secret(): string | null {
  const s = process.env.SESSION_SECRET || process.env.APP_PASSCODE;
  return s && s.length >= 8 ? s : null;
}

export function lockConfigured(): boolean {
  return !!process.env.APP_PASSCODE;
}

/** Without a passcode, the app is only open in local development. */
export function lockBypassed(): boolean {
  return !lockConfigured() && process.env.NODE_ENV !== "production";
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()!), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function createSessionValue(): Promise<string> {
  const exp = Date.now() + SESSION_DAYS * 86_400_000;
  const payload = `v1.${exp}`;
  return `${payload}.${await hmac(payload)}`;
}

export async function verifySessionValue(value: string | undefined): Promise<boolean> {
  if (!value || !secret()) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [v, exp, sig] = parts;
  if (v !== "v1" || !(Number(exp) > Date.now())) return false;
  return safeEqual(sig, await hmac(`${v}.${exp}`));
}

export async function checkPasscode(input: string): Promise<boolean> {
  const expected = process.env.APP_PASSCODE;
  if (!expected) return false;
  // Compare HMACs so timing doesn't leak the passcode length or prefix.
  return safeEqual(await hmac(`pass:${input}`), await hmac(`pass:${expected}`));
}
