/**
 * Applies the schema during the build.
 *
 * Two passes, on purpose:
 *
 *   1. Try a plain `prisma db push`. Additive changes succeed here and nothing
 *      else happens.
 *   2. If Prisma raises a data-loss warning AND ALLOW_SCHEMA_DATA_LOSS is set,
 *      retry with --accept-data-loss, printing exactly what was accepted.
 *
 * Why not always pass --accept-data-loss: it will silently drop columns and
 * tables. A build that quietly destroys a column of live bookings is far worse
 * than a build that fails.
 *
 * Why allow it at all: Prisma's warning is conservative and fires on changes
 * that cannot actually lose anything. Adding a unique constraint is the common
 * case — it deletes nothing, it only fails if duplicate values already exist. On
 * a column that is entirely NULL there is nothing to collide with, but Prisma
 * cannot know that without reading the rows.
 *
 * So the escape hatch exists, is off by default, has to be set deliberately, and
 * says loudly what it let through.
 */

import { spawnSync } from "node:child_process";
import { loadEnv } from "./load-env.mjs";

loadEnv();

if (process.env.SKIP_DB_PUSH === "true") {
  console.log("[db] SKIP_DB_PUSH=true — leaving the schema alone.");
  process.exit(0);
}

const allowDataLoss = process.env.ALLOW_SCHEMA_DATA_LOSS === "true";

function push(extraArgs = []) {
  return spawnSync("npx", ["prisma", "db", "push", "--skip-generate", ...extraArgs], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
}

console.log("[db] Applying schema…");

const first = push();
if (first.stdout) process.stdout.write(first.stdout);
if (first.stderr) process.stderr.write(first.stderr);

if (first.status === 0) {
  console.log("[db] Schema is up to date.");
  process.exit(0);
}

const output = `${first.stdout ?? ""}${first.stderr ?? ""}`;
const isDataLossBlock = /--accept-data-loss/.test(output);

if (isDataLossBlock && allowDataLoss) {
  console.warn(
    "\n[db] ALLOW_SCHEMA_DATA_LOSS=true — retrying with --accept-data-loss.\n" +
      "[db] Prisma flagged the changes above; this build is configured to accept\n" +
      "[db] them. Unset ALLOW_SCHEMA_DATA_LOSS once the schema has caught up so\n" +
      "[db] the guard is back in place for later deploys.\n",
  );

  const retry = push(["--accept-data-loss"]);
  if (retry.stdout) process.stdout.write(retry.stdout);
  if (retry.stderr) process.stderr.write(retry.stderr);

  if (retry.status === 0) {
    console.log("[db] Schema is up to date.");
    process.exit(0);
  }

  console.error("\n[db] Schema push still failed even with --accept-data-loss.");
  process.exit(retry.status ?? 1);
}

console.error("\n[db] Schema push failed.");

if (isDataLossBlock) {
  console.error(
    "    Prisma flagged this change as potentially lossy (see above).\n" +
      "\n" +
      "    If the warning is only about adding a UNIQUE constraint to a column that\n" +
      "    is empty or already unique, nothing can actually be lost — Prisma cannot\n" +
      "    tell without reading the rows. To let it through, set\n" +
      "\n" +
      "        ALLOW_SCHEMA_DATA_LOSS=true\n" +
      "\n" +
      "    and redeploy, then unset it so later deploys stay guarded.\n" +
      "\n" +
      "    If the warning mentions DROPPING a column or table, do not set that flag.\n" +
      "    Apply that change deliberately against the database instead.\n",
  );
} else {
  console.error(
    "    · If DATABASE_URL points at a POOLED endpoint (a Neon '-pooler' host,\n" +
      "      or Supabase port 6543), set DIRECT_URL to the unpooled string —\n" +
      "      PgBouncer cannot run DDL reliably.\n" +
      "    · To manage the schema yourself, set SKIP_DB_PUSH=true.\n",
  );
}

process.exit(first.status ?? 1);
