import "server-only";

/**
 * SMS delivery.
 *
 * Twilio when configured, console when not, behind one interface — so the phone
 * sign-in flow is fully walkable in development without an account or a real
 * handset. The dev sender prints the code to the server log and is loud about
 * being a stub, so nobody mistakes it for delivery.
 *
 * Uses Twilio's REST API over fetch rather than their SDK: one less dependency,
 * and the SDK's Node-specific internals are awkward in serverless runtimes.
 */

export interface SmsResult {
  delivered: boolean;
  /** Present only in development, so the UI can show the code locally. */
  devCode?: string;
}

export function isSmsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER,
  );
}

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  if (!isSmsConfigured()) {
    console.warn(
      `\n[sms:stub] Twilio is not configured. Would have sent to ${to}:\n` +
        `[sms:stub]   ${body}\n`,
    );
    return { delivered: false };
  }

  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: to,
        From: process.env.TWILIO_FROM_NUMBER!,
        Body: body,
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Twilio ${response.status}: ${detail.slice(0, 200)}`);
  }

  return { delivered: true };
}
