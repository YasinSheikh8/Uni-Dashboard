import type { Config } from "@netlify/functions";

/**
 * Hourly settlement trigger.
 *
 * This function is a doorbell, not the doorway: it calls the app's own
 * /api/cron/settle route rather than importing the settlement engine. That
 * keeps Prisma and the payment gateway inside a single runtime instead of
 * bundling a second copy into a Lambda, and it means the same endpoint can be
 * driven from cron, a CI job, or by hand.
 *
 * Settlement MUST run on a schedule. Card authorizations expire after about
 * seven days; a hold that expires before capture is money that cannot be
 * collected.
 */
export default async function handler(): Promise<Response> {
  const baseUrl = process.env.URL ?? process.env.NEXT_PUBLIC_APP_URL;
  const secret = process.env.CRON_SECRET;

  if (!baseUrl) {
    console.error("settle-cron: no site URL available");
    return new Response("missing site URL", { status: 500 });
  }
  if (!secret) {
    console.error("settle-cron: CRON_SECRET is not set, refusing to call unauthenticated");
    return new Response("missing CRON_SECRET", { status: 500 });
  }

  const response = await fetch(`${baseUrl}/api/cron/settle`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });

  const body = await response.text();
  if (!response.ok) {
    console.error(`settle-cron: ${response.status} ${body.slice(0, 500)}`);
    return new Response(body, { status: response.status });
  }

  console.log(`settle-cron: ${body.slice(0, 500)}`);
  return new Response(body, { status: 200 });
}

export const config: Config = {
  schedule: "@hourly",
};
