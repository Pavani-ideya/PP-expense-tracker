"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import "./dashboard.css";
import KpiCard from "@/components/KpiCard";
import PieChart from "@/components/PieChart";
import TrendChart from "@/components/TrendChart";
import TopMerchants from "@/components/TopMerchants";
import type { DashboardData } from "@/lib/dashboardTypes";

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState("all");
  const [category, setCategory] = useState("all");

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (month !== "all") params.set("month", month);
        if (category !== "all") params.set("category", category);
        const res = await fetch(`/api/dashboard?${params.toString()}`);
        const json = await res.json();
        setData(json);
      } finally {
        setLoading(false);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [month, category]);

  const money = (n: number) =>
    n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <div className="viz-root min-h-screen bg-[var(--page-plane)]">
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Dashboard</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Household spending overview, excluding personal transfers.
            </p>
          </div>
          <Link
            href="/"
            className="text-sm font-medium text-[var(--series-1)] hover:underline"
          >
            ← Transactions
          </Link>
        </div>

        {data && data.transactionCount > 0 && (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              Month
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1 text-sm text-[var(--text-primary)]"
              >
                <option value="all">All months</option>
                {[...data.availableMonths].reverse().map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              Category
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1 text-sm text-[var(--text-primary)]"
              >
                <option value="all">All categories</option>
                {data.availableCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            {(month !== "all" || category !== "all") && (
              <button
                onClick={() => {
                  setMonth("all");
                  setCategory("all");
                }}
                className="text-sm font-medium text-[var(--series-1)] hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {loading || !data ? (
          <div className="mt-10 text-sm text-[var(--text-secondary)]">Loading…</div>
        ) : data.transactionCount === 0 ? (
          <div className="mt-10 rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-1)] p-8 text-center text-sm text-[var(--text-secondary)]">
            No transactions yet.{" "}
            <Link href="/" className="text-[var(--series-1)] hover:underline">
              Upload a statement
            </Link>{" "}
            to get started.
          </div>
        ) : data.filteredTransactionCount === 0 ? (
          <div className="mt-10 rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-1)] p-8 text-center text-sm text-[var(--text-secondary)]">
            No transactions match this filter.
          </div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <KpiCard
                label={month === "all" ? "Total spend" : `Spend — ${monthLabel(month)}`}
                value={money(data.totalSpend)}
              />
              <KpiCard label="Average monthly" value={money(data.averageMonthly)} />
              <KpiCard
                label="Largest category"
                value={data.largestCategory.category}
                sublabel={money(data.largestCategory.total)}
              />
              <KpiCard
                label="Needs review"
                value={String(data.needsReviewCount)}
                sublabel={
                  data.needsReviewCount > 0 ? "transactions to check" : "all categorized"
                }
              />
            </div>

            {data.transferTotal > 0 && (
              <p className="mt-3 text-xs text-[var(--text-muted)]">
                Personal transfers excluded from the totals above: {money(data.transferTotal)}
              </p>
            )}

            <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-5">
                <h2 className="text-sm font-medium text-[var(--text-primary)]">
                  Spending by category
                </h2>
                <div className="mt-4">
                  <PieChart data={data.categoryTotals} />
                </div>
              </section>

              <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-5">
                <h2 className="text-sm font-medium text-[var(--text-primary)]">Monthly trend</h2>
                <div className="mt-4">
                  <TrendChart data={data.monthlyTrend} />
                </div>
              </section>
            </div>

            <section className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-5">
              <h2 className="text-sm font-medium text-[var(--text-primary)]">Top merchants</h2>
              <div className="mt-4">
                <TopMerchants data={data.topMerchants} />
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
