import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

// Vercel's Postgres integration (Neon) injects POSTGRES_URL rather than DATABASE_URL —
// accept either so this works whether it's set manually or wired up by the integration.
//
// IMPORTANT: this must NOT throw at module load time. Next.js imports route modules
// during the build's "Collecting page data" step to statically analyze them, before any
// request is ever made and before it's guaranteed env vars are injected into that step.
// Throwing here fails the build outright. Instead we lazily create the pool on first use,
// inside a request, where a missing connection string is a normal runtime 500.
let pool: Pool | null = null;
let dbInstance: ReturnType<typeof drizzle> | null = null;

function getPool(): Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error(
      "No database connection string found. Set DATABASE_URL (local dev, in .env.local) or connect Vercel Postgres, which injects POSTGRES_URL automatically."
    );
  }
  pool = new Pool({
    connectionString,
    ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
  });
  return pool;
}

export function getDb() {
  if (!dbInstance) {
    dbInstance = drizzle(getPool(), { schema });
  }
  return dbInstance;
}

let bootstrapped = false;
export async function ensureSchema() {
  if (bootstrapped) return;
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS statements (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL,
      source_type TEXT NOT NULL,
      account_label TEXT,
      uploaded_at TEXT NOT NULL,
      transaction_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      statement_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      is_transfer BOOLEAN NOT NULL DEFAULT FALSE,
      needs_review BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TEXT NOT NULL
    );

    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_income BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  bootstrapped = true;
}
