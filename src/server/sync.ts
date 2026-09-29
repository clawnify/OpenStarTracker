// Reading GitHub into the database, one bounded step at a time.
//
// A step does two things. Once per UTC day it lists the account's repos and
// writes today's counters for all of them (one call per 100 repos). Then it
// reads the detail (traffic, and star history the first time) for the next
// BATCH tracked repos that have not had it today. The caller repeats steps
// until `remaining` is zero: the Refresh button loops in the browser, and the
// daily queue job books its own continuation. Bounding the step keeps any
// single request small whatever the size of the account, and gives the page a
// real progress count instead of a spinner.

import { get, query, run } from "./db.js";
import { today, type Bindings } from "./env.js";
import {
  github,
  GitHubError,
  listRepos,
  starHistory,
  traffic,
  type GitHub,
  type Repo,
} from "./github.js";
import { rebuildStars, weeksToDays } from "./history.js";
import { insertMany } from "./sql.js";

/** Repos whose detail one step reads. */
const BATCH = 10;
/** Repos read at once inside a step. */
const PARALLEL = 3;
export interface Settings {
  owner: string;
  owner_type: string;
  owner_avatar: string | null;
  include_forks: number;
  include_archived: number;
  listed_on: string | null;
}

export async function settings(): Promise<Settings | null> {
  return (
    (await get<Settings>(
      "SELECT owner, owner_type, owner_avatar, include_forks, include_archived, listed_on FROM settings WHERE id = 1",
    )) ?? null
  );
}

/**
 * The repos the app reports on, as a FROM/WHERE fragment aliased `r`: owned by
 * the tracked account, still listed by GitHub, not hidden, and a fork or
 * archived repo only when the settings say so. Every view reads through this,
 * so "tracked" means one thing everywhere.
 */
export const TRACKED = `repos r JOIN settings s ON s.id = 1
  WHERE r.full_name LIKE s.owner || '/%'
    AND r.listed_on = s.listed_on
    AND r.hidden = 0
    AND (r.is_fork = 0 OR s.include_forks = 1)
    AND (r.archived = 0 OR s.include_archived = 1)`;

export interface StepResult {
  status: "ok" | "partial" | "failed";
  listed: number | null;
  processed: number;
  remaining: number;
  apiCalls: number;
  errors: string[];
}

export async function syncInFlight(): Promise<{ id: string; started_at: string } | null> {
  // A step that died without recording its end still reads as running, so
  // anything older than a few minutes no longer blocks the next one.
  return (
    (await get<{ id: string; started_at: string }>(
      `SELECT id, started_at FROM sync_runs
        WHERE status = 'running' AND started_at > datetime('now', '-3 minutes')
        ORDER BY started_at DESC LIMIT 1`,
    )) ?? null
  );
}

export async function pending(): Promise<number> {
  const row = await get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM ${TRACKED} AND (r.detail_synced_on IS NULL OR r.detail_synced_on < ?)`,
    [today()],
  );
  return Number(row?.n ?? 0);
}

export async function syncStep(env: Bindings, trigger: "manual" | "schedule"): Promise<StepResult> {
  const s = await settings();
  if (!s) {
    return { status: "failed", listed: null, processed: 0, remaining: 0, apiCalls: 0, errors: ["Choose a GitHub account to track first."] };
  }

  const id = crypto.randomUUID();
  await run("INSERT INTO sync_runs (id, trigger) VALUES (?, ?)", [id, trigger]);
  const gh = github(env.GITHUB_TOKEN);
  const errors: string[] = [];
  const day = today();
  let listed: number | null = null;
  let processed = 0;

  try {
    if (s.listed_on !== day) {
      const repos = await listRepos(gh, s.owner);
      await recordListing(repos, day);
      await prune(day);
      listed = repos.length;
    }

    const batch = await query<{ full_name: string; stars: number; history_backfilled: number }>(
      `SELECT r.full_name, r.stars, r.history_backfilled FROM ${TRACKED}
          AND (r.detail_synced_on IS NULL OR r.detail_synced_on < ?)
        ORDER BY r.stars DESC, r.full_name LIMIT ?`,
      [day, BATCH],
    );

    for (let i = 0; i < batch.length; i += PARALLEL) {
      const results = await Promise.allSettled(batch.slice(i, i + PARALLEL).map((r) => readDetail(gh, r, day)));
      for (const res of results) {
        if (res.status === "fulfilled") {
          processed++;
          errors.push(...res.value);
        } else errors.push(res.reason instanceof Error ? res.reason.message : String(res.reason));
      }
      // The hourly budget is shared by every repo in the account. Once GitHub
      // says it is spent, the rest of the batch would only collect the same
      // refusal, so the step stops and the next run picks up from here.
      if (results.some((r) => r.status === "rejected" && r.reason instanceof GitHubError && r.reason.resetAt)) break;
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  const status: StepResult["status"] = errors.length === 0 ? "ok" : processed > 0 || listed !== null ? "partial" : "failed";
  await run(
    `UPDATE sync_runs SET finished_at = datetime('now'), status = ?, repos = ?, api_calls = ?, error = ? WHERE id = ?`,
    [status, processed, gh.calls, errors.length ? [...new Set(errors)].slice(0, 3).join(" | ") : null, id],
  );
  return { status, listed, processed, remaining: await pending(), apiCalls: gh.calls, errors: [...new Set(errors)] };
}

/** Upsert what the list said about every repo, and write today's counters. */
async function recordListing(repos: Repo[], day: string): Promise<void> {
  await insertMany(
    "repos",
    ["full_name", "name", "description", "html_url", "homepage", "language", "topics", "is_fork", "archived",
      "stars", "forks", "open_issues", "created_at", "pushed_at", "listed_on"],
    repos.map((r) => [
      r.full_name, r.name, r.description, r.html_url, r.homepage || null, r.language, JSON.stringify(r.topics ?? []),
      r.fork ? 1 : 0, r.archived ? 1 : 0, r.stargazers_count, r.forks_count, r.open_issues_count, r.created_at,
      r.pushed_at, day,
    ]),
    `ON CONFLICT (full_name) DO UPDATE SET name = excluded.name, description = excluded.description,
       html_url = excluded.html_url, homepage = excluded.homepage, language = excluded.language,
       topics = excluded.topics, is_fork = excluded.is_fork, archived = excluded.archived, stars = excluded.stars,
       forks = excluded.forks, open_issues = excluded.open_issues, created_at = excluded.created_at,
       pushed_at = excluded.pushed_at, listed_on = excluded.listed_on`,
  );
  await insertMany(
    "repo_daily",
    ["full_name", "day", "stars", "forks", "open_issues", "source"],
    repos.map((r) => [r.full_name, day, r.stargazers_count, r.forks_count, r.open_issues_count, "snapshot"]),
    `ON CONFLICT (full_name, day) DO UPDATE SET stars = excluded.stars, forks = excluded.forks,
       open_issues = excluded.open_issues, source = 'snapshot'`,
  );
  // Written last: a listing that failed halfway leaves the old day in place,
  // so no repo drops out of the views because the write never finished.
  await run("UPDATE settings SET listed_on = ? WHERE id = 1", [day]);
}

/**
 * Keep the tables proportional to what anyone reads. A referrer capture covers
 * 14 days, so past a month one capture a week (Mondays) keeps the whole story
 * at a seventh of the rows; runs are only useful while they are recent.
 */
async function prune(day: string): Promise<void> {
  await run(
    `DELETE FROM traffic_sources WHERE captured_on < date(?, '-30 days') AND strftime('%w', captured_on) <> '1'`,
    [day],
  );
  await run(`DELETE FROM sync_runs WHERE started_at < datetime('now', '-90 days')`);
}

/**
 * Traffic and star history for one repo, each on its own. A part GitHub
 * refuses (a permission this token lacks) is reported and skipped, and the repo
 * still counts as read today, so one refusal can never stall the whole sync.
 * Only a spent rate limit is thrown, which stops the step: every other repo
 * would get the same answer until the reset.
 */
async function readDetail(
  gh: GitHub,
  repo: { full_name: string; stars: number; history_backfilled: number },
  day: string,
): Promise<string[]> {
  const soft: string[] = [];
  const attempt = async (what: string, part: () => Promise<void>) => {
    try {
      await part();
    } catch (err) {
      if (err instanceof GitHubError && err.resetAt) throw err;
      soft.push(`${repo.full_name} ${what}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  if (gh.authenticated) await attempt("traffic", () => readTraffic(gh, repo.full_name, day));
  if (!repo.history_backfilled) await attempt("star history", () => backfillStars(gh, repo.full_name, repo.stars));
  await run("UPDATE repos SET detail_synced_on = ? WHERE full_name = ?", [day, repo.full_name]);
  return soft;
}

async function readTraffic(gh: GitHub, fullName: string, day: string): Promise<void> {
  let t;
  try {
    t = await traffic(gh, fullName);
  } catch (err) {
    // 403/404 here means this token cannot see the repo's traffic (it needs
    // write access). That is a fact about the token, not a failed sync.
    if (err instanceof GitHubError && !err.resetAt && (err.status === 403 || err.status === 404)) {
      await run("UPDATE repos SET traffic_access = 'denied' WHERE full_name = ?", [fullName]);
      return;
    }
    throw err;
  }

  const byDay = new Map<string, [number, number, number, number]>();
  for (const v of t.views.views ?? []) byDay.set(v.timestamp.slice(0, 10), [v.count, v.uniques, 0, 0]);
  for (const c of t.clones.clones ?? []) {
    const d = c.timestamp.slice(0, 10);
    const row = byDay.get(d) ?? [0, 0, 0, 0];
    row[2] = c.count;
    row[3] = c.uniques;
    byDay.set(d, row);
  }
  await insertMany(
    "traffic_daily",
    ["full_name", "day", "views", "view_uniques", "clones", "clone_uniques"],
    [...byDay].map(([d, v]) => [fullName, d, ...v]),
    `ON CONFLICT (full_name, day) DO UPDATE SET views = excluded.views, view_uniques = excluded.view_uniques,
       clones = excluded.clones, clone_uniques = excluded.clone_uniques`,
  );

  await run("DELETE FROM traffic_sources WHERE full_name = ? AND captured_on = ?", [fullName, day]);
  await insertMany(
    "traffic_sources",
    ["full_name", "captured_on", "kind", "key", "title", "count", "uniques"],
    [
      ...t.referrers.map((r) => [fullName, day, "referrer", r.referrer, null, r.count, r.uniques]),
      ...t.paths.map((p) => [fullName, day, "path", p.path, p.title, p.count, p.uniques]),
    ],
  );

  await run(
    `UPDATE repos SET traffic_access = 'ok', views_14d = ?, view_uniques_14d = ?, clones_14d = ?, clone_uniques_14d = ?
      WHERE full_name = ?`,
    [t.views.count, t.views.uniques, t.clones.count, t.clones.uniques, fullName],
  );
}

/**
 * Rebuild the star curve once, from GitHub's weekly star history. Anchored to
 * today's count, so an incomplete history still ends at the right number. If
 * GitHub refuses (it answers 422 for some repos), this throws, the repo is
 * left unbackfilled, and the next day's sync tries again.
 */
async function backfillStars(gh: GitHub, fullName: string, stars: number): Promise<void> {
  if (stars === 0) {
    await run("UPDATE repos SET history_backfilled = 1, history_since = NULL WHERE full_name = ?", [fullName]);
    return;
  }
  const { weeks, complete } = await starHistory(gh, fullName);
  const { rows, since } = rebuildStars(stars, weeksToDays(weeks), complete);
  await insertMany(
    "repo_daily",
    ["full_name", "day", "stars", "source"],
    rows.map((r) => [fullName, r.day, r.stars, "backfill"]),
    // A snapshot is what GitHub actually said that day; it is never overwritten.
    "ON CONFLICT (full_name, day) DO NOTHING",
  );
  await run("UPDATE repos SET history_backfilled = 1, history_since = ? WHERE full_name = ?", [since, fullName]);
}
