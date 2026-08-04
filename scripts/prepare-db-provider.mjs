/**
 * Keeps prisma's datasource in step with DATABASE_URL.
 *
 * SQLite locally so the app runs with zero setup; Postgres in production, where
 * a file-backed database would be wiped on every cold start and cannot be
 * shared between concurrent lambdas. Rather than maintaining two schema files
 * that drift, the single schema's datasource block is rewritten from the
 * connection string at build time.
 *
 * It also wires `directUrl` when DIRECT_URL is present. This matters on Neon
 * (and Supabase, and any other PgBouncer-fronted Postgres): the pooled endpoint
 * cannot run DDL reliably, so `prisma db push` and migrations have to go to the
 * direct endpoint while the app's runtime queries keep using the pooled one.
 * Getting this wrong produces a deploy that either hangs or half-applies the
 * schema — the failure mode is ugly and non-obvious, so it is handled here
 * rather than left to whoever sets the env vars.
 *
 * Idempotent: running it against a SQLite URL leaves a SQLite schema untouched.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, "..", "prisma", "schema.prisma");

const url = process.env.DATABASE_URL ?? "";
const directUrl = process.env.DIRECT_URL ?? "";

let provider = "sqlite";
if (/^postgres(ql)?:\/\//i.test(url)) provider = "postgresql";
else if (/^mysql:\/\//i.test(url)) provider = "mysql";

const schema = readFileSync(schemaPath, "utf8");

// Rebuild the whole datasource block so directUrl can be added or removed
// cleanly instead of accumulating across builds.
const lines = [
  "datasource db {",
  `  provider = "${provider}"`,
  '  url      = env("DATABASE_URL")',
];

const usesDirect = provider === "postgresql" && directUrl.length > 0;
if (usesDirect) {
  lines.push(
    "  // Pooled connections (Neon/Supabase PgBouncer) cannot run DDL reliably.",
    "  // Schema changes go direct; runtime queries stay on the pooled url.",
    '  directUrl = env("DIRECT_URL")',
  );
}
lines.push("}");

const updated = schema.replace(/datasource\s+db\s*\{[^}]*\}/s, lines.join("\n"));

if (updated === schema) {
  console.log(`[db] datasource already correct (provider "${provider}")`);
} else {
  writeFileSync(schemaPath, updated);
  console.log(
    `[db] provider "${provider}"${usesDirect ? " + directUrl" : ""} from environment`,
  );
}

if (provider === "postgresql" && !usesDirect) {
  console.warn(
    "[db] DIRECT_URL is not set. If DATABASE_URL points at a pooled endpoint " +
      "(a Neon '-pooler' host, or Supabase port 6543), schema pushes may hang " +
      "or partially apply. Set DIRECT_URL to the unpooled connection string.",
  );
}
