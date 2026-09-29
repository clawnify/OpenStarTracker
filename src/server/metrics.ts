// Every number the screens and widgets show, read through TRACKED so they all
// agree on which repos count. Aggregates are computed in SQL; the only thing
// done in code is carrying sparse daily rows forward into a continuous line.

import { get, query } from "./db.js";
import { daysBefore, today } from "./env.js";
import { carryForward, dayRange, totalSeries, type DayCount } from "./history.js";
import { TRACKED } from "./sync.js";

const TRACKED_NAMES = `SELECT r.full_name FROM ${TRACKED}`;

/** A repo's star count on or before `?`, the baseline for "gained since". */
const STARS_AT = `(SELECT d.stars FROM repo_daily d WHERE d.full_name = r.full_name AND d.day <= ? ORDER BY d.day DESC LIMIT 1)`;

/**
 * Stars gained since `?`: now minus the baseline. With no baseline the answer
 * is known only for a repo created after that day (it started at zero), and is
 * NULL otherwise, so the page shows a dash instead of inventing a number.
 */
const GAINED = `(r.stars - COALESCE(${STARS_AT}, CASE WHEN substr(r.created_at, 1, 10) > ? THEN 0 END))`;

export interface RepoRow {
  full_name: string;
  name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  is_fork: number;
  archived: number;
  hidden: number;
  stars: number;
  forks: number;
  open_issues: number;
  created_at: string | null;
  pushed_at: string | null;
  views_14d: number | null;
  view_uniques_14d: number | null;
  clones_14d: number | null;
  clone_uniques_14d: number | null;
  traffic_access: string | null;
  history_since: string | null;
  gained_7d: number | null;
  gained_30d: number | null;
}

const REPO_COLUMNS = `r.full_name, r.name, r.description, r.html_url, r.homepage, r.language, r.is_fork, r.archived,
  r.hidden, r.stars, r.forks, r.open_issues, r.created_at, r.pushed_at, r.views_14d, r.view_uniques_14d,
  r.clones_14d, r.clone_uniques_14d, r.traffic_access, r.history_since,
  ${GAINED} AS gained_7d, ${GAINED} AS gained_30d`;

function gainedParams(day: string): string[] {
  const w7 = daysBefore(day, 7);
  const w30 = daysBefore(day, 30);
  return [w7, w7, w30, w30];
}

export const SORTS = {
  stars: "r.stars DESC",
  gained_7d: "gained_7d IS NULL, gained_7d DESC, r.stars DESC",
  gained_30d: "gained_30d IS NULL, gained_30d DESC, r.stars DESC",
  views: "r.views_14d IS NULL, r.views_14d DESC, r.stars DESC",
  clones: "r.clones_14d IS NULL, r.clones_14d DESC, r.stars DESC",
  forks: "r.forks DESC, r.stars DESC",
  pushed: "r.pushed_at DESC",
  name: "r.name COLLATE NOCASE ASC",
} as const;
export type Sort = keyof typeof SORTS;

/**
 * One page of repos. `hidden` lists the ones the user hid instead of the
 * tracked ones, so they can be brought back.
 */
export async function repoPage(opts: { sort: Sort; search: string; limit: number; offset: number; hidden: boolean }) {
  const day = today();
  const from = opts.hidden
    ? TRACKED.replace("AND r.hidden = 0", "AND r.hidden = 1")
    : TRACKED;
  const like = `%${opts.search.trim()}%`;
  const filter = `AND (r.name LIKE ? OR COALESCE(r.description, '') LIKE ? OR COALESCE(r.language, '') LIKE ?)`;
  const [rows, total, sums] = await Promise.all([
    query<RepoRow>(
      `SELECT ${REPO_COLUMNS} FROM ${from} ${filter} ORDER BY ${SORTS[opts.sort]} LIMIT ? OFFSET ?`,
      [...gainedParams(day), like, like, like, opts.limit, opts.offset],
    ),
    get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${from} ${filter}`, [like, like, like]),
    // The footer aggregate covers every matching repo, not just this page.
    get<{ stars: number; forks: number; views: number | null; clones: number | null }>(
      `SELECT COALESCE(SUM(r.stars), 0) AS stars, COALESCE(SUM(r.forks), 0) AS forks,
              SUM(r.views_14d) AS views, SUM(r.clones_14d) AS clones FROM ${from} ${filter}`,
      [like, like, like],
    ),
  ]);
  const sparks = await sparklines(rows.map((r) => r.full_name), 30);
  return {
    repos: rows.map((r) => ({ ...r, spark: sparks.get(r.full_name) ?? [] })),
    total: Number(total?.n ?? 0),
    sums: { stars: sums?.stars ?? 0, forks: sums?.forks ?? 0, views: sums?.views ?? null, clones: sums?.clones ?? null },
  };
}

/** The last `days` days of stars for each repo, one query per chunk of names. */
async function sparklines(names: string[], days: number): Promise<Map<string, (number | null)[]>> {
  const out = new Map<string, (number | null)[]>();
  if (names.length === 0) return out;
  const day = today();
  const range = dayRange(daysBefore(day, days - 1), day);
  const rowsByRepo = new Map<string, DayCount[]>();
  // 80 names plus the date stays under D1's 100 bound parameters.
  for (let i = 0; i < names.length; i += 80) {
    const chunk = names.slice(i, i + 80);
    const marks = chunk.map(() => "?").join(", ");
    const rows = await query<{ full_name: string; day: string; stars: number }>(
      `SELECT d.full_name, d.day, d.stars FROM repo_daily d
        WHERE d.full_name IN (${marks})
          AND d.day >= COALESCE((SELECT MAX(x.day) FROM repo_daily x WHERE x.full_name = d.full_name AND x.day <= ?), ?)
        ORDER BY d.day`,
      [...chunk, range[0], range[0]],
    );
    for (const r of rows) {
      const list = rowsByRepo.get(r.full_name) ?? [];
      list.push({ day: r.day, stars: r.stars });
      rowsByRepo.set(r.full_name, list);
    }
  }
  for (const name of names) {
    out.set(name, carryForward(rowsByRepo.get(name) ?? [], range));
  }
  return out;
}

export const RANGES = { "30d": 30, "90d": 90, "1y": 365, all: 0 } as const;
export type Range = keyof typeof RANGES;

/** The account's total stars per day over `range`, oldest first. */
export async function starSeries(range: Range): Promise<{ day: string; stars: number }[]> {
  const day = today();
  let start: string;
  if (RANGES[range] === 0) {
    const first = await get<{ day: string | null }>(
      `SELECT MIN(day) AS day FROM repo_daily WHERE full_name IN (${TRACKED_NAMES})`,
    );
    start = first?.day ?? day;
  } else {
    start = daysBefore(day, RANGES[range] - 1);
  }
  const rows = await query<{ full_name: string; day: string; stars: number }>(
    `SELECT d.full_name, d.day, d.stars FROM repo_daily d
      WHERE d.full_name IN (${TRACKED_NAMES})
        AND d.day >= COALESCE((SELECT MAX(x.day) FROM repo_daily x WHERE x.full_name = d.full_name AND x.day <= ?), ?)
      ORDER BY d.day`,
    [start, start],
  );
  const byRepo = new Map<string, DayCount[]>();
  for (const r of rows) {
    const list = byRepo.get(r.full_name) ?? [];
    list.push({ day: r.day, stars: r.stars });
    byRepo.set(r.full_name, list);
  }
  const days = dayRange(start, day);
  const totals = totalSeries(byRepo, days);
  return days.map((d, i) => ({ day: d, stars: totals[i]! }));
}

export interface TrafficPoint {
  day: string;
  views: number;
  view_uniques: number;
  clones: number;
  clone_uniques: number;
}

/**
 * Views and clones per day since `from`, for the tracked repos or one repo.
 * Days before the first recorded traffic are left out rather than drawn as
 * zero: nobody was looking yet, so there is no number to show. After it, a day
 * GitHub did not list had no traffic, which is a real zero.
 */
export async function trafficSeries(from: string | null, repo?: string): Promise<TrafficPoint[]> {
  const scope = repo ? "full_name = ?" : `full_name IN (${TRACKED_NAMES})`;
  const params = repo ? [repo] : [];
  const rows = await query<TrafficPoint>(
    `SELECT day, SUM(views) AS views, SUM(view_uniques) AS view_uniques, SUM(clones) AS clones,
            SUM(clone_uniques) AS clone_uniques
       FROM traffic_daily WHERE ${scope} ${from ? "AND day >= ?" : ""} GROUP BY day ORDER BY day`,
    from ? [...params, from] : params,
  );
  if (rows.length === 0) return [];
  const byDay = new Map(rows.map((r) => [r.day, r]));
  // GitHub publishes traffic days late (often most of a week), so the series
  // ends on the last day it has reported, never today: the days in between are
  // not zero, they are not in yet.
  return dayRange(rows[0]!.day, rows[rows.length - 1]!.day).map(
    (d) => byDay.get(d) ?? { day: d, views: 0, view_uniques: 0, clones: 0, clone_uniques: 0 },
  );
}

/**
 * The latest top-10 capture of each repo, merged. GitHub reports each list
 * over the trailing 14 days, so this is "where visitors came from lately".
 */
export async function sources(kind: "referrer" | "path", limit: number, repo?: string) {
  const scope = repo ? "t.full_name = ?" : `t.full_name IN (${TRACKED_NAMES})`;
  return query<{ key: string; title: string | null; count: number; uniques: number; repos: number }>(
    `SELECT t.key, MAX(t.title) AS title, SUM(t.count) AS count, SUM(t.uniques) AS uniques,
            COUNT(DISTINCT t.full_name) AS repos
       FROM traffic_sources t
      WHERE t.kind = ? AND ${scope}
        AND t.captured_on = (SELECT MAX(x.captured_on) FROM traffic_sources x WHERE x.full_name = t.full_name)
      GROUP BY t.key ORDER BY count DESC LIMIT ?`,
    repo ? [kind, repo, limit] : [kind, limit],
  );
}

export async function totals() {
  const day = today();
  const row = await get<{
    repos: number;
    stars: number;
    forks: number;
    open_issues: number;
    gained_7d: number | null;
    gained_30d: number | null;
    views_14d: number | null;
    view_uniques_14d: number | null;
    clones_14d: number | null;
    clone_uniques_14d: number | null;
  }>(
    `SELECT COUNT(*) AS repos, COALESCE(SUM(r.stars), 0) AS stars, COALESCE(SUM(r.forks), 0) AS forks,
            COALESCE(SUM(r.open_issues), 0) AS open_issues,
            SUM(${GAINED}) AS gained_7d, SUM(${GAINED}) AS gained_30d,
            SUM(r.views_14d) AS views_14d, SUM(r.view_uniques_14d) AS view_uniques_14d,
            SUM(r.clones_14d) AS clones_14d, SUM(r.clone_uniques_14d) AS clone_uniques_14d
       FROM ${TRACKED}`,
    gainedParams(day),
  );
  return row!;
}

export async function movers(window: 7 | 30, limit: number) {
  const day = today();
  const col = window === 7 ? "gained_7d" : "gained_30d";
  return query<RepoRow>(
    `SELECT ${REPO_COLUMNS} FROM ${TRACKED} ORDER BY ${col} IS NULL, ${col} DESC, r.stars DESC LIMIT ?`,
    [...gainedParams(day), limit],
  );
}

export async function repoDetail(fullName: string) {
  const day = today();
  const repo = await get<RepoRow & { topics: string; listed_on: string | null; first_seen: string }>(
    `SELECT ${REPO_COLUMNS}, r.topics, r.listed_on, r.first_seen FROM repos r WHERE r.full_name = ?`,
    [...gainedParams(day), fullName],
  );
  if (!repo) return null;
  const rows = await query<{ day: string; stars: number; forks: number | null; open_issues: number | null }>(
    "SELECT day, stars, forks, open_issues FROM repo_daily WHERE full_name = ? ORDER BY day",
    [fullName],
  );
  const days = rows.length ? dayRange(rows[0]!.day, day) : [];
  const stars = carryForward(rows, days);
  const [trafficRows, referrers, paths] = await Promise.all([
    trafficSeries(null, fullName),
    sources("referrer", 10, fullName),
    sources("path", 10, fullName),
  ]);
  let topics: string[] = [];
  try {
    topics = JSON.parse(repo.topics);
  } catch {
    topics = [];
  }
  return {
    repo: { ...repo, topics },
    stars: days.map((d, i) => ({ day: d, stars: stars[i] ?? 0 })).filter((_, i) => stars[i] !== null),
    traffic: trafficRows,
    referrers,
    paths,
  };
}
