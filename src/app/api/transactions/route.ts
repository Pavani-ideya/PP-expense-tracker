import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";
import { transactions } from "@/lib/schema";
import { categorizeTransaction } from "@/lib/categorize";
import { desc, eq, inArray } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET() {
  await ensureSchema();
  const rows = await getDb().select().from(transactions).orderBy(desc(transactions.date));
  return NextResponse.json(rows);
}

// Two things happen here, chosen by the request body:
//
//   { approveIds: number[], category?: string } — a person has looked at specific Needs
//   Review rows and confirmed they're genuine transactions. Assigns them the given category
//   (defaulting to "Uncategorized") and clears needsReview so they count in totals/dashboard.
//   Declining a row is just a normal delete (DELETE { ids: [...] }) — no separate verb needed.
//
//   {} (no body / no approveIds) — re-runs categorization on everything currently flagged
//   Needs Review, using today's rules. Categorization only happens at upload time, so
//   improvements to categorize.ts (e.g. adding a new merchant chain) don't retroactively touch
//   rows already sitting in the database — this lets those get reclassified without
//   re-uploading the original statement.
export async function PATCH(req: NextRequest) {
  await ensureSchema();
  const db = getDb();
  const body = await req.json().catch(() => ({}));

  if (Array.isArray(body.approveIds) && body.approveIds.length > 0) {
    const ids = body.approveIds.filter((n: unknown) => typeof n === "number");
    if (ids.length === 0) {
      return NextResponse.json({ error: "approveIds must be numbers" }, { status: 400 });
    }
    const category =
      typeof body.category === "string" && body.category.trim() ? body.category.trim() : "Uncategorized";
    const updated = await db
      .update(transactions)
      .set({ category, needsReview: false })
      .where(inArray(transactions.id, ids))
      .returning({ id: transactions.id });
    return NextResponse.json({ approvedCount: updated.length });
  }

  const rows = await db
    .select({ id: transactions.id, description: transactions.description })
    .from(transactions)
    .where(eq(transactions.needsReview, true));

  let updatedCount = 0;
  for (const r of rows) {
    const result = categorizeTransaction(r.description);
    if (!result.needsReview) {
      await db
        .update(transactions)
        .set({ category: result.category, isTransfer: result.isTransfer, needsReview: false })
        .where(eq(transactions.id, r.id));
      updatedCount++;
    }
  }

  return NextResponse.json({ updatedCount, checkedCount: rows.length });
}

// Deletes transactions. Body is one of:
//   { ids: number[] }          — specific rows
//   { needsReviewOnly: true }  — bulk-clear everything still flagged Needs Review
//   { dedupe: true }           — remove exact-duplicate rows (same date + description +
//                                 amount) left over from before upload-time dedup existed,
//                                 keeping the lowest id (earliest-inserted copy) of each set.
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

  if (body.dedupe) {
    const rows = await db
      .select({
        id: transactions.id,
        date: transactions.date,
        description: transactions.description,
        amount: transactions.amount,
      })
      .from(transactions);

    const seen = new Map<string, number>(); // key -> id kept
    const idsToDelete: number[] = [];
    for (const r of rows.sort((a, b) => a.id - b.id)) {
      const key = `${r.date}|${r.description.trim().toLowerCase()}|${r.amount.toFixed(2)}`;
      if (seen.has(key)) {
        idsToDelete.push(r.id);
      } else {
        seen.set(key, r.id);
      }
    }

    if (idsToDelete.length === 0) {
      return NextResponse.json({ deletedCount: 0 });
    }
    const deleted = await db
      .delete(transactions)
      .where(inArray(transactions.id, idsToDelete))
      .returning({ id: transactions.id });
    return NextResponse.json({ deletedCount: deleted.length });
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter((n: unknown) => typeof n === "number") : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "No ids, needsReviewOnly, or dedupe provided" }, { status: 400 });
  }
  const deleted = await db.delete(transactions).where(inArray(transactions.id, ids)).returning({ id: transactions.id });
  return NextResponse.json({ deletedCount: deleted.length });
}
