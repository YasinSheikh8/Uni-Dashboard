/**
 * Per-host request pacing.
 *
 * Serializes requests to each host and keeps a minimum gap between them, taking
 * whichever is larger: the site's declared crawl-delay or our own floor. A
 * scraper that fans out concurrently is indistinguishable from a small denial
 * of service, and it is the fastest way to get an IP range blocked.
 */

const DEFAULT_MIN_INTERVAL_MS = Number.parseInt(
  process.env.SCRAPER_MIN_INTERVAL_MS ?? "1500",
  10,
);

const queues = new Map<string, Promise<unknown>>();
const lastRequestAt = new Map<string, number>();

export async function paced<T>(
  host: string,
  minIntervalMs: number,
  task: () => Promise<T>,
): Promise<T> {
  const interval = Math.max(
    Number.isFinite(minIntervalMs) ? minIntervalMs : 0,
    DEFAULT_MIN_INTERVAL_MS,
  );

  const previous = queues.get(host) ?? Promise.resolve();

  const run = previous.then(async () => {
    const last = lastRequestAt.get(host) ?? 0;
    const wait = last + interval - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));

    lastRequestAt.set(host, Date.now());
    return task();
  });

  // Keep the chain alive even when a task rejects, so one failure does not
  // wedge the queue for that host.
  queues.set(
    host,
    run.catch(() => undefined),
  );

  return run;
}

export function resetThrottle(): void {
  queues.clear();
  lastRequestAt.clear();
}
