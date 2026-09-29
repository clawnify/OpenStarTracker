# OpenStarTracker: how to run this app

Tracks how one GitHub account's public repos are doing: stars, forks and open
issues per day, star history rebuilt from GitHub back to each repo's first star, and the
views, clones, referrers and popular pages that GitHub itself only keeps for 14
days. The app records them daily, so its history outlives GitHub's window.

## Division of labour

- **Never read GitHub yourself to answer a question about these repos.** The
  app already holds the numbers, including history GitHub no longer has. Ask
  the app (`/api/overview`, `/api/repos`, `/api/repos/{owner}/{name}`).
- **Never paste a GitHub token into a request, a chat, or the app.** A token is
  set by the owner as the `GITHUB_TOKEN` environment variable in Clawnify
  Settings. If traffic is missing, tell the owner what the token needs (below)
  and where it goes; do not ask them to send it to you.
- Do not "fix" missing traffic by switching accounts or hiding repos. `n/a`
  means the token cannot push to that repo, which is a permission, not a bug.

## Applying the deploy answers

1. `PUT /api/settings` with `{ "owner": <github_account> }`. Add
   `"include_forks": true` only if the answer to "Should forks count?" was yes.
   A 400 means GitHub has no such account: ask the owner to check the spelling.
2. `POST /api/sync` and repeat while `remaining` is above 0. The first run
   reads every repo and rebuilds star history, so it takes several calls.
   After the owner changes the token, start with `POST /api/sync?fresh=1`:
   without it, repos already read today are not asked again.
3. Tell the owner the app is tracking and how many repos it found. If
   `GET /api/status` says `token: false`, tell them it needs a `GITHUB_TOKEN`:
   without one GitHub usually refuses the app outright (a 429 naming the
   limit), and never shows views or clones.

## Answering "how are my repos doing?"

1. `GET /api/overview` (default 90 days; `?range=30d|90d|1y|all`). Lead with
   `totals.gained_7d` and `totals.gained_30d`, name the top of `rising`, then
   traffic if `totals.views_14d` is not null.
2. For one repo, `GET /api/repos/{owner}/{name}`.
3. For rankings, `GET /api/repos?sort=gained_7d` (or `gained_30d`, `views`,
   `clones`, `stars`, `forks`, `pushed`, `name`), `limit` 25 by default.
4. A `null` gain means the history does not reach back that far. Say so rather
   than reporting zero.

## Pages

- `/`: overview. Screenshot-friendly: four totals, the star curve, risers,
  referrers.
- `/repos`: every tracked repo in one table, sortable (`?sort=gained_7d`).
- `/repos/{owner}/{name}`: one repo's full history.
- `/traffic`: views and clones per day, referring sites, most viewed pages.
- `/settings`: which account, the token checklist, and the last syncs.

## Reading failures

- `GET /api/status` → `traffic`: `no_token` (no `GITHUB_TOKEN` set), `denied`
  (token set but cannot push to these repos), `partial` (some repos only), `ok`.
- A fine-grained token needs the tracked account as **resource owner** (for an
  organisation, the organisation, not a person), **All repositories**, and
  **Administration: Read-only in the Repositories group** (not the
  Organizations group). "Public repositories" never reads traffic. A classic
  token needs push access. Organisations may have to approve the token.
  `GET /api/status` → `traffic_error` carries GitHub's exact refusal.
- A sync step that returns `processed: 0` with `remaining > 0` hit GitHub's
  hourly limit; the error names the reset time. Do not retry before it.

## Cost

Everything here is free: GitHub's API only, no model calls. A daily sync runs
by itself at 03:00 UTC, so only call `POST /api/sync` when the owner wants fresh
numbers now. Each call reads at most 10 repos.
