-- The DDL the deploy applies. `clawnify deploy` reconciles THIS file and
-- nothing else, and reconciliation is additive: it adds missing columns and
-- never drops anything, so editing this file in place is safe against a live
-- database. Template repos carry no migrations/ folder: migrations are per
-- deployed instance, tracked in each app's own D1.
--
-- LOCAL DEVELOPMENT DOES NOT RECONCILE. `clawnify dev` runs this file as-is,
-- and every CREATE below is IF NOT EXISTS, so adding a column to a table you
-- have already created locally is a silent no-op. Delete
-- .clawnify/.wrangler/state/v3/d1 and restart to pick the change up.
--
-- One deployment tracks one GitHub account (a user or an organisation). The
-- database belongs to the org that deployed the app, so rows carry no org id.
--
-- Why this app keeps anything at all: GitHub's traffic numbers (views, clones,
-- referrers, popular pages) only ever cover the last 14 days, and star counts
-- are a single number with no history. Everything older than two weeks exists
-- only because a daily sync wrote it down here.

-- What to track. A single row.
CREATE TABLE IF NOT EXISTS settings (
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  owner            TEXT NOT NULL,                     -- GitHub login, as GitHub spells it
  owner_type       TEXT NOT NULL DEFAULT 'Organization', -- 'User' | 'Organization'
  owner_avatar     TEXT,
  include_forks    INTEGER NOT NULL DEFAULT 0,
  include_archived INTEGER NOT NULL DEFAULT 0,
  listed_on        TEXT,                              -- UTC day the repo list was last read
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Every public repository the owner has, whether or not it is tracked.
-- `hidden` is the user's choice. A repo whose `listed_on` is older than the
-- settings row's has left GitHub's list (deleted, renamed, or made private):
-- it drops out of every view and its history is kept.
CREATE TABLE IF NOT EXISTS repos (
  full_name           TEXT PRIMARY KEY,               -- owner/name
  name                TEXT NOT NULL,
  description         TEXT,
  html_url            TEXT NOT NULL,
  homepage            TEXT,
  language            TEXT,
  topics              TEXT NOT NULL DEFAULT '[]',     -- JSON array
  is_fork             INTEGER NOT NULL DEFAULT 0,
  archived            INTEGER NOT NULL DEFAULT 0,
  hidden              INTEGER NOT NULL DEFAULT 0,
  listed_on           TEXT,                           -- UTC day GitHub last listed it
  stars               INTEGER NOT NULL DEFAULT 0,
  forks               INTEGER NOT NULL DEFAULT 0,
  open_issues         INTEGER NOT NULL DEFAULT 0,     -- GitHub counts open pull requests here too
  created_at          TEXT,
  pushed_at           TEXT,
  first_seen          TEXT NOT NULL DEFAULT (datetime('now')),
  -- The 14-day totals exactly as GitHub reports them. Unique visitors cannot
  -- be summed across days, so these are the only honest two-week uniques.
  views_14d           INTEGER,
  view_uniques_14d    INTEGER,
  clones_14d          INTEGER,
  clone_uniques_14d   INTEGER,
  traffic_access      TEXT,                           -- 'ok' | 'denied' | null (never tried)
  detail_synced_on    TEXT,                           -- UTC day traffic was last read
  -- Star history is rebuilt once from GitHub's weekly star history.
  -- `history_since` is the first day it covers, the day before the first star.
  history_backfilled  INTEGER NOT NULL DEFAULT 0,
  history_since       TEXT
);

-- Cumulative counters per repo per day. A 'snapshot' row is what the daily
-- sync saw; a 'backfill' row was rebuilt from GitHub's star history and only
-- knows stars. A snapshot always wins over a backfill for the same day.
CREATE TABLE IF NOT EXISTS repo_daily (
  full_name   TEXT NOT NULL,
  day         TEXT NOT NULL,                          -- YYYY-MM-DD, UTC
  stars       INTEGER NOT NULL,
  forks       INTEGER,
  open_issues INTEGER,
  source      TEXT NOT NULL DEFAULT 'snapshot',       -- 'snapshot' | 'backfill'
  PRIMARY KEY (full_name, day)
);

-- Views and clones per repo per day, straight from GitHub's daily breakdown.
-- Each sync rewrites the last 14 days, because GitHub revises the latest ones.
CREATE TABLE IF NOT EXISTS traffic_daily (
  full_name     TEXT NOT NULL,
  day           TEXT NOT NULL,
  views         INTEGER NOT NULL DEFAULT 0,
  view_uniques  INTEGER NOT NULL DEFAULT 0,
  clones        INTEGER NOT NULL DEFAULT 0,
  clone_uniques INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (full_name, day)
);

-- GitHub's top-10 referrers and top-10 pages for the trailing 14 days, as
-- they stood on `captured_on`. Kept per capture day so the history of where
-- visitors came from survives GitHub's window.
CREATE TABLE IF NOT EXISTS traffic_sources (
  full_name   TEXT NOT NULL,
  captured_on TEXT NOT NULL,
  kind        TEXT NOT NULL,                          -- 'referrer' | 'path'
  key         TEXT NOT NULL,                          -- referring site, or page path
  title       TEXT,                                   -- page title (paths only)
  count       INTEGER NOT NULL DEFAULT 0,
  uniques     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (full_name, captured_on, kind, key)
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id          TEXT PRIMARY KEY,
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  trigger     TEXT NOT NULL DEFAULT 'manual',         -- 'manual' | 'schedule'
  status      TEXT NOT NULL DEFAULT 'running',        -- running | ok | partial | failed
  repos       INTEGER NOT NULL DEFAULT 0,             -- repos whose detail this step read
  api_calls   INTEGER NOT NULL DEFAULT 0,
  error       TEXT
);

-- The next daily sync the platform queue holds for this app. A single row.
CREATE TABLE IF NOT EXISTS sync_schedule (
  id        INTEGER PRIMARY KEY CHECK (id = 1),
  job_id    TEXT NOT NULL,
  run_at    TEXT NOT NULL,                            -- ISO-8601 UTC
  booked_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_repo_daily_day ON repo_daily (day);
CREATE INDEX IF NOT EXISTS idx_traffic_daily_day ON traffic_daily (day);
CREATE INDEX IF NOT EXISTS idx_sync_runs_started ON sync_runs (started_at);
