// Three chart shapes, in plain SVG: a sparkline, a star history line, and
// daily bars. One series each, so the card title names it and no legend is
// needed. Sparklines are a 1.5px line with no axes; bars have rounded tops and
// a 2px gap. The star history is a red line sketched by hand on hand-drawn
// axes, with no grid and no fill. Every plotted chart has a hover
// tooltip and a visually hidden table, so no number is only reachable by
// pointing at it.

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { axisLabels, longDay, num, shortDay } from "./format";

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

const DAY_MS = 86_400_000;
const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`);
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const monthName = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });

/**
 * Calendar ticks for a run of days drawn `width` pixels wide: years when it
 * spans more than two, months (the year printed on January) when it spans more
 * than three, otherwise days, each spaced so its labels never touch. A span
 * with no tick that fits falls back to its two ends, so the axis is never blank
 * and never drops the year.
 */
export function timeTicks(first: string, last: string, width: number): { day: string; label: string }[] {
  const a = dayMs(first);
  const b = dayMs(last);
  const span = (b - a) / DAY_MS;
  const out: { day: string; label: string }[] = [];
  const start = new Date(a);
  // "2024" and "Mar" are narrow; "Oct 16" needs more room.
  const max = Math.max(2, Math.floor(width / (span > 90 ? 60 : 100)));
  if (span > 730) {
    const step = [1, 2, 5, 10].find((s) => span / 365 / s <= max) ?? 10;
    const y0 = start.getUTCFullYear() + (start.getUTCMonth() === 0 && start.getUTCDate() === 1 ? 0 : 1);
    for (let y = y0; Date.UTC(y, 0, 1) <= b; y++) {
      if (y % step === 0) out.push({ day: isoDay(Date.UTC(y, 0, 1)), label: String(y) });
    }
  } else if (span > 90) {
    const step = [1, 2, 3, 6].find((s) => span / 30.44 / s <= max) ?? 6;
    for (let m = start.getUTCMonth() + (start.getUTCDate() === 1 ? 0 : 1); ; m++) {
      const t = Date.UTC(start.getUTCFullYear(), m, 1);
      if (t > b) break;
      const month = new Date(t).getUTCMonth();
      if (month % step === 0) out.push({ day: isoDay(t), label: month === 0 ? String(new Date(t).getUTCFullYear()) : monthName(t) });
    }
  } else if (span > 0) {
    const step = [1, 2, 7, 14].find((s) => span / s <= max) ?? 14;
    for (let t = a; t <= b; t += step * DAY_MS) out.push({ day: isoDay(t), label: shortDay(isoDay(t)) });
  }
  if (out.length >= 2) return out;
  const end = (day: string) => ({ day, label: span > 90 ? `${monthName(dayMs(day))} ${day.slice(0, 4)}` : shortDay(day) });
  return first === last ? [end(first)] : [end(first), end(last)];
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

interface Point {
  day: string;
  value: number;
}

function Tooltip({ point, unit, x, width }: { point: Point; unit: string; x: number; width: number }) {
  return (
    <div
      className="floating pointer-events-none absolute z-10 rounded-sm bg-surface px-2.5 py-1.5 text-xs whitespace-nowrap"
      style={{ left: Math.min(Math.max(x, 70), width - 70), top: 0, transform: "translateX(-50%)" }}
    >
      <div className="text-muted">{longDay(point.day)}</div>
      <div className="tnum font-semibold">
        {num(point.value)} {unit}
      </div>
    </div>
  );
}

function DataTable({ points, caption, unit }: { points: Point[]; caption: string; unit: string }) {
  return (
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
  );
}

const PAD = { top: 8, right: 8, bottom: 22, left: 44 };

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
      {hp && hover !== null && <Tooltip point={hp} unit={unit} x={x(hover)} width={width} />}
      <DataTable points={points} caption={caption} unit={unit} />
    </div>
  );
}

const SKETCH_PAD = { top: 12, right: 16, bottom: 30, left: 52 };

/**
 * At most `max` evenly spaced indexes out of `n`, always the first and the
 * last. A daily line over five years is ~1,800 one-pixel steps; drawn through
 * the sketch filter every step frays, so the line is drawn through a sample.
 */
export function sample(n: number, max: number): number[] {
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const out: number[] = [];
  for (let k = 0; k < max; k++) out.push(Math.round((k * (n - 1)) / (max - 1)));
  return out;
}

/**
 * A curve through the midpoints, each point a quadratic control. It stays
 * inside its points' hull, so a count that never falls is never drawn falling.
 */
function smoothPath(p: (readonly [number, number])[]): string {
  const f = (n: number) => n.toFixed(1);
  if (p.length < 3) return p.map(([x, y], i) => `${i ? "L" : "M"}${f(x)},${f(y)}`).join(" ");
  let d = `M${f(p[0]![0])},${f(p[0]![1])}`;
  for (let i = 1; i < p.length - 1; i++) {
    const [x, y] = p[i]!;
    const [nx, ny] = p[i + 1]!;
    d += ` Q${f(x)},${f(y)} ${f((x + nx) / 2)},${f((y + ny) / 2)}`;
  }
  const [lx, ly] = p[p.length - 1]!;
  return `${d} L${f(lx)},${f(ly)}`;
}

/**
 * A cumulative count over time, sketched: a 3px line and ink axes, both run
 * through a turbulence filter so they read as drawn by hand. Text stays in the
 * app's type and is never filtered.
 */
export function LineChart({ points, series, caption, unit, height = 280 }: { points: Point[]; series: Series; caption: string; unit: string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const sketch = `sketch-${useId().replace(/[^\w-]/g, "")}`;
  if (points.length === 0) return null;

  const P = SKETCH_PAD;
  const values = points.map((p) => p.value);
  const { lo, hi, step } = niceDomain(Math.min(...values), Math.max(...values), false);
  const inner = { w: Math.max(0, width - P.left - P.right), h: height - P.top - P.bottom };
  const base = P.top + inner.h;
  const last = points.length - 1;
  const x = (i: number) => P.left + (last ? (i / last) * inner.w : inner.w / 2);
  const y = (v: number) => base - ((v - lo) / (hi - lo)) * inner.h;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(t);
  const labels = axisLabels(ticks);
  const first = dayMs(points[0]!.day);
  const days = timeTicks(points[0]!.day, points[last]!.day, inner.w).map((d) => ({ ...d, x: x((dayMs(d.day) - first) / DAY_MS) }));
  const line = smoothPath(sample(points.length, Math.max(2, Math.floor(inner.w / 8))).map((i) => [x(i), y(points[i]!.value)] as const));

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - rect.left) / (rect.width || 1)) * last);
    setHover(Math.max(0, Math.min(last, i)));
  }

  const hp = hover !== null ? points[hover] : null;
  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg width={width} height={height} aria-hidden="true" className="block">
          <defs>
            <filter id={sketch} filterUnits="userSpaceOnUse" x={-5} y={-5} width={width + 10} height={height + 10}>
              <feTurbulence type="fractalNoise" baseFrequency={0.05} result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale={5} xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </defs>
          <g stroke="var(--foreground)" strokeWidth={3} strokeLinecap="round" fill="none" filter={`url(#${sketch})`}>
            <path d={`M${P.left},${P.top - 4} V${base} H${P.left + inner.w + 4}`} strokeLinejoin="round" />
            {ticks.map((t) => (
              <path key={t} d={`M${P.left - 5},${y(t)} H${P.left}`} />
            ))}
            {days.map((d) => (
              <path key={d.day} d={`M${d.x},${base} V${base + 5}`} />
            ))}
          </g>
          {ticks.map((t, i) => (
            <text key={t} x={P.left - 10} y={y(t)} dy="0.32em" textAnchor="end" className="tnum fill-muted text-xs">
              {labels[i]}
            </text>
          ))}
          {days.map((d) => (
            // A label near the right edge ends at its tick instead of overflowing.
            <text key={d.day} x={d.x} y={base + 20} textAnchor={d.x > width - 32 ? "end" : "middle"} className="fill-muted text-xs">
              {d.label}
            </text>
          ))}
          <path
            d={line}
            fill="none"
            stroke={COLOR[series]}
            strokeWidth={3}
            strokeLinejoin="round"
            strokeLinecap="round"
            filter={`url(#${sketch})`}
          />
          {hp && hover !== null && (
            <>
              <line x1={x(hover)} x2={x(hover)} y1={P.top} y2={base} stroke="var(--faint)" strokeDasharray="2 3" />
              <circle cx={x(hover)} cy={y(hp.value)} r={4.5} fill={COLOR[series]} stroke="var(--surface)" strokeWidth={2} />
            </>
          )}
          <rect
            x={P.left}
            y={P.top}
            width={inner.w}
            height={inner.h}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
      )}
      {hp && hover !== null && <Tooltip point={hp} unit={unit} x={x(hover)} width={width} />}
      <DataTable points={points} caption={caption} unit={unit} />
    </div>
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
