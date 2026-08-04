/**
 * Build preflight.
 *
 * Runs before anything else in `npm run build` and reports, in one readable
 * block, exactly which environment variables are present and which are not.
 *
 * This exists because of how the failures actually looked. A missing
 * DATABASE_URL surfaced as a Prisma wasm validation dump forty lines into the
 * log, and a devDependency prune surfaced as `prisma: not found` — neither of
 * which tells you that the fix is one line in the Netlify environment settings.
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
    fix: "Set it to the deployed origin, e.g. https://your-site.netlify.app",
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

const SUPPLIERS = ["LITEAPI_KEY", "AMADEUS_CLIENT_ID", "AMADEUS_CLIENT_SECRET"];

const set = (name) => Boolean(process.env[name]?.trim());
const isPostgres = /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL ?? "");

const line = "─".repeat(64);
console.log(`\n${line}\n Hotelbook build preflight\n${line}`);

const missingRequired = REQUIRED.filter((entry) => !set(entry.name));
for (const entry of REQUIRED) {
  console.log(` ${set(entry.name) ? "✓" : "✗"} ${entry.name}`);
}

for (const entry of RECOMMENDED) {
  if (entry.onlyIfPostgres && !isPostgres) continue;
  console.log(` ${set(entry.name) ? "✓" : "·"} ${entry.name}`);
}

const supplierCount = SUPPLIERS.filter(set).length;
console.log(
  ` ${supplierCount > 0 ? "✓" : "·"} supplier credentials ` +
    `(${supplierCount}/${SUPPLIERS.length} set)`,
);
console.log(line);

// --- Warnings: things that build fine but behave in a reduced way ----------
const warnings = [];

for (const entry of RECOMMENDED) {
  if (entry.onlyIfPostgres && !isPostgres) continue;
  if (!set(entry.name)) warnings.push(`${entry.name} — ${entry.why}\n   ${entry.fix}`);
}

if (supplierCount === 0) {
  warnings.push(
    "No supplier credentials — the app will serve built-in demo hotels rather than real, bookable rates.\n" +
      "   Free instant keys: https://dashboard.liteapi.travel and https://developers.amadeus.com",
  );
}

if (warnings.length > 0) {
  console.log("\n Warnings (the build will continue):\n");
  for (const warning of warnings) console.log(` • ${warning}\n`);
}

// --- Fatal: a green build here would deploy a broken site -------------------
if (missingRequired.length > 0) {
  console.error(`${line}\n BUILD STOPPED — missing required configuration\n${line}\n`);
  for (const entry of missingRequired) {
    console.error(` ✗ ${entry.name}`);
    console.error(`   ${entry.why}`);
    console.error(`   → ${entry.fix}\n`);
  }
  console.error(
    " On Netlify these go in: Site configuration → Environment variables.\n" +
      " Locally they go in .env (copy .env.example as a starting point).\n",
  );
  process.exit(1);
}

console.log(" Preflight passed.\n");
