import fs from "node:fs";
import path from "node:path";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import * as schema from "./schema";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

const migrationsFolder = path.join(process.cwd(), "drizzle");

/** In-memory database for tests. */
export async function createMemoryDb(): Promise<DB> {
  const client = new PGlite();
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder });
  return db as unknown as DB;
}

async function connect(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const client = postgres(url, { max: 5, prepare: false });
    const db = drizzlePostgres(client, { schema });
    await migratePostgres(db, { migrationsFolder });
    return db as unknown as DB;
  }
  // Local development: embedded Postgres persisted to ./.data
  const dir = path.join(process.cwd(), ".data", "pglite");
  fs.mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder });
  return db as unknown as DB;
}

const g = globalThis as unknown as { __bridgingDb?: Promise<DB> };

/** Process-wide database, migrated on first use. */
export function getDb(): Promise<DB> {
  g.__bridgingDb ??= connect();
  return g.__bridgingDb;
}
