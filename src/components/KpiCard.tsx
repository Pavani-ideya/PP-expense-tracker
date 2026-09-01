export default function KpiCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
        {value}
      </div>
      {sublabel && (
        <div className="mt-1 text-xs text-[var(--text-secondary)]">{sublabel}</div>
      )}
    </div>
  );
}
