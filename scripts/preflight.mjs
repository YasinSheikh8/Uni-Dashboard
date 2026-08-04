/**
 * Build preflight.
 *
 * Runs before anything else in `npm run build` and reports, in one readable
 * block, exactly which environment variables are present and which are not.
 *
 * This exists because of how the failures actually looked. A missing
 * DATABASE_URL surfaced as a Prisma wasm validation dump forty lines into the
 * log, and a devDependency prune surfaced as `prisma: not found` — neither of
 * which tells you that the fix is one line in the host's environment settings.
 * A deploy that fails should say what to set and where.
 *
 * Fatal checks are the ones where a green build produces a broken site: without
 * a database every page 500s, and without a session secret every authenticated
 * request throws. Everything else degrades gracefully and only warns.
 */

import { loadEnv } from "./load-env.mjs";

loadEnv();

const REQUIRED = [
  {
    name: "DATABASE_URL",
    why: "Prisma cannot generate a client or push the schema without it, and every page needs the database.",
    fix: "Create a Postgres database (Neon and Supabase both have free tiers) and set the connection string.",
  },
  {
    name: "SESSION_SECRET",
    why: "Sessions are signed with it. Without it, every signed-in request throws.",
    fix: "Generate one with: openssl rand -base64 32",
  },
];

const RECOMMENDED = [
  {
    name: "DIRECT_URL",
    why: "Unpooled Postgres connection, used for schema changes.",
    fix: "Required if DATABASE_URL is a pooled endpoint (a Neon '-pooler' host, or Supabase port 6543).",
    onlyIfPostgres: true,
  },
  {
    name: "CRON_SECRET",
    why: "Guards the settlement endpoint. Without it, settlement never runs and card holds expire uncollected.",
    fix: "Generate one with: openssl rand -hex 32",
  },
  {
    name: "NEXT_PUBLIC_APP_URL",
    why: "Used for absolute links and as the settlement function's fallback origin.",
    fix: "Set it to the deployed origin, e.g. https://your-project.vercel.app",
  },
  {
    name: "STRIPE_SECRET_KEY",
    why: "Without it a stub payment gateway is used and no money moves.",
    fix: "Add your Stripe secret key when you are ready to take payments.",
  },
  {
    name: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    why: "The in-page card form cannot initialise without it.",
    fix: "Add your Stripe publishable key alongside the secret key.",
  },
];

/**
 * Rate suppliers, reported individually.
 *
 * A combined "0/3 set" line was genuinely confusing: it could not tell you
 * WHICH supplier was missing, so "LiteAPI isn't connected" and "Amadeus isn't
 * connected" looked identical. Each supplier is now named, and its key is
 * sanity-checked for shape — a key pasted into the wrong variable is the most
 * likely reason a supplier appears disconnected while you are certain you set it.
 */
const SUPPLIER_SOURCES = [
  {
    label: "LiteAPI",
    vars: ["LITEAPI_KEY"],
    // LiteAPI issues sandbox keys as sand_… and live keys as prod_….
    check(env) {
      const key = env.LITEAPI_KEY?.trim();
      if (!key) return null;
      if (!/^(sand|prod)_/i.test(key)) {
        return (
          "LITEAPI_KEY does not start with sand_ or prod_. LiteAPI sandbox keys " +
          "begin with sand_ and live keys with prod_, so this may be a key for a " +
          "different service pasted into the wrong variable."
        );
      }
      return null;
    },
  },
  {
    label: "Amadeus",
    vars: ["AMADEUS_CLIENT_ID", "AMADEUS_CLIENT_SECRET"],
    check: () => null,
  },
];

const SUPPLIERS = SUPPLIER_SOURCES.flatMap((source) => source.vars);

/**
 * Sign-in providers. None is required — the app always offers email/password,
 * and phone sign-in works without Twilio by printing the code to the server log
 * in development. Each is reported so it is obvious which buttons users will
 * actually see.
 */
const SIGN_IN_METHODS = [
  { label: "Google sign-in", vars: ["AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"] },
  {
    label: "Apple sign-in",
    vars: ["APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY"],
  },
  {
    label: "Email sign-in codes",
    vars: ["RESEND_API_KEY", "EMAIL_FROM"],
  },
  {
    label: "Phone sign-in SMS",
    vars: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"],
  },
];

const set = (name) => Boolean(process.env[name]?.trim());

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const isPostgres = /^postgres(ql)?:\/\//i.test(databaseUrl);
const isSqlite = /^file:/i.test(databaseUrl);

/** True when we are building for a deployed environment rather than a laptop. */
const isDeployBuild =
  process.env.VERCEL === "1" ||
  process.env.NETLIFY === "true" ||
  process.env.CI === "true";

/** Point people at the right settings screen for wherever they are building. */
const whereToSetThem =
  process.env.VERCEL === "1"
    ? " On Vercel these go in: Project → Settings → Environment Variables."
    : process.env.NETLIFY === "true"
      ? " On Netlify these go in: Site configuration → Environment variables."
      : " Set them in your host's environment settings.";

/**
 * Detects a connection string that goes through a connection pooler.
 *
 * Neon and Supabase both hand you the pooled string BY DEFAULT, so this is the
 * likely thing to paste. PgBouncer cannot run DDL reliably, so a schema push
 * against it hangs or half-applies — a failure that surfaces much later and
 * much less legibly than this check does.
 */
function isPooled(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname.includes("-pooler") ||        // Neon
      parsed.hostname.includes("pooler.supabase") || // Supabase
      parsed.port === "6543" ||                      // Supabase transaction pooler
      /pgbouncer=true/i.test(parsed.search)
    );
  } catch {
    return false;
  }
}

const line = "─".repeat(64);
console.log(`\n${line}\n BKR build preflight\n${line}`);

/**
 * Conditional failures — configuration that is present but cannot work.
 * These are worth stopping for because each one fails LATER and less clearly.
 */
const conditionalFailures = [];

if (isPostgres && isPooled(databaseUrl) && !set("DIRECT_URL")) {
  conditionalFailures.push({
    name: "DIRECT_URL",
    why:
      "DATABASE_URL points at a POOLED endpoint, and connection poolers cannot run " +
      "the schema changes this build applies. The push would hang or half-apply.",
    fix:
      "Set DIRECT_URL to the UNPOOLED connection string. On Neon it is the same " +
      "string with '-pooler' removed from the host; on Supabase it is port 5432 " +
      "rather than 6543. Keep DATABASE_URL pooled — runtime queries want it.",
  });
}

if (isSqlite && isDeployBuild) {
  conditionalFailures.push({
    name: "DATABASE_URL",
    why:
      "DATABASE_URL is a SQLite file, which cannot work on a deployed serverless " +
      "platform: the filesystem is wiped on cold start and is not shared between " +
      "concurrent function instances. The build would succeed and the site would " +
      "lose every booking.",
    fix: "Use a Postgres connection string. Neon and Supabase both have free tiers.",
  });
}

const missingRequired = [
  ...REQUIRED.filter((entry) => !set(entry.name)),
  ...conditionalFailures,
];
for (const entry of REQUIRED) {
  console.log(` ${set(entry.name) ? "✓" : "✗"} ${entry.name}`);
}

for (const entry of RECOMMENDED) {
  if (entry.onlyIfPostgres && !isPostgres) continue;
  console.log(` ${set(entry.name) ? "✓" : "·"} ${entry.name}`);
}

const supplierCount = SUPPLIERS.filter(set).length;
for (const source of SUPPLIER_SOURCES) {
  const have = source.vars.filter(set).length;
  const mark = have === source.vars.length ? "✓" : have === 0 ? "·" : "!";
  console.log(
    ` ${mark} ${source.label} rate feed` +
      (source.vars.length > 1 ? ` (${have}/${source.vars.length})` : ""),
  );
}

for (const method of SIGN_IN_METHODS) {
  const have = method.vars.filter(set).length;
  const mark = have === method.vars.length ? "✓" : have === 0 ? "·" : "!";
  console.log(` ${mark} ${method.label} (${have}/${method.vars.length})`);
}
console.log(line);

// --- Warnings: things that build fine but behave in a reduced way ----------
const warnings = [];

for (const entry of RECOMMENDED) {
  if (entry.onlyIfPostgres && !isPostgres) continue;
  // Skip anything already reported as a hard failure below.
  if (conditionalFailures.some((failure) => failure.name === entry.name)) continue;
  if (!set(entry.name)) warnings.push(`${entry.name} — ${entry.why}\n   ${entry.fix}`);
}

// A half-configured provider is worse than none: the button appears in some
// code paths and then fails at the redirect.
for (const method of SIGN_IN_METHODS) {
  const missing = method.vars.filter((name) => !set(name));
  if (missing.length > 0 && missing.length < method.vars.length) {
    warnings.push(
      `${method.label} is partially configured — missing ${missing.join(", ")}.\n` +
        "   Set all of them, or none, so the option is either offered or hidden.",
    );
  }
}

// Shape problems in a key that IS set — the "but I already added it" case.
for (const source of SUPPLIER_SOURCES) {
  const problem = source.check(process.env);
  if (problem) warnings.push(problem);
}

/*
 * Resend's shared sender only delivers to the address that owns the Resend
 * account. It is the right thing to test with and the wrong thing to launch
 * with: sign-in looks perfect to you and silently delivers nothing to anyone
 * else. That failure is invisible — no error, no bounce, just users who never
 * get a code — so it is worth naming here rather than discovering in support.
 */
const emailFrom = process.env.EMAIL_FROM?.trim();
if (emailFrom && /@resend\.dev\b/i.test(emailFrom)) {
  warnings.push(
    "EMAIL_FROM uses Resend's shared onboarding@resend.dev sender.\n" +
      "   That address ONLY delivers to the email that owns your Resend account.\n" +
      "   Fine for testing; every other user will silently receive nothing.\n" +
      "   Verify a domain at resend.com/domains and send from it before launch.",
  );
}

if (process.env.RESEND_API_KEY?.trim() && !emailFrom) {
  warnings.push(
    "RESEND_API_KEY is set but EMAIL_FROM is not — Resend rejects a send with no\n" +
      "   sender, so sign-in codes will fail. Set EMAIL_FROM, e.g.\n" +
      '   "BKR <login@yourdomain.com>".',
  );
}

if (supplierCount === 0) {
  warnings.push(
    "No supplier credentials — the app will serve built-in demo hotels rather than real, bookable rates.\n" +
      "   LiteAPI needs LITEAPI_KEY; Amadeus needs AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET.\n" +
      "   Free instant keys: https://dashboard.liteapi.travel and https://developers.amadeus.com",
  );
} else if (supplierCount < SUPPLIERS.length) {
  const missing = SUPPLIER_SOURCES.filter((source) => !source.vars.every(set)).map(
    (source) => source.label,
  );
  warnings.push(
    `Only some rate feeds are configured — ${missing.join(", ")} ${
      missing.length === 1 ? "is" : "are"
    } not set.\n` +
      "   Best-price comparison needs at least two feeds; with one there is nothing to compare against.",
  );
}

if (warnings.length > 0) {
  console.log("\n Warnings (the build will continue):\n");
  for (const warning of warnings) console.log(` • ${warning}\n`);
}

// --- Fatal: a green build here would deploy a broken site -------------------
if (missingRequired.length > 0) {
  // "missing" would be wrong for values that are present but unusable, such as
  // a SQLite path on a serverless platform.
  console.error(`${line}\n BUILD STOPPED — configuration must be fixed first\n${line}\n`);
  for (const entry of missingRequired) {
    console.error(` ✗ ${entry.name}`);
    console.error(`   ${entry.why}`);
    console.error(`   → ${entry.fix}\n`);
  }
  console.error(
    `${whereToSetThem}\n` +
      " Locally they go in .env (copy .env.example as a starting point).\n",
  );
  process.exit(1);
}

console.log(" Preflight passed.\n");
