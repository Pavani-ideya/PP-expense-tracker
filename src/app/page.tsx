"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Transaction {
  id: number;
  statementId: number;
  date: string;
  description: string;
  amount: number;
  category: string;
  isTransfer: boolean;
  isIncome: boolean;
  needsReview: boolean;
}

export default function Home() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [reloadToken, setReloadToken] = useState(0);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/transactions");
      const data = await res.json();
      setTransactions(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadTransactions();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadTransactions, reloadToken]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    setMessage(null);
    setError(null);

    let totalImported = 0;
    let totalNeedsReview = 0;
    let totalDuplicates = 0;
    const succeeded: string[] = [];
    const failed: { name: string; error: string }[] = [];

    // Upload sequentially rather than in parallel: each upload does its own
    // insert against the same statements/transactions tables, and doing them
    // one at a time keeps error reporting per-file and avoids surprising
    // interleaved writes. It also means each file's duplicate check sees rows
    // inserted by files earlier in the batch, so overlapping statements in the
    // same upload get deduped against each other too, not just against history.
    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) {
          failed.push({ name: file.name, error: data.error ?? "Upload failed" });
        } else {
          totalImported += data.transactionCount;
          totalNeedsReview += data.needsReviewCount;
          totalDuplicates += data.duplicateCount ?? 0;
          succeeded.push(file.name);
        }
      } catch (err) {
        failed.push({ name: file.name, error: err instanceof Error ? err.message : "Upload failed" });
      }
    }

    if (succeeded.length > 0) {
      setMessage(
        `Imported ${totalImported} transactions from ${succeeded.length} file${succeeded.length === 1 ? "" : "s"} (${succeeded.join(", ")})` +
          (totalNeedsReview > 0 ? ` — ${totalNeedsReview} flagged as Needs Review.` : ".") +
          (totalDuplicates > 0 ? ` (${totalDuplicates} duplicate${totalDuplicates === 1 ? "" : "s"} skipped.)` : "")
      );
      setReloadToken((n) => n + 1);
    }
    if (failed.length > 0) {
      setError(failed.map((f) => `${f.name}: ${f.error}`).join(" · "));
    }

    setUploading(false);
    e.target.value = "";
  }

  const needsReviewCount = transactions.filter((t) => t.needsReview).length;

  async function deleteIds(ids: number[]) {
    setError(null);
    try {
      const res = await fetch("/api/transactions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Delete failed");
        return;
      }
      setReloadToken((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function clearNeedsReview() {
    if (needsReviewCount === 0) return;
    if (!confirm(`Delete all ${needsReviewCount} transactions flagged Needs Review? This can't be undone.`)) {
      return;
    }
    setError(null);
    try {
      const res = await fetch("/api/transactions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ needsReviewOnly: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Delete failed");
        return;
      }
      setReloadToken((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function removeDuplicates() {
    setError(null);
    try {
      const res = await fetch("/api/transactions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dedupe: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Dedupe failed");
        return;
      }
      const data = await res.json();
      setMessage(
        data.deletedCount > 0
          ? `Removed ${data.deletedCount} duplicate transaction${data.deletedCount === 1 ? "" : "s"}.`
          : "No duplicates found."
      );
      setReloadToken((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dedupe failed");
    }
  }

  async function approveTransaction(id: number) {
    const category = window.prompt(
      "This transaction is genuine — what category should it count under? (e.g. Groceries, Utilities, Miscellaneous)",
      "Uncategorized"
    );
    if (category === null) return; // cancelled
    setError(null);
    try {
      const res = await fetch("/api/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approveIds: [id], category }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Approve failed");
        return;
      }
      setReloadToken((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed");
    }
  }

  async function declineTransaction(id: number) {
    await deleteIds([id]);
  }

  async function clearAllData() {
    if (
      !confirm(
        `Delete ALL ${transactions.length} transactions and start over? Use this after the income/expense fix so your statements re-import with deposits correctly separated from spending. This can't be undone — you'll need to re-upload your statement files afterward.`
      )
    ) {
      return;
    }
    setError(null);
    try {
      const res = await fetch("/api/transactions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearAll: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Clear failed");
        return;
      }
      setMessage("All transactions cleared. Re-upload your statement files to start fresh.");
      setReloadToken((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clear failed");
    }
  }

  async function recheckCategories() {
    setError(null);
    try {
      const res = await fetch("/api/transactions", { method: "PATCH" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Re-check failed");
        return;
      }
      const data = await res.json();
      setMessage(
        data.updatedCount > 0
          ? `Recategorized ${data.updatedCount} of ${data.checkedCount} Needs Review transaction${data.checkedCount === 1 ? "" : "s"}.`
          : "No Needs Review transactions matched an updated rule."
      );
      setReloadToken((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-check failed");
    }
  }

  const total = transactions
    .filter((t) => !t.isTransfer && !t.isIncome)
    .reduce((sum, t) => sum + t.amount, 0);
  const incomeTotal = transactions
    .filter((t) => t.isIncome)
    .reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              Expense Tracker
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Upload a bank or credit card statement (CSV or PDF) to extract and categorize transactions.
            </p>
          </div>
          <Link href="/dashboard" className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
            Dashboard →
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Income</div>
            <div className="mt-1 text-2xl font-semibold text-green-700 dark:text-green-400">
              ${incomeTotal.toFixed(2)}
            </div>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Outgoing</div>
            <div className="mt-1 text-2xl font-semibold text-red-700 dark:text-red-400">
              ${total.toFixed(2)}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-dashed border-zinc-300 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
          <label className="flex flex-col items-center gap-3 cursor-pointer">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {uploading ? "Uploading & parsing…" : "Click to upload one or more statements (.csv or .pdf)"}
            </span>
            <input
              type="file"
              accept=".csv,.pdf"
              multiple
              className="hidden"
              disabled={uploading}
              onChange={handleFileChange}
            />
            <span className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900">
              Choose file
            </span>
          </label>
        </div>

        {message && (
          <div className="mt-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
            {message}
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
            Transactions ({transactions.length})
          </h2>
          <div className="flex items-center gap-4">
            <button
              onClick={removeDuplicates}
              className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Remove duplicates
            </button>
            {needsReviewCount > 0 && (
              <button
                onClick={recheckCategories}
                className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Re-check categories
              </button>
            )}
            {needsReviewCount > 0 && (
              <button
                onClick={clearNeedsReview}
                className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
              >
                Clear all {needsReviewCount} Needs Review
              </button>
            )}
            <button
              onClick={clearAllData}
              className="text-sm font-medium text-red-700 hover:underline dark:text-red-400"
            >
              Clear all data
            </button>
          </div>
        </div>

        <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
            <thead className="bg-zinc-100 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-zinc-500">Date</th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-zinc-500">Description</th>
                <th className="px-4 py-2 text-right text-xs font-medium uppercase text-zinc-500">Amount</th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-zinc-500">Category</th>
                <th className="px-4 py-2 text-right text-xs font-medium uppercase text-zinc-500"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-zinc-500">
                    Loading…
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-zinc-500">
                    No transactions yet. Upload a statement to get started.
                  </td>
                </tr>
              ) : (
                transactions.map((t) => (
                  <tr key={t.id}>
                    <td className="whitespace-nowrap px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300">
                      {t.date}
                    </td>
                    <td className="px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300">
                      {t.description}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-sm text-zinc-700 dark:text-zinc-300">
                      ${t.amount.toFixed(2)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-sm">
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-xs font-medium " +
                          (t.needsReview
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                            : t.isIncome
                            ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                            : t.isTransfer
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                            : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300")
                        }
                      >
                        {t.isIncome ? "Income" : t.category}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-sm">
                      {t.needsReview ? (
                        <div className="flex justify-end gap-3">
                          <button
                            onClick={() => approveTransaction(t.id)}
                            className="text-xs font-medium text-green-600 hover:underline dark:text-green-400"
                            title="Genuine transaction — assign a category and count it"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => declineTransaction(t.id)}
                            className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                            title="Not a real expense — delete it"
                          >
                            Decline
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => deleteIds([t.id])}
                          className="text-zinc-400 hover:text-red-600 dark:text-zinc-600 dark:hover:text-red-400"
                          title="Delete transaction"
                          aria-label="Delete transaction"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
