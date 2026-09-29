// Three chart shapes, in plain SVG: a sparkline, a line over time, and daily
// bars. One series each, so the card title names it and no legend is needed.
// Marks follow DESIGN.md: 1.5px sparklines with no axes, 2px lines, bars with
// rounded tops and a 2px gap. Every plotted chart has a hover tooltip and a
// visually hidden table, so no number is only reachable by pointing at it.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { longDay, num, shortDay } from "./format";

export type Series = "stars" | "views" | "clones";
const COLOR: Record<Series, string> = { stars: "var(--stars)", views: "var(--views)", clones: "var(--clones)" };

export function Sparkline({ values, series = "stars", label }: { values: (number | null)[]; series?: Series; label: string }) {
  const known = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null);
  const w = 80;
  const h = 24;
  if (known.length < 2) return <svg width={w} height={h} role="img" aria-label={`${label}: not enough history yet`} />;
  const min = Math.min(...known.map((p) => p[1]));
  const max = Math.max(...known.map((p) => p[1]));
  const span = max - min || 1;
  const d = known
    .map(([i, v], k) => `${k ? "L" : "M"}${((i / (values.length - 1)) * (w - 2) + 1).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`)
    .join(" ");
  const first = known[0]![1];
  const last = known[known.length - 1]![1];
  return (
    <svg width={w} height={h} role="img" aria-label={`${label}: ${num(first)} to ${num(last)}`} className="overflow-visible">
      <path d={d} fill="none" stroke={COLOR[series]} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Round numbers for an axis: 1, 2 or 5 times a power of ten. */
export function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

export function niceDomain(min: number, max: number, zero: boolean, ticks = 4): { lo: number; hi: number; step: number } {
  const lo0 = zero ? 0 : min;
  if (max <= lo0) return { lo: Math.max(0, lo0 - 1), hi: lo0 + 1, step: 1 };
  const step = Math.max(1, niceStep((max - lo0) / ticks));
  const lo = Math.max(0, Math.floor(lo0 / step) * step);
  const hi = Math.ceil(max / step) * step;
  return { lo, hi: hi === lo ? lo + step : hi, step };
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e!.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

const PAD = { top: 8, right: 8, bottom: 22, left: 44 };

interface Point {
  day: string;
  value: number;
}

function Frame({
  points,
  height,
  zero,
  caption,
  unit,
  children,
}: {
  points: Point[];
  height: number;
  zero: boolean;
  caption: string;
  unit: string;
  children: (g: { x: (i: number) => number; y: (v: number) => number; band: number; inner: { w: number; h: number } }) => ReactNode;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const values = points.map((p) => p.value);
  const { lo, hi, step } = niceDomain(Math.min(...values), Math.max(...values), zero);
  const inner = { w: Math.max(0, width - PAD.left - PAD.right), h: height - PAD.top - PAD.bottom };
  const band = points.length ? inner.w / points.length : 0;
  const x = (i: number) => PAD.left + band * i + band / 2;
  const y = (v: number) => PAD.top + inner.h - ((v - lo) / (hi - lo)) * inner.h;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(t);
  const labelIdx = points.length > 1 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : [0];

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - rect.left) / (band || 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  }

  const hp = hover !== null ? points[hover] : null;
  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg width={width} height={height} aria-hidden="true" className="block">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--rule)" />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tnum fill-muted text-[0.6875rem]">
                {num(t)}
              </text>
            </g>
          ))}
          {labelIdx.map((i, k) => (
            <text
              key={i}
              x={x(i)}
              y={height - 6}
              textAnchor={k === 0 && labelIdx.length > 1 ? "start" : k === labelIdx.length - 1 && labelIdx.length > 1 ? "end" : "middle"}
              className="fill-muted text-[0.6875rem]"
            >
              {shortDay(points[i]!.day)}
            </text>
          ))}
          {children({ x, y, band, inner })}
          {hp && hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + inner.h} stroke="var(--faint)" strokeDasharray="2 3" />
          )}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={inner.w}
            height={inner.h}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
      )}
      {hp && hover !== null && (
        <div
          className="floating pointer-events-none absolute z-10 rounded-sm bg-surface px-2.5 py-1.5 text-xs whitespace-nowrap"
          style={{
            left: Math.min(Math.max(x(hover), 70), width - 70),
            top: 0,
            transform: "translateX(-50%)",
          }}
        >
          <div className="text-muted">{longDay(hp.day)}</div>
          <div className="tnum font-semibold">
            {num(hp.value)} {unit}
          </div>
        </div>
      )}
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>{unit}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.day}>
              <td>{p.day}</td>
              <td>{p.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A cumulative count over time: a 2px line over a faint area. */
export function LineChart({ points, series, caption, unit, height = 220 }: { points: Point[]; series: Series; caption: string; unit: string; height?: number }) {
  if (points.length === 0) return null;
  return (
    <Frame points={points} height={height} zero={false} caption={caption} unit={unit}>
      {({ x, y, inner }) => {
        const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
        const base = PAD.top + inner.h;
        const area = `${line} L${x(points.length - 1).toFixed(1)},${base} L${x(0).toFixed(1)},${base} Z`;
        return (
          <>
            <path d={area} fill={COLOR[series]} opacity={0.1} />
            <path d={line} fill="none" stroke={COLOR[series]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          </>
        );
      }}
    </Frame>
  );
}

/** A count per day: bars from zero, rounded at the top, 2px apart. */
export function BarChart({ points, series, caption, unit, height = 200 }: { points: Point[]; series: Series; caption: string; unit: string; height?: number }) {
  if (points.length === 0) return null;
  return (
    <Frame points={points} height={height} zero caption={caption} unit={unit}>
      {({ x, y, band }) => {
        const w = Math.max(1, band - 2);
        const r = Math.min(4, w / 2);
        return points.map((p, i) => {
          if (p.value <= 0) return null;
          const top = y(p.value);
          const bottom = y(0);
          const h = Math.max(1, bottom - top);
          const left = x(i) - w / 2;
          const rr = Math.min(r, h);
          // Rounded top corners, square base anchored to the axis.
          const d = `M${left},${bottom} V${top + rr} Q${left},${top} ${left + rr},${top} H${left + w - rr} Q${left + w},${top} ${left + w},${top + rr} V${bottom} Z`;
          return <path key={p.day} d={d} fill={COLOR[series]} />;
        });
      }}
    </Frame>
  );
}
