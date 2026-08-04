import "server-only";

/**
 * Email delivery.
 *
 * Resend when configured, console when not, behind one interface — so the email
 * sign-in flow is fully walkable in development without an account. The dev
 * sender prints to the server log and is loud about being a stub, so nobody
 * mistakes it for delivery.
 *
 * Plain fetch rather than the Resend SDK: one less dependency for a single POST.
 */

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendEmail(message: EmailMessage): Promise<{ delivered: boolean }> {
  if (!isEmailConfigured()) {
    console.warn(
      `\n[email:stub] Resend is not configured. Would have sent to ${message.to}:\n` +
        `[email:stub]   ${message.subject}\n` +
        `[email:stub]   ${message.text.replace(/\n/g, "\n[email:stub]   ")}\n`,
    );
    return { delivered: false };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend ${response.status}: ${detail.slice(0, 200)}`);
  }

  return { delivered: true };
}
