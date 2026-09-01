import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
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

    let raw: { date: string; description: string; amount: number }[] = [];

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

    const [statement] = await db
      .insert(statements)
      .values({
        filename,
        sourceType: isCsv ? "csv" : "pdf",
        uploadedAt: now,
        transactionCount: raw.length,
      })
      .returning();

    const rowsToInsert = raw.map((t) => {
      const cat = categorizeTransaction(t.description);
      return {
        statementId: statement.id,
        date: t.date,
        description: t.description,
        amount: t.amount,
        category: cat.category,
        isTransfer: cat.isTransfer,
        needsReview: cat.needsReview,
        createdAt: now,
      };
    });

    await db.insert(transactions).values(rowsToInsert);

    const needsReviewCount = rowsToInsert.filter((r) => r.needsReview).length;

    return NextResponse.json({
      statementId: statement.id,
      transactionCount: raw.length,
      needsReviewCount,
    });
  } catch (err) {
    console.error("Upload failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
