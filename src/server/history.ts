// Pure arithmetic over counters: rebuilding a star curve from stargazer
// timestamps, and turning sparse per-day rows into a continuous series. No I/O,
// so every rule here is covered by history.test.ts.

import { daysBefore } from "./env.js";

export interface DayCount {
  day: string;
  stars: number;
}

/**
 * The star count at the end of each day on which stars arrived, rebuilt from
 * the most recent stargazers.
 *
 * Works backwards from `current`, the count GitHub reports today: the total at
 * the end of day D is `current` minus every star given after D. That makes a
 * partial read useful. Reading only the newest N stars still gives a correct
 * curve for the period they cover, and `since` says where that period starts.
 *
 * When `complete` (every stargazer was read) the curve also gains a zero on the
 * day before the first star, so it starts from nothing rather than mid-air.
 * Unstars are invisible to the stargazer list, so the rebuilt curve is the
 * history of the people who still star the repo. The daily snapshot is exact
 * from the day tracking starts.
 */
export function rebuildStars(
  current: number,
  starredAt: string[],
  complete: boolean,
): { rows: DayCount[]; since: string | null } {
  if (starredAt.length === 0) return { rows: [], since: null };

  const perDay = new Map<string, number>();
  for (const at of starredAt) {
    const day = at.slice(0, 10);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  const days = [...perDay.keys()].sort().reverse();

  const rows: DayCount[] = [];
  let after = 0; // stars given after the day being written
  for (const day of days) {
    rows.push({ day, stars: Math.max(0, current - after) });
    after += perDay.get(day)!;
  }
  const first = days[days.length - 1]!;
  if (complete) {
    const before = daysBefore(first, 1);
    rows.push({ day: before, stars: Math.max(0, current - after) });
    return { rows: rows.reverse(), since: before };
  }
  return { rows: rows.reverse(), since: first };
}

/** Every UTC day from `from` to `to`, inclusive, oldest first. */
export function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`).getTime();
  while (d.getTime() <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/**
 * A continuous daily series from sparse rows: each day takes the latest value
 * on or before it. Days before the first known value are null, because a repo
 * with no history yet has an unknown count, not zero.
 *
 * `rows` must be sorted by day; values before `days[0]` seed the carry.
 */
export function carryForward(rows: DayCount[], days: string[]): (number | null)[] {
  const out: (number | null)[] = [];
  let i = 0;
  let last: number | null = null;
  for (const day of days) {
    while (i < rows.length && rows[i]!.day <= day) last = rows[i++]!.stars;
    out.push(last);
  }
  return out;
}

/**
 * The account-wide total per day: every repo's carried-forward count, summed.
 * A repo contributes nothing on the days before its history begins, which is
 * what makes a newly added repo appear as a step rather than bending the past.
 */
export function totalSeries(byRepo: Map<string, DayCount[]>, days: string[]): number[] {
  const total = days.map(() => 0);
  for (const rows of byRepo.values()) {
    carryForward(rows, days).forEach((v, i) => {
      if (v !== null) total[i]! += v;
    });
  }
  return total;
}

/**
 * Stars gained over the window ending today: today's count minus the count
 * `days` days ago. When there is no history that far back the answer is known
 * only if the repo did not exist yet then (it started from zero); otherwise it
 * is unknown, and the caller shows a dash rather than a made-up number.
 */
export function gained(
  now: number,
  before: number | null,
  createdAt: string | null,
  windowStart: string,
): number | null {
  if (before !== null) return now - before;
  if (createdAt && createdAt.slice(0, 10) > windowStart) return now;
  return null;
}
