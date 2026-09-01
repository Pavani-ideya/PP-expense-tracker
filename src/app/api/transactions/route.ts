import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";
import { transactions } from "@/lib/schema";
import { desc, eq, inArray } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET() {
  await ensureSchema();
  const rows = await getDb().select().from(transactions).orderBy(desc(transactions.date));
  return NextResponse.json(rows);
}

// Deletes transactions. Body is either { ids: number[] } for specific rows, or
// { needsReviewOnly: true } to bulk-clear everything still flagged Needs Review —
// handy for wiping out mis-parsed rows (e.g. balance-table artifacts) after a bulk
// PDF import without having to click through them one at a time.
export async function DELETE(req: NextRequest) {
  await ensureSchema();
  const db = getDb();
  const body = await req.json().catch(() => ({}));

  if (body.needsReviewOnly) {
    const deleted = await db
      .delete(transactions)
      .where(eq(transactions.needsReview, true))
      .returning({ id: transactions.id });
    return NextResponse.json({ deletedCount: deleted.length });
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter((n: unknown) => typeof n === "number") : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "No ids or needsReviewOnly provided" }, { status: 400 });
  }
  const deleted = await db.delete(transactions).where(inArray(transactions.id, ids)).returning({ id: transactions.id });
  return NextResponse.json({ deletedCount: deleted.length });
}
