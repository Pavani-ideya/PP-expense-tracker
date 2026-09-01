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

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

// Builds an SVG path for a pie wedge from startAngle to endAngle (degrees, 0 = top,
// clockwise). A full 360° slice is drawn as two half-circle arcs since a single arc
// command can't sweep a complete circle.
function wedgePath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const span = endAngle - startAngle;
  if (span >= 359.99) {
    const mid = startAngle + 180;
    const p1 = polarToCartesian(cx, cy, r, startAngle);
    const pMid = polarToCartesian(cx, cy, r, mid);
    return `M ${cx} ${cy} L ${p1.x} ${p1.y} A ${r} ${r} 0 1 1 ${pMid.x} ${pMid.y} A ${r} ${r} 0 1 1 ${p1.x} ${p1.y} Z`;
  }
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = span > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
}

export default function PieChart({ data }: { data: Slice[] }) {
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
  const radius = 90;
  const labelRadius = radius * 0.68;
  const cx = 100;
  const cy = 100;

  const cumulativeStarts = slices.reduce<number[]>((acc, slice, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + slices[i - 1].total);
    return acc;
  }, []);

  const arcs = slices.map((slice, i) => {
    const fraction = total > 0 ? slice.total / total : 0;
    const startAngle = total > 0 ? (cumulativeStarts[i] / total) * 360 : 0;
    const endAngle = startAngle + fraction * 360;
    const midAngle = (startAngle + endAngle) / 2;
    const labelPos = polarToCartesian(cx, cy, labelRadius, midAngle);
    return {
      ...slice,
      fraction,
      path: wedgePath(cx, cy, radius, startAngle, endAngle),
      labelPos,
      colorVar: CATEGORY_COLOR_VAR[i % CATEGORY_COLOR_VAR.length],
    };
  });

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-center">
      <div className="relative h-56 w-56 shrink-0">
        <svg viewBox="0 0 200 200" className="h-full w-full">
          {arcs.map((arc, i) => (
            <path
              key={arc.category}
              d={arc.path}
              fill={`var(${arc.colorVar})`}
              stroke="var(--page-plane)"
              strokeWidth={hoverIdx === i ? 0 : 2}
              opacity={hoverIdx === null || hoverIdx === i ? 1 : 0.55}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              className="cursor-pointer transition-opacity"
            />
          ))}
          {arcs
            .filter((arc) => arc.fraction >= 0.06)
            .map((arc) => (
              <text
                key={`label-${arc.category}`}
                x={arc.labelPos.x}
                y={arc.labelPos.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="pointer-events-none select-none"
                style={{ fill: "var(--surface-1)", fontSize: 10, fontWeight: 600 }}
              >
                {(arc.fraction * 100).toFixed(0)}%
              </text>
            ))}
        </svg>
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
              ${arc.total.toLocaleString(undefined, { maximumFractionDigits: 0 })} (
              {(arc.fraction * 100).toFixed(0)}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
