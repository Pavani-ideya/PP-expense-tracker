import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

// Vercel's Postgres integration (Neon) injects POSTGRES_URL rather than DATABASE_URL —
// accept either so this works whether it's set manually or wired up by the integration.
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error(
    "No database connection string found. Set DATABASE_URL (local dev, in .env.local) or connect Vercel Postgres, which injects POSTGRES_URL automatically."
  );
}

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
});

export const db = drizzle(pool, { schema });

let bootstrapped = false;
export async function ensureSchema() {
  if (bootstrapped) return;
  await pool.query(`
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
  `);
  bootstrapped = true;
}
