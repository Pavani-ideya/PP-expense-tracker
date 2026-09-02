import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";
import { statements, transactions } from "@/lib/schema";
import { parseCsvTransactions } from "@/lib/parseCsv";
import { parsePdfTransactions } from "@/lib/parsePdf";
import { categorizeTransaction } from "@/lib/categorize";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const filename = file.name;
    const isCsv = /\.csv$/i.test(filename);
    const isPdf = /\.pdf$/i.test(filename);

    if (!isCsv && !isPdf) {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload a .csv or .pdf statement." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let raw: { date: string; description: string; amount: number; isIncome: boolean }[] = [];

    if (isCsv) {
      const text = buffer.toString("utf-8");
      raw = parseCsvTransactions(text);
    } else {
      const { extractPdfText } = await import("@/lib/extractPdfText");
      const text = await extractPdfText(buffer);
      raw = parsePdfTransactions(text, new Date().getFullYear());
    }

    if (raw.length === 0) {
      return NextResponse.json(
        {
          error:
            "No transactions could be extracted from this file. For PDFs, the statement layout may not be supported — a CSV export usually works best.",
        },
        { status: 422 }
      );
    }

    const now = new Date().toISOString();
    const db = getDb();

    // Dedupe against everything already in the database (same date + description + amount),
    // and within this file itself — statements sometimes repeat a line (e.g. a balance
    // recap table), and re-uploading the same file/overlapping statement is common with
    // multi-file uploads. Key is intentionally exact-match only, so two genuinely separate
    // same-day/same-amount charges to different merchants are never dropped.
    const existingRows = await db
      .select({
        date: transactions.date,
        description: transactions.description,
        amount: transactions.amount,
      })
      .from(transactions);
    const seenKeys = new Set(
      existingRows.map((r) => dedupeKey(r.date, r.description, r.amount))
    );

    const [statement] = await db
      .insert(statements)
      .values({
        filename,
        sourceType: isCsv ? "csv" : "pdf",
        uploadedAt: now,
        transactionCount: raw.length,
      })
      .returning();

    const rowsToInsert: (typeof transactions.$inferInsert)[] = [];
    let duplicateCount = 0;
    for (const t of raw) {
      const key = dedupeKey(t.date, t.description, t.amount);
      if (seenKeys.has(key)) {
        duplicateCount++;
        continue;
      }
      seenKeys.add(key);
      // Income rows (deposits, interest, refunds) are never expenses and never need a
      // spending category — categorization only applies to money going out.
      const cat = t.isIncome
        ? { category: "Income", isTransfer: false, needsReview: false }
        : categorizeTransaction(t.description);
      rowsToInsert.push({
        statementId: statement.id,
        date: t.date,
        description: t.description,
        amount: t.amount,
        category: cat.category,
        isTransfer: cat.isTransfer,
        isIncome: t.isIncome,
        needsReview: cat.needsReview,
        createdAt: now,
      });
    }

    if (rowsToInsert.length > 0) {
      await db.insert(transactions).values(rowsToInsert);
    }

    const needsReviewCount = rowsToInsert.filter((r) => r.needsReview).length;

    return NextResponse.json({
      statementId: statement.id,
      transactionCount: rowsToInsert.length,
      needsReviewCount,
      duplicateCount,
    });
  } catch (err) {
    console.error("Upload failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}

function dedupeKey(date: string, description: string, amount: number): string {
  return `${date}|${description.trim().toLowerCase()}|${amount.toFixed(2)}`;
}
