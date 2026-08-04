/**
 * One-time-code message formatting.
 *
 * Deliberately a separate, dependency-free module rather than living beside the
 * OTP logic: it is pure string formatting with no database or server access, so
 * marking it `server-only` would only make it untestable and unusable from a
 * future edge or client context.
 */

/**
 * Builds the message body in the domain-bound one-time-code format.
 *
 * The trailing `@domain #code` line is a convention both Apple and Google
 * recognise. With it, iOS surfaces the code directly above the keyboard and
 * autofills it (paired with autocomplete="one-time-code" on the input) instead
 * of making people switch to Messages, memorise six digits and switch back.
 * Android's SMS Retriever reads the same line.
 *
 * Binding the code to a domain is a security property as well as a convenience:
 * the OS only offers the code to a page on that exact origin, so a phishing site
 * cannot harvest it via autofill.
 *
 * The line is appended only when we actually know our own origin. A wrong domain
 * there suppresses autofill entirely, so omitting it beats guessing.
 */
export function buildCodeMessage(code: string, appUrl?: string): string {
  const readable = `${code} is your BKR code. It expires in 5 minutes.`;

  const origin = (appUrl ?? process.env.NEXT_PUBLIC_APP_URL)?.trim();
  if (!origin) return readable;

  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return readable;
  }
  if (!host) return readable;

  return `${readable}\n\n@${host} #${code}`;
}
