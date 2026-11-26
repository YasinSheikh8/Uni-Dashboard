# Yasin's Dashboard

A personal, mobile-first study hub for the University of Warwick. It brings together Moodle modules, lecture materials, deadlines and tests, your Tabula timetable, revision notes, flashcards and quizzes, and Warwick links.

- **Next.js 15 (App Router) + React 19 + Tailwind CSS 4 + TypeScript.** All data access runs on the server.
- **Moodle Web Services (REST)** provide course data. The app is read-only: it can call only the 10 functions listed in `src/lib/moodle/client.ts`.
- **Tabula's iCal calendar feed** provides lectures and seminars.
- **openai/gpt-oss-120b** (via OpenRouter, Groq or any OpenAI-compatible API) generates the optional AI study guides, concise lecture notes, flashcards, quizzes and assessment plans. Lecture PDFs are converted to text on the server first. Each item cites the Moodle file it came from.
- Rename it with `NEXT_PUBLIC_APP_NAME` (default in `src/config/app.ts`).

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev                  # http://localhost:3000
```

With no `MOODLE_TOKEN` the app runs in **demo mode**: sample data, labelled on every page and never mixed with real data.

## Configuration (server-side only — never commit `.env.local`)

| Variable | Required | What it is |
|---|---|---|
| `APP_PASSCODE` | No | Optional passcode. Unset = no password, so anyone with the URL can see your data; keep the URL private or set one. |
| `SESSION_SECRET` | Recommended | 32+ random chars for signing the session cookie (`openssl rand -hex 32`). |
| `MOODLE_TOKEN` | For live data | Your Moodle web-service token (see below). |
| `MOODLE_URL` | No | Defaults to `https://moodle.warwick.ac.uk`. |
| `TIMETABLE_ICS_URL` | No | Your Tabula timetable iCal link. You can also paste it in Settings. |
| `AI_API_KEY` | No | Turns on the AI features and automatic notes. An OpenRouter key by default; set `AI_BASE_URL=https://api.groq.com/openai/v1` for Groq. `AI_MODEL` defaults to `openai/gpt-oss-120b`. |
| `CRON_SECRET` | For daily auto-notes on Vercel | Any random string; Vercel Cron sends it to `/api/cron/auto-notes`. |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | On serverless hosts | Where your notes, flashcards and checklists are kept. Without them, a JSON file in `.data/` (or `DATA_DIR`) is used. |

### Getting the Moodle token
1. Moodle → your profile menu → **Preferences → Security keys** (`/user/managetoken.php`).
2. Copy the key for **Moodle mobile web service**. If none is listed, sign in once with the official Moodle mobile app, which creates it.
3. Put it in `MOODLE_TOKEN` on the server. The token gives the same read access as your own Moodle login. The app limits itself further, to read-only calls.
4. If the token ever leaks, reset it on the same page and update the server.

A narrower token is possible if Warwick IT creates a dedicated external service with only the functions in `src/lib/moodle/client.ts`. Students can't create one themselves.

### Getting the Tabula timetable feed
In Tabula, open your profile → **Timetable** → the calendar subscription (iCal) link. Treat it like a password.

## What comes from where

| Feature | Source |
|---|---|
| Modules, sections, materials, Moodle quizzes and assignments, Moodle calendar | Moodle API |
| Lectures, seminars, rooms; revision slots per timetabled session | Tabula iCal feed |
| Notes, revision notes, flashcards, quiz scores, checklists | This app's own store |
| AI notes, flashcards, quizzes, action plans | gpt-oss-120b, from your Moodle PDFs and pages only |
| Tabula coursework, marks, attendance; exam timetable; My Warwick; email | **Not synced** — linked only |

## Free AI key (Groq)

1. Sign up at [console.groq.com](https://console.groq.com) and create an API key under **API Keys**.
2. In Vercel, add `GROQ_API_KEY` with that key, then redeploy.

On Groq the app automatically keeps each request under the free plan's limits (about 8,000 tokens per minute and 200,000 per day for gpt-oss-120b). It sends one request at a time, about a minute apart, and uses up to ~15k characters of each session's materials. That's roughly 25–30 notes a day. A big backlog fills in over a few days, and when the daily limit is hit it pauses and carries on later. A paid plan or another provider (`AI_API_KEY` + `AI_BASE_URL`) removes these limits; tune with `AI_MAX_INPUT_CHARS`, `AI_MAX_OUTPUT_TOKENS`, `AI_CONCURRENCY` and `AI_MIN_INTERVAL_MS`.

## Automatic revision notes

With `AI_API_KEY` set, the app writes concise notes for every lecture, seminar and week that has materials on Moodle. It rewrites a note when that session's materials change. Notes you wrote yourself, or edited, are never overwritten.

- **Daily:** Vercel Cron calls `/api/cron/auto-notes` (see `vercel.json`; needs `CRON_SECRET`).
- **On visit:** opening the dashboard triggers a check, at most every 6 hours.
- **Catching up:** Settings → *Automatic revision notes* → *Write the missing notes now* fills the backlog straight away.

PowerPoint files, scanned PDFs and videos can't be read. Those sessions are flagged rather than guessed at.

## Deploying

**Any Node host (simplest, keeps notes on disk):**

```bash
npm ci
npm run build
MOODLE_TOKEN=... npm start
```

Keep `.data/` on a persistent volume, or set `DATA_DIR`.

**Vercel:**
1. Import the repo.
2. Add the variables above in Project → Settings → Environment Variables.
3. Add an Upstash Redis (Vercel KV) integration so notes persist.

The AI routes set `maxDuration = 300`, which needs a plan that allows long functions.

Behind a corporate proxy, run Node with `NODE_USE_ENV_PROXY=1` so `fetch` uses `HTTPS_PROXY`.

## Development

```bash
npm run typecheck
npm test
```

The tests cover timezone handling, the iCal parser, the HTML sanitiser, Markdown safety, Moodle parameter encoding, deadline ranking and lecture/seminar detection.
