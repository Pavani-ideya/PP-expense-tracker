interface Merchant {
  merchant: string;
  total: number;
  count: number;
}

export default function TopMerchants({ data }: { data: Merchant[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-[var(--text-secondary)]">
        No spending data yet
      </div>
    );
  }

  const maxTotal = Math.max(...data.map((d) => d.total));

  return (
    <ul className="flex flex-col gap-2.5">
      {data.map((m, i) => (
        <li key={m.merchant} className="flex items-center gap-3">
          <span className="w-4 shrink-0 text-xs tabular-nums text-[var(--text-muted)]">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm text-[var(--text-primary)]">{m.merchant}</span>
              <span className="shrink-0 text-sm font-medium tabular-nums text-[var(--text-primary)]">
                ${m.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full rounded-full bg-[var(--gridline)]">
              <div
                className="h-1.5 rounded-full bg-[var(--series-1)]"
                style={{ width: `${(m.total / maxTotal) * 100}%` }}
              />
            </div>
          </div>
          <span className="w-14 shrink-0 text-right text-xs text-[var(--text-muted)]">
            {m.count} txn{m.count === 1 ? "" : "s"}
          </span>
        </li>
      ))}
    </ul>
  );
}
