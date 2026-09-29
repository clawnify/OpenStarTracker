// How numbers and dates read. Raw values stay raw everywhere else.

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en-US");

/** 1,234 below ten thousand, 12.3K above: exact where exactness is readable. */
export function num(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return Math.abs(n) >= 10_000 ? compact.format(n) : whole.format(n);
}

/** +12, −3, 0, or a dash when the value is unknown. */
export function delta(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n === 0) return "0";
  return `${n > 0 ? "+" : "−"}${num(Math.abs(n))}`;
}

export function shortDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function longDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "3 min ago", "yesterday", "in 5 h": for sync times, never for data. */
export function relative(iso: string | null, now = Date.now()): string {
  if (!iso) return "never";
  // SQLite's datetime('now') has no zone marker; it is UTC.
  const t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso.replace(" ", "T")}Z`);
  const s = Math.round((t - now) / 1000);
  const abs = Math.abs(s);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60) return s < 0 ? "just now" : "in a moment";
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86400), "day");
}
