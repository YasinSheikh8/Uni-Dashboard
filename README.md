# Yasin's Dashboard

A personal, mobile-first study hub for the University of Warwick. It brings together Moodle modules, lecture materials, deadlines and tests, your Tabula timetable, revision notes, flashcards and quizzes, and Warwick links.

- **Next.js 15 (App Router) + React 19 + Tailwind CSS 4 + TypeScript.** All data access runs on the server.
- **Moodle Web Services (REST)** provide course data. The app is read-only: it can call only the 10 functions listed in `src/lib/moodle/client.ts`.
- **Tabula's iCal calendar feed** provides lectures and seminars.
- **Claude API** generates the optional AI study guides, concise lecture notes, flashcards, quizzes and assessment plans. Each item cites the Moodle file it came from.
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
| `ANTHROPIC_API_KEY` | No | Turns on the AI features. `ANTHROPIC_MODEL` defaults to `claude-opus-5-5`. |
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
| AI notes, flashcards, quizzes, action plans | Claude, from your Moodle PDFs and pages only |
| Tabula coursework, marks, attendance; exam timetable; My Warwick; email | **Not synced** — linked only |

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
