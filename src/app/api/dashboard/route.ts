import { NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";
import { transactions } from "@/lib/schema";

export const runtime = "nodejs";

export async function GET() {
  await ensureSchema();
  const rows = await getDb().select().from(transactions);

  // Household spend excludes personal transfers (e.g. Sreenidhi Zelle) — those aren't expenses.
  const expenseRows = rows.filter((r) => !r.isTransfer);

  const totalSpend = expenseRows.reduce((sum, r) => sum + r.amount, 0);

  // Group by calendar month (YYYY-MM) for the trend chart and monthly average.
  const byMonth = new Map<string, number>();
  for (const r of expenseRows) {
    const month = r.date.slice(0, 7); // YYYY-MM
    byMonth.set(month, (byMonth.get(month) ?? 0) + r.amount);
  }
  const monthlyTrend = Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, total]) => ({ month, total: Math.round(total * 100) / 100 }));

  const averageMonthly = monthlyTrend.length > 0 ? totalSpend / monthlyTrend.length : 0;

  // Group by category for the donut chart.
  const byCategory = new Map<string, number>();
  for (const r of expenseRows) {
    byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + r.amount);
  }
  const categoryTotals = Array.from(byCategory.entries())
    .map(([category, total]) => ({ category, total: Math.round(total * 100) / 100 }))
    .sort((a, b) => b.total - a.total);

  const largestCategory = categoryTotals[0] ?? { category: "—", total: 0 };

  // Top merchants by total spend — group by a normalized description (strip trailing
  // transaction IDs / store numbers that make otherwise-identical merchants look distinct).
  const byMerchant = new Map<string, { total: number; count: number }>();
  for (const r of expenseRows) {
    const key = normalizeMerchant(r.description);
    const existing = byMerchant.get(key) ?? { total: 0, count: 0 };
    existing.total += r.amount;
    existing.count += 1;
    byMerchant.set(key, existing);
  }
  const topMerchants = Array.from(byMerchant.entries())
    .map(([merchant, { total, count }]) => ({
      merchant,
      total: Math.round(total * 100) / 100,
      count,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const needsReviewCount = rows.filter((r) => r.needsReview).length;
  const transferTotal = rows.filter((r) => r.isTransfer).reduce((sum, r) => sum + r.amount, 0);

  return NextResponse.json({
    totalSpend: round2(totalSpend),
    averageMonthly: round2(averageMonthly),
    largestCategory,
    monthlyTrend,
    categoryTotals,
    topMerchants,
    needsReviewCount,
    transferTotal: round2(transferTotal),
    transactionCount: rows.length,
  });
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// Strips common noise (card transaction IDs, store numbers, extra whitespace) so
// "AMAZON MKTPL*7R4VY77Q3" and "AMAZON MKTPL*8E2SZ1P13" roll up into one merchant.
function normalizeMerchant(description: string): string {
  let s = description.trim();
  s = s.replace(/\*[A-Z0-9]{6,}$/i, ""); // trailing *TXNID
  s = s.replace(/#\d+/g, ""); // store numbers like #0452
  s = s.replace(/\s{2,}/g, " ").trim();
  return s || description.trim();
}
