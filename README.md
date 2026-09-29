# OpenStarTracker

**See how your open-source repos are doing, with the history GitHub throws away.**

[![Deploy to Clawnify](https://app.clawnify.com/deploy-button.svg)](https://app.clawnify.com/deploy?repo=clawnify/OpenStarTracker)

An open-source app template provided by [Clawnify.com](https://clawnify.com).

GitHub shows you a star count and fourteen days of traffic. Ask it how many
stars a repo had in March, or where last month's visitors came from, and it has
nothing to tell you. OpenStarTracker writes it all down every day, so the
answer is still there when you want it.

Point it at a GitHub user or organisation and it tracks every public repo.

## What it shows

- **Stars over time**, per repo and for the whole account. The first sync
  rebuilds each repo's curve from GitHub's stargazer list, so you get history
  from day one, not from the day you installed it.
- **Who is rising**: stars gained this week and this month, ranked.
- **Views and clones per day**, kept long after GitHub's 14-day window closes.
- **Where visitors come from** (Google, chatgpt.com, a blog post, Hacker News)
  and which pages they read.
- **Forks and open issues** per repo, per day.
- **Home-page widgets** in Clawnify: total stars, stars this week, the 90-day
  curve, this month's risers, views per day, top referrers.

## How it works

```
Every day at 03:00 UTC (or when you press Refresh)
  └─ list the account's public repos        1 call per 100 repos
       ├─ write today's stars, forks, issues for every repo
       └─ for each tracked repo, 10 at a time
            ├─ views, clones, referrers, pages   (needs a token)
            └─ star history, the first time only
```

Everything is stored in the app's own SQLite database. Nothing leaves it except
the calls to GitHub's API.

## GitHub access

Stars, forks and issues are public, so the app works without a token. Two
reasons to add one anyway:

1. **Traffic is private.** GitHub only shows views, clones, referrers and
   popular pages to someone who can push to the repo.
2. **Rate limits.** Without a token GitHub allows 60 requests an hour per IP
   address, shared with everyone else on that address.

Create a [fine-grained token](https://github.com/settings/personal-access-tokens/new)
with the account as resource owner, access to its public repositories, and
**Administration: read** under repository permissions. Nothing else. Then set it
as `GITHUB_TOKEN`: in Clawnify under Settings → Environment Variables, or as a
Worker secret anywhere else.

## Run it locally

```bash
pnpm install
echo "GITHUB_TOKEN=github_pat_..." > .clawnify/.dev.vars   # optional
pnpm dev                                                   # http://localhost:5173
```

Enter an account, and the first sync starts on its own. Outside Clawnify there
is no daily scheduler, so press Refresh to read GitHub.

```bash
pnpm test        # unit tests
pnpm typecheck
pnpm build
```

## Stack

React 19, Tailwind v4 and Vite in front; Hono on Cloudflare Workers with a D1
(SQLite) database behind. The API is described at `/api/openapi.json` and
`/llms.txt`, so an agent can read it without separate docs.

## License

MIT
