import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";
import { transactions } from "@/lib/schema";

export const runtime = "nodejs";

// Supports optional ?month=YYYY-MM and ?category=<name> query params to filter the
// dashboard the way a pivot-table filter would in the Excel version this replaces.
// "all" (or omitted) means no filter on that dimension.
export async function GET(req: NextRequest) {
  await ensureSchema();
  const { searchParams } = new URL(req.url);
  const monthFilter = searchParams.get("month");
  const categoryFilter = searchParams.get("category");

  const rows = await getDb().select().from(transactions);

  // Household spend excludes personal transfers (e.g. Sreenidhi Zelle) and income (deposits,
  // interest, refunds) — neither of those is an expense.
  const allExpenseRows = rows.filter((r) => !r.isTransfer && !r.isIncome);

  const availableMonths = Array.from(
    new Set(allExpenseRows.map((r) => r.date.slice(0, 7)))
  ).sort();
  const availableCategories = Array.from(
    new Set(allExpenseRows.map((r) => r.category))
  ).sort();

  // Trend chart always spans every month so a single-month filter doesn't collapse it to
  // one bar; a category filter does narrow it, so you can see e.g. "Groceries over time".
  const trendRows =
    categoryFilter && categoryFilter !== "all"
      ? allExpenseRows.filter((r) => r.category === categoryFilter)
      : allExpenseRows;
  const byMonth = new Map<string, number>();
  for (const r of trendRows) {
    const month = r.date.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + r.amount);
  }
  const monthlyTrend = Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, total]) => ({ month, total: Math.round(total * 100) / 100 }));

  // KPI totals, category breakdown, and top merchants all respect both filters.
  let expenseRows = allExpenseRows;
  if (monthFilter && monthFilter !== "all") {
    expenseRows = expenseRows.filter((r) => r.date.slice(0, 7) === monthFilter);
  }
  if (categoryFilter && categoryFilter !== "all") {
    expenseRows = expenseRows.filter((r) => r.category === categoryFilter);
  }

  const totalSpend = expenseRows.reduce((sum, r) => sum + r.amount, 0);

  const monthsInView =
    monthFilter && monthFilter !== "all" ? 1 : availableMonths.length || 1;
  const averageMonthly = totalSpend / monthsInView;

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

  // Needs-review count and transfer total follow the month filter (so they describe the
  // period you're looking at) but not the category filter, since transfers/needs-review
  // rows aren't assigned a normal spending category.
  let allRowsInPeriod = rows;
  if (monthFilter && monthFilter !== "all") {
    allRowsInPeriod = allRowsInPeriod.filter((r) => r.date.slice(0, 7) === monthFilter);
  }
  const needsReviewCount = allRowsInPeriod.filter((r) => r.needsReview).length;
  const transferTotal = allRowsInPeriod
    .filter((r) => r.isTransfer)
    .reduce((sum, r) => sum + r.amount, 0);
  const incomeTotal = allRowsInPeriod
    .filter((r) => r.isIncome)
    .reduce((sum, r) => sum + r.amount, 0);

  return NextResponse.json({
    totalSpend: round2(totalSpend),
    averageMonthly: round2(averageMonthly),
    largestCategory,
    monthlyTrend,
    categoryTotals,
    topMerchants,
    needsReviewCount,
    transferTotal: round2(transferTotal),
    incomeTotal: round2(incomeTotal),
    transactionCount: rows.length,
    availableMonths,
    availableCategories,
    filteredTransactionCount: expenseRows.length,
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
