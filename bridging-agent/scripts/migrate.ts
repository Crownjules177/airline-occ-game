/**
 * Apply database migrations. Runs in the Vercel build (see `vercel-build` in package.json) so the
 * schema is ready before the first request, instead of racing on cold starts.
 *
 * Only production deploys migrate. Preview builds of pull requests share the production database,
 * so letting them migrate would change the live schema before a change is merged.
 */
import { getDb } from "../src/engine/db/client";

const vercelEnv = process.env.VERCEL_ENV;
if (vercelEnv && vercelEnv !== "production") {
  console.log(`Vercel ${vercelEnv} build: skipping migrations (they run on production deploys only).`);
  process.exit(0);
}
if (!process.env.DATABASE_URL) {
  console.log("DATABASE_URL not set; skipping migrations (local PGlite migrates on first use).");
  process.exit(0);
}
/** The error and what caused it (the driver's reason, e.g. connection refused, sits in `cause`). */
function describe(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const first = e.message.split("\n")[0];
  return e.cause ? `${first} (${describe(e.cause)})` : first;
}

try {
  await getDb();
} catch (e) {
  console.error(
    [
      `Couldn't apply database migrations: ${describe(e)}`,
      "Check that DATABASE_URL is right and the database is reachable.",
      "On Supabase's free plan, projects pause after a week without use: restore it from the Supabase dashboard, then redeploy.",
    ].join("\n"),
  );
  process.exit(1);
}
console.log("Migrations applied.");
process.exit(0);
