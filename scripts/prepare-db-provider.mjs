/**
 * Keeps prisma's datasource provider in step with DATABASE_URL.
 *
 * SQLite locally so the app runs with zero setup; Postgres on Netlify, where a
 * file-backed database would be wiped on every cold start and cannot be shared
 * between concurrent lambdas. Rather than maintaining two schema files that
 * drift, the single schema's provider line is rewritten from the connection
 * string at build time.
 *
 * Idempotent: running it against a SQLite URL leaves a SQLite schema untouched.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, "..", "prisma", "schema.prisma");

const url = process.env.DATABASE_URL ?? "";

let provider = "sqlite";
if (/^postgres(ql)?:\/\//i.test(url)) provider = "postgresql";
else if (/^mysql:\/\//i.test(url)) provider = "mysql";

const schema = readFileSync(schemaPath, "utf8");
const updated = schema.replace(
  /(datasource\s+db\s*\{[^}]*?provider\s*=\s*)"[^"]+"/s,
  `$1"${provider}"`,
);

if (updated === schema) {
  console.log(`[db] provider already "${provider}"`);
} else {
  writeFileSync(schemaPath, updated);
  console.log(`[db] provider set to "${provider}" from DATABASE_URL`);
}
