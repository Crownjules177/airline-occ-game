/**
 * Apply database migrations. Runs in the Vercel build (see `vercel-build` in package.json) so the
 * schema is ready before the first request, instead of racing on cold starts.
 */
import { getDb } from "../src/engine/db/client";

if (!process.env.DATABASE_URL) {
  console.log("DATABASE_URL not set; skipping migrations (local PGlite migrates on first use).");
  process.exit(0);
}
await getDb();
console.log("Migrations applied.");
process.exit(0);
