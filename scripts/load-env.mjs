/**
 * Loads .env for plain-Node build scripts.
 *
 * Prisma and Next both read .env themselves, but a bare `node scripts/x.mjs`
 * does not — so a script that checks process.env would wrongly report a locally
 * configured variable as missing.
 *
 * `process.loadEnvFile` does not override variables already in the environment,
 * so real platform config (Netlify, CI) always wins over a stray local file.
 */
export function loadEnv() {
  try {
    process.loadEnvFile();
  } catch {
    // No .env — normal on Netlify, where variables are injected directly.
  }
}
