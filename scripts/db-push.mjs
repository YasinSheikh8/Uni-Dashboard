/**
 * Applies the schema during the build.
 *
 * Wrapped rather than called directly so it can be skipped deliberately
 * (SKIP_DB_PUSH=true) by anyone who manages migrations separately, and so the
 * failure is explained rather than left as a raw Prisma exit code.
 *
 * Note that `prisma db push` REFUSES destructive changes unless explicitly
 * allowed, and that is on purpose: a build should fail loudly rather than
 * quietly drop a column of live bookings. If you hit that, make the change
 * deliberately against the database rather than adding --accept-data-loss here.
 */

import { spawnSync } from "node:child_process";

if (process.env.SKIP_DB_PUSH === "true") {
  console.log("[db] SKIP_DB_PUSH=true — leaving the schema alone.");
  process.exit(0);
}

console.log("[db] Applying schema…");

const result = spawnSync(
  "npx",
  ["prisma", "db", "push", "--skip-generate"],
  { stdio: "inherit", shell: process.platform === "win32" },
);

if (result.status !== 0) {
  console.error(
    "\n[db] Schema push failed.\n" +
      "    · If DATABASE_URL points at a POOLED endpoint (a Neon '-pooler' host,\n" +
      "      or Supabase port 6543), set DIRECT_URL to the unpooled string —\n" +
      "      PgBouncer cannot run DDL reliably.\n" +
      "    · If this reports data loss, the schema change is destructive. Apply it\n" +
      "      deliberately against the database rather than forcing it in a build.\n" +
      "    · To manage the schema yourself, set SKIP_DB_PUSH=true.\n",
  );
  process.exit(result.status ?? 1);
}

console.log("[db] Schema is up to date.");
