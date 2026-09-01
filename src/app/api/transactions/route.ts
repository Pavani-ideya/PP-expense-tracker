import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { transactions } from "@/lib/schema";
import { desc } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET() {
  await ensureSchema();
  const rows = await db.select().from(transactions).orderBy(desc(transactions.date));
  return NextResponse.json(rows);
}
