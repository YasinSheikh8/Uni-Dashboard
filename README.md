# Hotelbook

Hotel booking that prices every supplier at once, books in a single tap, and
splits the bill with whoever is coming.

Three things carry the product:

1. **Best price across suppliers.** Every configured supplier is queried in
   parallel, the same physical hotel is matched across their different ids and
   collapsed into one result row, and the cheapest all-in total wins. The losing
   quote is shown next to it rather than hidden.
2. **One-tap booking.** Traveler details and a card are saved once. After that,
   booking is a single request — no forms, no re-entry.
3. **Hybrid split payments.** The organizer's card guarantees the room
   instantly. Friends settle up afterwards without the reservation ever waiting
   on them.

Everything happens on the platform. Rooms are sold through our own booking
engine, and cards are collected in place against a Stripe SetupIntent — there is
no hand-off to a hosted checkout page and no link out to a supplier's site
anywhere in the product.

---

## Quick start

```bash
npm install
cp .env.example .env          # then set SESSION_SECRET
npm run db:push               # creates prisma/dev.db
npm run dev
```

It runs with **no API keys at all**. With no supplier credentials configured,
two built-in demo suppliers with deliberately disagreeing prices are registered,
so the cross-supplier matching and best-price logic run for real. With no Stripe
key, a stub payment gateway stands in and no money moves.

Add real credentials to `.env` whenever you want:

| Variable | Gets you |
|---|---|
| `LITEAPI_KEY` | Live, bookable hotel rates. Instant free sandbox key at [dashboard.liteapi.travel](https://dashboard.liteapi.travel). |
| `AMADEUS_CLIENT_ID` / `AMADEUS_CLIENT_SECRET` | Second live source to compare against. Instant free key at [developers.amadeus.com](https://developers.amadeus.com). |
| `STRIPE_SECRET_KEY` | Real cards, real holds, real charges. |

The moment one supplier key is present the demo suppliers drop out. Set
`USE_FIXTURE_SUPPLIER=true` to force them back on.

---

## How the best-price engine works

```
        ┌───────────┐   ┌───────────┐
query → │  LiteAPI  │   │  Amadeus  │  … parallel, independent, 9s timeout each
        └─────┬─────┘   └─────┬─────┘
              │               │
              └───────┬───────┘
                      ▼
              normalize to RateQuote      minor units, all-in totals
                      ▼
              match across suppliers      geo + fuzzy name  (src/lib/suppliers/match.ts)
                      ▼
              one row per real hotel      cheapest wins, runner-up shown
```

The parts worth knowing:

- **Comparison is on the all-in total for the whole stay**, taxes and fees
  included — not the nightly headline rate. Comparing headline rates is how
  booking sites end up "cheapest" right until checkout.
- **Property matching** (`src/lib/suppliers/match.ts`) is what makes the
  comparison meaningful. LiteAPI's `lp1a2b3` and Amadeus's `MCLONGHM` can be the
  same building. Two hotels within 150m whose normalized names are similar
  enough are merged; without coordinates it falls back to strict name matching
  inside one city. Get it wrong one way and you list a hotel twice; the other
  way and you claim a saving between two different properties.
- **A slow or broken supplier degrades the result set, never fails the search.**
  Failures surface in `diagnostics` and as a note above the results.
- **Currency**: every supplier is asked to quote in the search currency, so
  conversion is normally a no-op. The static fallback table in
  `currency.ts` exists only for suppliers that ignore the request — replace it
  with a real FX feed before this touches production money.

### A note on the Hugging Face model

The original plan named `paradiseX2673/hotel-price-scraper` on Hugging Face as
the price source. That is not a workable foundation and it isn't used here.
Hugging Face hosts model weights; live hotel rates are real-time inventory that
changes by the minute, so no model can produce a price you can actually book
against. Supplier APIs are the only source of bookable rates.

ML does have a real place in this codebase, just not there — property matching
across suppliers is currently heuristic and would be materially better as a
learned model, and "is this a good deal versus this hotel's own history" needs a
price history that this system is now positioned to accumulate.

---

## How split payments work

The hybrid model, in order:

| When | Organizer | Friends |
|---|---|---|
| Books | own share **captured**, friends' total **held** as a backstop | invited |
| Friend accepts | — | their share **held** on their own card |
| Settlement | backstop **partially captured** for whatever nobody paid, remainder **released** | accepted holds **captured** |

Why a backstop rather than billing the organizer later: an authorization proves
the funds exist at booking time. Finding out three days later that the organizer
can't cover a no-show friend is how you eat the cost of a confirmed room.

Two consequences that matter:

- **`npm run settle` must run on a schedule.** Card authorizations expire after
  about seven days; an expired hold is uncollectible. Hourly cron is plenty.
  `SPLIT_SETTLEMENT_HOURS` (default 72) is clamped to 144 so it can never be
  scheduled past the expiry window.
- **Money never moves between users.** The platform charges every participant
  and the platform pays the supplier. That keeps this out of peer-to-peer money
  transmission and means no Stripe Connect. If you ever let an organizer collect
  and reimburse friends directly, that changes, and it becomes a licensing
  question before it's an engineering one.

Split arithmetic uses largest-remainder allocation, so shares are always
integers that sum to exactly the total. Naive rounding leaves you a cent short
on the charge, which reconciles into a real bug.


---

## Price-reference scraping

Off by default. `SCRAPER_ENABLED=true` plus `SCRAPER_TARGETS=booking,hotels`
adds public listing prices to the comparison.

**Scraped prices are an internal signal and are never shown to customers.**
There is no rate token behind a number lifted off a search page, so:

- the aggregator picks the winner from *bookable* quotes only — a cheaper
  scraped price never becomes the thing you buy;
- `savedAmount` is computed against bookable sources only, so we never claim a
  saving over something we cannot sell;
- a hotel whose every quote is reference-only is **dropped from results
  entirely**, because listing it would put a competitor's price and an off-site
  link in front of the customer;
- `createBooking` rejects a non-bookable provider outright, so a hand-crafted
  request cannot route around the above.

`cheaperElsewhere` is still computed and the full quote set is still stored on
the booking, but neither is rendered. They exist for your own pricing
intelligence — "how often are we beaten, and by how much" — not for the guest.

What the scraper does technically: reads schema.org JSON-LD — the structured
data sites publish for search engines — rather than pattern-matching rendered
markup, which survives redesigns far better. Per target it fetches and honours
robots.txt (**fail-closed**: unreadable robots.txt means no fetch), serializes
requests per host with a minimum gap that yields to the site's own
`Crawl-delay`, caches results, and sends an identifiable User-Agent.

Be clear-eyed about it: scraping a booking site's search results is very likely
against its terms of service however politely it is done, the markup can change
without notice, and the prices are not transactable. Good crawler hygiene makes
this well-behaved, not permitted. Treat it as a signal for your own pricing.

Adding a target is a `buildUrl` function in `TARGETS`
(`src/lib/suppliers/scraper/provider.ts`).

---

## Deploying to Vercel

1. **vercel.com → Add New → Project → import this repo.** Next.js is detected
   automatically; no build settings to change.
2. **Add a Postgres database.** Project → Storage → Neon (or Supabase). The
   integration sets `DATABASE_URL` for you. If you create the database yourself
   instead, see the `DIRECT_URL` note below.
3. **Add the environment variables** under Project → Settings → Environment
   Variables, then redeploy.

Three things specific to this app:

- **`DIRECT_URL` is required when `DATABASE_URL` is pooled.** Neon and Supabase
  both hand you the pooled string by default (a `-pooler` host on Neon, port 6543
  on Supabase), and connection poolers cannot run DDL — the build's schema push
  would hang against it. `DIRECT_URL` is the same string unpooled. The build
  refuses to start if this is wrong, rather than failing halfway through.

- **Settlement runs from `vercel.json`.** The cron hits `/api/cron/settle`, and
  Vercel automatically sends `Authorization: Bearer $CRON_SECRET` on cron
  invocations — so setting `CRON_SECRET` is the only wiring needed. The schedule
  is daily (`0 3 * * *`) because Hobby plans allow one cron per day; that is well
  inside the ~7-day card-authorization window, but on Pro you can raise it to
  hourly. Without this schedule running, holds expire uncollected.

- **Security headers live in `next.config.ts`,** not in a platform config file,
  so they survive a change of host.

Required: `DATABASE_URL`, `DIRECT_URL`, `SESSION_SECRET`. Recommended:
`CRON_SECRET`, `NEXT_PUBLIC_APP_URL`, plus whichever supplier and Stripe keys
you are using.

---

## Layout

```
src/lib/suppliers/     rate sources and the aggregation engine
  types.ts             normalized shapes — nothing downstream sees supplier fields
  liteapi.ts           LiteAPI adapter (search + prebook/book)
  amadeus.ts           Amadeus Self-Service adapter
  fixture.ts           deterministic demo suppliers
  match.ts             cross-supplier property matching
  aggregator.ts        parallel fan-out, dedup, best-price selection
  scraper/             price-reference scraping (off by default)
    robots.ts          robots.txt fetch/parse/evaluate, fail-closed
    throttle.ts        per-host request pacing
    jsonld.ts          schema.org extraction
    provider.ts        targets + the non-bookable RateProvider
src/lib/
  booking.ts           booking engine: hold → sell → capture
  split.ts             share computation and the settlement state machine
  payments.ts          Stripe gateway + development stub behind one interface
  money.ts             minor units, largest-remainder splitting
src/app/               Next.js App Router pages and API routes
tests/                 money, matching, scraping and aggregation invariants
scripts/settle.ts      settlement sweep (run on a schedule)
scripts/e2e-split.ts   end-to-end walk of the whole money path
vercel.json            settlement cron schedule
```

## Commands

```bash
npm run dev        # dev server
npm run build      # production build
npm test           # money + matching invariants
npm run settle     # settlement sweep — put this on a cron
npm run e2e        # end-to-end money path against the local database
npm run db:studio  # browse the database
```

## Adding a supplier

Implement `RateProvider` in `src/lib/suppliers/`, register it in
`src/lib/suppliers/index.ts`. Nothing else changes — the aggregator fans out
over whatever the registry returns and the comparison UI renders however many
quotes come back.

---

## Status and known gaps

Verified working: supplier fan-out, cross-supplier matching, best-price
selection, the full booking flow, the complete split money path including
partial backstop capture and settlement idempotency (`npm run e2e`), and the
scraper's robots handling, JSON-LD extraction and never-bookable guarantees.

Not yet done, in rough priority order:

- **The LiteAPI and Amadeus adapters have not been run against the live APIs.**
  They are written to the documented request/response shapes and parse
  defensively, but nobody has pointed them at a real key yet. Expect to adjust
  field paths on first contact.
- **The scrape targets' URL templates and JSON-LD assumptions are unverified
  against the live sites** for the same reason — extraction is tested against
  fixtures, not against Booking.com's actual HTML.
- Notifications. Friends currently have to open the app to see a share request;
  it should reach them by push or email.
- Stripe webhooks. Authorizations can fail asynchronously, and nothing currently
  listens for that.
- Rate caching. Every search hits every supplier live.
