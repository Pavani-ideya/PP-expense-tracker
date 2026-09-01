"use client";

import { useState } from "react";

interface Slice {
  category: string;
  total: number;
}

const CATEGORY_COLOR_VAR = [
  "--series-1",
  "--series-2",
  "--series-3",
  "--series-4",
  "--series-5",
  "--series-6",
  "--series-7",
  "--series-8",
];

const MAX_SLICES = 8;

export default function DonutChart({ data }: { data: Slice[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-[var(--text-secondary)]">
        No spending data yet
      </div>
    );
  }

  // Fold anything past the first 7 categories into "Other" so we never exceed the
  // 8-slot categorical palette.
  const sorted = [...data].sort((a, b) => b.total - a.total);
  const visible = sorted.slice(0, MAX_SLICES - 1);
  const rest = sorted.slice(MAX_SLICES - 1);
  const restTotal = rest.reduce((s, r) => s + r.total, 0);
  const slices = restTotal > 0 ? [...visible, { category: "Other", total: restTotal }] : visible;

  const total = slices.reduce((s, sl) => s + sl.total, 0);
  const radius = 80;
  const strokeWidth = 34;
  const circumference = 2 * Math.PI * radius;
  const gapPx = 2; // 2px surface gap between adjacent donut segments

  const cumulativeStarts = slices.reduce<number[]>((acc, slice, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + slices[i - 1].total);
    return acc;
  }, []);

  const arcs = slices.map((slice, i) => {
    const fraction = total > 0 ? slice.total / total : 0;
    const dash = Math.max(fraction * circumference - gapPx, 0);
    const gap = circumference - dash;
    const rotation = (cumulativeStarts[i] / total) * 360 - 90;
    return {
      ...slice,
      fraction,
      dash,
      gap,
      rotation,
      colorVar: CATEGORY_COLOR_VAR[i % CATEGORY_COLOR_VAR.length],
    };
  });

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-center">
      <div className="relative h-52 w-52 shrink-0">
        <svg viewBox="0 0 200 200" className="h-full w-full -rotate-0">
          {arcs.map((arc, i) => (
            <circle
              key={arc.category}
              cx="100"
              cy="100"
              r={radius}
              fill="none"
              stroke={`var(${arc.colorVar})`}
              strokeWidth={hoverIdx === i ? strokeWidth + 6 : strokeWidth}
              strokeDasharray={`${arc.dash} ${arc.gap}`}
              strokeLinecap="round"
              transform={`rotate(${arc.rotation} 100 100)`}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              className="cursor-pointer transition-[stroke-width]"
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {hoverIdx !== null ? (
            <>
              <span className="text-xs text-[var(--text-secondary)]">{arcs[hoverIdx].category}</span>
              <span className="text-lg font-semibold text-[var(--text-primary)]">
                ${arcs[hoverIdx].total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </>
          ) : (
            <>
              <span className="text-xs text-[var(--text-secondary)]">Total</span>
              <span className="text-lg font-semibold text-[var(--text-primary)]">
                ${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </>
          )}
        </div>
      </div>

      <ul className="flex flex-col gap-1.5 text-sm">
        {arcs.map((arc, i) => (
          <li
            key={arc.category}
            className="flex items-center gap-2 cursor-pointer rounded px-1.5 py-0.5 hover:bg-[var(--hover-wash)]"
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: `var(${arc.colorVar})` }}
            />
            <span className="text-[var(--text-primary)]">{arc.category}</span>
            <span className="ml-auto tabular-nums text-[var(--text-secondary)]">
              {((arc.fraction) * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
