"use client";

import { useState } from "react";

interface Point {
  month: string;
  total: number;
}

function formatMonth(m: string) {
  const [y, mo] = m.split("-");
  const d = new Date(parseInt(y, 10), parseInt(mo, 10) - 1, 1);
  return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

export default function TrendChart({ data }: { data: Point[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-[var(--text-secondary)]">
        No spending data yet
      </div>
    );
  }

  const width = 600;
  const height = 220;
  const padding = { top: 16, right: 16, bottom: 28, left: 48 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const maxVal = Math.max(...data.map((d) => d.total), 1);
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;

  const points = data.map((d, i) => {
    const x = padding.left + (data.length > 1 ? i * stepX : innerW / 2);
    const y = padding.top + innerH - (d.total / maxVal) * innerH;
    return { ...d, x, y };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + innerH} L ${points[0].x} ${padding.top + innerH} Z`;

  // Gridlines at 0%, 50%, 100% of max
  const gridLines = [0, 0.5, 1].map((f) => padding.top + innerH - f * innerH);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        {gridLines.map((y, i) => (
          <line
            key={i}
            x1={padding.left}
            x2={width - padding.right}
            y1={y}
            y2={y}
            stroke="var(--gridline)"
            strokeWidth={1}
          />
        ))}

        <path d={areaPath} fill="var(--series-1)" opacity={0.12} />
        <path d={linePath} fill="none" stroke="var(--series-1)" strokeWidth={2} />

        {points.map((p, i) => (
          <g key={p.month}>
            <circle
              cx={p.x}
              cy={p.y}
              r={hoverIdx === i ? 6 : 4}
              fill="var(--series-1)"
              stroke="var(--surface-1)"
              strokeWidth={2}
              className="cursor-pointer transition-[r]"
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
            />
            <rect
              x={p.x - stepX / 2}
              y={padding.top}
              width={data.length > 1 ? stepX : innerW}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              className="cursor-pointer"
            />
            <text
              x={p.x}
              y={height - 8}
              textAnchor="middle"
              fontSize={11}
              fill="var(--text-muted)"
            >
              {formatMonth(p.month)}
            </text>
          </g>
        ))}
      </svg>

      {hoverIdx !== null && (
        <div
          className="pointer-events-none absolute rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1.5 text-xs shadow-sm"
          style={{
            left: `${(points[hoverIdx].x / width) * 100}%`,
            top: `${(points[hoverIdx].y / height) * 100}%`,
            transform: "translate(-50%, -130%)",
          }}
        >
          <div className="text-[var(--text-secondary)]">{formatMonth(points[hoverIdx].month)}</div>
          <div className="font-semibold text-[var(--text-primary)]">
            ${points[hoverIdx].total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
      )}
    </div>
  );
}
