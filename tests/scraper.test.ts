import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  isAllowed,
  parseRobots,
  resetRobotsCache,
  mayFetch,
} from "../src/lib/suppliers/scraper/robots";
import { extractJsonLdBlocks, offersFromHtml } from "../src/lib/suppliers/scraper/jsonld";
import { ScraperProvider, resetScraperCache } from "../src/lib/suppliers/scraper/provider";
import { resetThrottle } from "../src/lib/suppliers/scraper/throttle";
import type { SearchQuery } from "../src/lib/suppliers/types";

const ROBOTS = `
# comment
User-agent: BadBot
Disallow: /

User-agent: *
Disallow: /admin
Disallow: /searchresults.html
Allow: /searchresults.html/public
Crawl-delay: 2
`;

const QUERY: SearchQuery = {
  destination: "Lisbon",
  checkIn: "2026-09-10",
  checkOut: "2026-09-13",
  adults: 2,
  rooms: 1,
  currency: "EUR",
};

function html(jsonLd: unknown): string {
  return `<!doctype html><html><head>
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
    </head><body></body></html>`;
}

afterEach(() => {
  resetRobotsCache();
  resetScraperCache();
  resetThrottle();
  delete process.env.SCRAPER_ENABLED;
});

describe("parseRobots", () => {
  it("picks the wildcard group when no specific agent matches", () => {
    const rules = parseRobots(ROBOTS, "BKRBot/0.1");
    assert.deepEqual(rules.disallow, ["/admin", "/searchresults.html"]);
    assert.equal(rules.crawlDelayMs, 2000);
  });

  it("prefers a group naming our agent", () => {
    const rules = parseRobots(ROBOTS, "BadBot/2.0");
    assert.deepEqual(rules.disallow, ["/"]);
  });
});

describe("isAllowed", () => {
  const rules = parseRobots(ROBOTS, "BKRBot/0.1");

  it("blocks a disallowed path", () => {
    assert.equal(isAllowed(rules, "/searchresults.html?ss=Lisbon"), false);
  });

  it("lets a longer Allow override a shorter Disallow", () => {
    assert.equal(isAllowed(rules, "/searchresults.html/public"), true);
  });

  it("permits anything not mentioned", () => {
    assert.equal(isAllowed(rules, "/hotels/lisbon"), true);
  });

  it("honours $ anchoring and * wildcards", () => {
    const wildcard = parseRobots("User-agent: *\nDisallow: /*.pdf$", "x");
    assert.equal(isAllowed(wildcard, "/docs/rates.pdf"), false);
    assert.equal(isAllowed(wildcard, "/docs/rates.pdf?x=1"), true);
  });
});

describe("mayFetch", () => {
  it("fails closed when robots.txt cannot be fetched", async () => {
    const failing: typeof fetch = async () => {
      throw new Error("network down");
    };
    const result = await mayFetch("https://example.com/search", failing);
    assert.equal(result.allowed, false);
    assert.match(result.reason ?? "", /unreadable/);
  });

  it("treats a 404 robots.txt as unrestricted", async () => {
    const notFound: typeof fetch = async () =>
      new Response("", { status: 404 });
    const result = await mayFetch("https://example.com/search", notFound);
    assert.equal(result.allowed, true);
  });
});

describe("offersFromHtml", () => {
  it("reads a schema.org Hotel with a nightly offer and scales it to the stay", () => {
    const offers = offersFromHtml(
      html({
        "@context": "https://schema.org",
        "@type": "Hotel",
        name: "Memmo Alfama",
        address: {
          "@type": "PostalAddress",
          streetAddress: "Travessa das Merceeiras 27",
          addressLocality: "Lisbon",
          addressCountry: "PT",
        },
        geo: { "@type": "GeoCoordinates", latitude: 38.7118, longitude: -9.1289 },
        aggregateRating: { ratingValue: 4.6, bestRating: 5, reviewCount: 2210 },
        offers: { "@type": "Offer", price: "210.00", priceCurrency: "EUR", url: "/h/memmo" },
      }),
      { nights: 3, currencyFallback: "EUR", baseUrl: "https://example.com/search" },
    );

    assert.equal(offers.length, 1);
    const [offer] = offers;
    assert.equal(offer.name, "Memmo Alfama");
    // 210 per night x 3 nights, in minor units.
    assert.equal(offer.totalAmount, 63_000);
    assert.equal(offer.currency, "EUR");
    assert.equal(offer.city, "Lisbon");
    assert.equal(offer.latitude, 38.7118);
    // 4.6/5 normalized onto our /10 scale.
    assert.equal(offer.reviewScore, 9.2);
    assert.equal(offer.url, "https://example.com/h/memmo");
  });

  it("unwraps @graph and ItemList pages", () => {
    const offers = offersFromHtml(
      html({
        "@graph": [
          { "@type": "WebPage", name: "Search" },
          {
            "@type": "ItemList",
            itemListElement: [
              {
                "@type": "ListItem",
                item: {
                  "@type": "Hotel",
                  name: "Hotel da Baixa",
                  offers: { price: 150, priceCurrency: "EUR" },
                },
              },
            ],
          },
        ],
      }),
      { nights: 2, currencyFallback: "EUR" },
    );

    assert.equal(offers.length, 1);
    assert.equal(offers[0].name, "Hotel da Baixa");
    assert.equal(offers[0].totalAmount, 30_000);
  });

  it("takes the cheapest when offers is an array", () => {
    const offers = offersFromHtml(
      html({
        "@type": "Hotel",
        name: "Casa Balthazar",
        offers: [
          { price: "300", priceCurrency: "EUR" },
          { price: "180", priceCurrency: "EUR" },
        ],
      }),
      { nights: 1, currencyFallback: "EUR" },
    );
    assert.equal(offers[0].totalAmount, 18_000);
  });

  it("ignores non-lodging entities and priceless offers", () => {
    const offers = offersFromHtml(
      html([
        { "@type": "Organization", name: "Booking Co", offers: { price: 10 } },
        { "@type": "Hotel", name: "No Price Inn" },
      ]),
      { nights: 1, currencyFallback: "EUR" },
    );
    assert.equal(offers.length, 0);
  });

  it("survives a malformed JSON-LD block without losing the good ones", () => {
    const page = `<script type="application/ld+json">{ broken,,, }</script>
      ${html({ "@type": "Hotel", name: "Good Hotel", offers: { price: 100, priceCurrency: "EUR" } })}`;
    const offers = offersFromHtml(page, { nights: 1, currencyFallback: "EUR" });
    assert.equal(offers.length, 1);
    assert.equal(offers[0].name, "Good Hotel");
  });

  it("finds no blocks in a page without structured data", () => {
    assert.deepEqual(extractJsonLdBlocks("<html><body>nothing</body></html>"), []);
  });
});

describe("ScraperProvider", () => {
  const target = {
    id: "test",
    label: "TestSite",
    currencyFallback: "EUR",
    buildUrl: () => "https://example.com/search?ss=Lisbon",
  };

  it("is disabled unless SCRAPER_ENABLED is true", () => {
    const provider = new ScraperProvider(target);
    assert.equal(provider.isConfigured(), false);
    process.env.SCRAPER_ENABLED = "true";
    assert.equal(provider.isConfigured(), true);
  });

  it("never reports itself as bookable, and refuses to book", async () => {
    const provider = new ScraperProvider(target);
    assert.equal(provider.bookable, false);
    await assert.rejects(
      () =>
        provider.book({
          supplierRateId: "",
          supplierHotelId: "",
          checkIn: "2026-09-10",
          checkOut: "2026-09-13",
          holder: { firstName: "A", lastName: "B", email: "a@b.c", phone: "1" },
          guests: [],
          clientReference: "x",
        }),
      /cannot be booked/,
    );
  });

  it("returns non-bookable quotes carrying a deep link", async () => {
    process.env.SCRAPER_ENABLED = "true";

    const fakeFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) {
        return new Response("User-agent: *\nAllow: /\n", { status: 200 });
      }
      return new Response(
        html({
          "@type": "Hotel",
          name: "Memmo Alfama",
          offers: { price: "200", priceCurrency: "EUR", url: "https://example.com/h/1" },
        }),
        { status: 200 },
      );
    };

    const provider = new ScraperProvider(target, fakeFetch);
    const offers = await provider.search(QUERY);

    assert.equal(offers.length, 1);
    const rate = offers[0].rates[0];
    assert.equal(rate.bookable, false);
    assert.equal(rate.supplierRateId, "", "a reference quote must carry no rate token");
    assert.equal(rate.deepLinkUrl, "https://example.com/h/1");
    // 200/night x 3 nights.
    assert.equal(rate.totalAmount, 60_000);
  });

  it("refuses to fetch a page robots.txt disallows", async () => {
    process.env.SCRAPER_ENABLED = "true";

    let pageRequested = false;
    const fakeFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) {
        return new Response("User-agent: *\nDisallow: /search\n", { status: 200 });
      }
      pageRequested = true;
      return new Response("", { status: 200 });
    };

    const provider = new ScraperProvider(target, fakeFetch);
    await assert.rejects(() => provider.search(QUERY), /disallowed by robots\.txt/);
    assert.equal(pageRequested, false, "the page must never be requested when disallowed");
  });
});
