/**
 * robots.txt fetching and evaluation.
 *
 * Every scrape target is checked against its own robots.txt before a single
 * page is requested, and the declared crawl-delay is honoured. This is not
 * optional politeness — it is the difference between a crawler and an abusive
 * one, and it is the first thing anyone looks at when a site notices you.
 *
 * Fail-closed: if robots.txt cannot be fetched or parsed, the path is treated
 * as disallowed. A source that silently starts scraping when it cannot read the
 * rules is worse than one that returns nothing.
 */

export interface RobotsRules {
  allow: string[];
  disallow: string[];
  crawlDelayMs: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { rules: RobotsRules | null; fetchedAt: number }>();

export const USER_AGENT =
  process.env.SCRAPER_USER_AGENT ??
  "HotelbookBot/0.1 (+https://hotelbook.example/bot)";

/** Parses the record group that applies to us, falling back to the `*` group. */
export function parseRobots(body: string, userAgent: string): RobotsRules {
  const lines = body.split(/\r?\n/);

  const groups: Array<{ agents: string[]; rules: RobotsRules }> = [];
  let current: { agents: string[]; rules: RobotsRules } | null = null;
  let lastLineWasAgent = false;

  for (const rawLine of lines) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;

    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "user-agent") {
      // Consecutive user-agent lines share one group of rules.
      if (!current || !lastLineWasAgent) {
        current = {
          agents: [],
          rules: { allow: [], disallow: [], crawlDelayMs: 0 },
        };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastLineWasAgent = true;
      continue;
    }

    lastLineWasAgent = false;
    if (!current) continue;

    if (field === "allow") current.rules.allow.push(value);
    else if (field === "disallow") current.rules.disallow.push(value);
    else if (field === "crawl-delay") {
      const seconds = Number.parseFloat(value);
      if (Number.isFinite(seconds)) current.rules.crawlDelayMs = seconds * 1000;
    }
  }

  const agent = userAgent.toLowerCase();
  const specific = groups.find((group) =>
    group.agents.some((candidate) => candidate !== "*" && agent.includes(candidate)),
  );
  const wildcard = groups.find((group) => group.agents.includes("*"));

  return specific?.rules ?? wildcard?.rules ?? { allow: [], disallow: [], crawlDelayMs: 0 };
}

/** robots.txt wildcard matching: `*` is any run, `$` anchors the end. */
function patternMatches(pattern: string, path: string): boolean {
  if (pattern === "") return false;

  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;

  const escaped = body
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");

  const regex = new RegExp(`^${escaped}${anchored ? "$" : ""}`);
  return regex.test(path);
}

/** Longest matching rule wins; Allow beats Disallow at equal length. */
export function isAllowed(rules: RobotsRules, path: string): boolean {
  let bestAllow = -1;
  let bestDisallow = -1;

  for (const pattern of rules.allow) {
    if (patternMatches(pattern, path)) bestAllow = Math.max(bestAllow, pattern.length);
  }
  for (const pattern of rules.disallow) {
    if (patternMatches(pattern, path)) bestDisallow = Math.max(bestDisallow, pattern.length);
  }

  if (bestDisallow === -1) return true;
  return bestAllow >= bestDisallow;
}

export async function fetchRobots(
  origin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RobotsRules | null> {
  const cached = cache.get(origin);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.rules;

  let rules: RobotsRules | null = null;
  try {
    const response = await fetchImpl(`${origin}/robots.txt`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(5_000),
    });

    if (response.ok) {
      rules = parseRobots(await response.text(), USER_AGENT);
    } else if (response.status === 404) {
      // No robots.txt means no restrictions, per the standard.
      rules = { allow: [], disallow: [], crawlDelayMs: 0 };
    }
  } catch {
    rules = null;
  }

  cache.set(origin, { rules, fetchedAt: Date.now() });
  return rules;
}

/** Fail-closed check used by the scrape provider before every request. */
export async function mayFetch(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ allowed: boolean; crawlDelayMs: number; reason?: string }> {
  const parsed = new URL(url);
  const rules = await fetchRobots(parsed.origin, fetchImpl);

  if (!rules) {
    return { allowed: false, crawlDelayMs: 0, reason: "robots.txt unreadable" };
  }
  if (!isAllowed(rules, parsed.pathname + parsed.search)) {
    return { allowed: false, crawlDelayMs: rules.crawlDelayMs, reason: "disallowed by robots.txt" };
  }
  return { allowed: true, crawlDelayMs: rules.crawlDelayMs };
}

export function resetRobotsCache(): void {
  cache.clear();
}
