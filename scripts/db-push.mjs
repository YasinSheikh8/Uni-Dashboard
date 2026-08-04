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

/**
 * Decides whether Prisma's data-loss warnings are actually destructive.
 *
 * Prisma lumps two very different things under one banner:
 *
 *   "A unique constraint covering the columns [phone] on the table User will be
 *    added. If there are existing duplicate values, this will fail."
 *
 * cannot lose anything. Adding a constraint deletes no rows and drops no
 * columns; if duplicates exist the statement simply fails, loudly, and the
 * database is untouched. The "data loss" framing is about the migration not
 * completing, not about data disappearing.
 *
 *   "You are about to drop the column `foo` on the `User` table"
 *
 * genuinely destroys data.
 *
 * Making a human classify these was the wrong design — it turned a decision the
 * script can make correctly into a manual step, and manual steps in a deploy
 * pipeline get skipped. So the additive-only case now proceeds on its own, and
 * anything that drops or alters existing data still stops the build and still
 * needs a deliberate override.
 */
const ADDITIVE_WARNING = /unique constraint .*will be added/i;

function classifyWarnings(text) {
  const marker = "There might be data loss when applying the changes:";
  const start = text.indexOf(marker);
  if (start === -1) return { bullets: [], allAdditive: false };

  const bullets = text
    .slice(start + marker.length)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("•"))
    .map((line) => line.replace(/^•\s*/, ""));

  return {
    bullets,
    allAdditive: bullets.length > 0 && bullets.every((line) => ADDITIVE_WARNING.test(line)),
  };
}

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
const { bullets, allAdditive } = classifyWarnings(output);

if (isDataLossBlock && (allAdditive || allowDataLoss)) {
  if (allAdditive) {
    console.warn(
      "\n[db] Prisma's warnings are all additive constraints, which cannot lose\n" +
        "[db] data — a constraint deletes nothing, it only fails if duplicates\n" +
        "[db] already exist. Applying them:\n" +
        bullets.map((line) => `[db]   • ${line}`).join("\n") +
        "\n",
    );
  } else {
    console.warn(
      "\n[db] ALLOW_SCHEMA_DATA_LOSS=true — retrying with --accept-data-loss.\n" +
        "[db] These changes CAN destroy data and are being applied because this\n" +
        "[db] build was explicitly configured to allow it:\n" +
        bullets.map((line) => `[db]   • ${line}`).join("\n") +
        "\n[db] Unset ALLOW_SCHEMA_DATA_LOSS once the schema has caught up.\n",
    );
  }

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
    "    Prisma flagged changes that CAN destroy data:\n" +
      bullets.map((line) => `      • ${line}`).join("\n") +
      "\n\n" +
      "    Additive constraints are applied automatically because they cannot lose\n" +
      "    anything. These are not that — they drop or rewrite existing data, so the\n" +
      "    build stops rather than deciding for you.\n" +
      "\n" +
      "    If you are certain, set ALLOW_SCHEMA_DATA_LOSS=true for one deploy and\n" +
      "    unset it afterwards. Otherwise apply the change deliberately against the\n" +
      "    database first.\n",
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
