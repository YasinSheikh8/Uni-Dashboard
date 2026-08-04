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

## Layout

```
src/lib/suppliers/     rate sources and the aggregation engine
  types.ts             normalized shapes — nothing downstream sees supplier fields
  liteapi.ts           LiteAPI adapter (search + prebook/book)
  amadeus.ts           Amadeus Self-Service adapter
  fixture.ts           deterministic demo suppliers
  match.ts             cross-supplier property matching
  aggregator.ts        parallel fan-out, dedup, best-price selection
src/lib/
  booking.ts           booking engine: hold → sell → capture
  split.ts             share computation and the settlement state machine
  payments.ts          Stripe gateway + development stub behind one interface
  money.ts             minor units, largest-remainder splitting
src/app/               Next.js App Router pages and API routes
tests/                 money and matching invariants
scripts/settle.ts      settlement sweep (run on a schedule)
scripts/e2e-split.ts   end-to-end walk of the whole money path
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
selection, the full booking flow, and the complete split money path including
partial backstop capture and settlement idempotency (`npm run e2e`).

Not yet done, in rough priority order:

- **The LiteAPI and Amadeus adapters have not been run against the live APIs.**
  They are written to the documented request/response shapes and parse
  defensively, but nobody has pointed them at a real key yet. Expect to adjust
  field paths on first contact.
- Postgres. The schema is provider-agnostic and uses no SQLite-only features —
  change the `datasource` provider and it migrates as-is.
- Notifications. Friends currently have to open the app to see a share request;
  it should reach them by push or email.
- Stripe webhooks. Authorizations can fail asynchronously, and nothing currently
  listens for that.
- Rate caching. Every search hits every supplier live.
