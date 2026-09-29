// The numbers: the account overview, the repo table, and one repo in full.

import { createRoute, PageQuery, pageParams, z } from "@clawnify/app";
import { get, run } from "../db.js";
import { daysBefore, fail, member, ok, OkSchema, today, type App } from "../env.js";
import { movers, RANGES, repoDetail, repoPage, SORTS, sources, starSeries, totals, trafficSeries } from "../metrics.js";

const RepoSchema = z
  .object({
    full_name: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    html_url: z.string(),
    homepage: z.string().nullable(),
    language: z.string().nullable(),
    is_fork: z.number(),
    archived: z.number(),
    hidden: z.number(),
    stars: z.number(),
    forks: z.number(),
    open_issues: z.number().openapi({ description: "Open issues plus open pull requests, as GitHub counts them" }),
    created_at: z.string().nullable(),
    pushed_at: z.string().nullable(),
    views_14d: z.number().nullable(),
    view_uniques_14d: z.number().nullable(),
    clones_14d: z.number().nullable(),
    clone_uniques_14d: z.number().nullable(),
    traffic_access: z.string().nullable(),
    history_since: z.string().nullable(),
    gained_7d: z.number().nullable().openapi({ description: "Stars gained in 7 days; null when the history does not reach back that far" }),
    gained_30d: z.number().nullable(),
  })
  .openapi("Repo");

const SourceSchema = z.object({
  key: z.string(),
  title: z.string().nullable(),
  count: z.number(),
  uniques: z.number(),
  repos: z.number(),
});

const TrafficPointSchema = z.object({
  day: z.string(),
  views: z.number(),
  view_uniques: z.number(),
  clones: z.number(),
  clone_uniques: z.number(),
});

const RangeParam = z.enum(Object.keys(RANGES) as [keyof typeof RANGES, ...(keyof typeof RANGES)[]]);
const SortParam = z.enum(Object.keys(SORTS) as [keyof typeof SORTS, ...(keyof typeof SORTS)[]]);

export function registerRepos(app: App) {
  const overview = createRoute({
    method: "get",
    path: "/api/overview",
    tags: ["Stats"],
    summary: "Account-wide totals, the star curve, daily traffic, risers and referrers",
    description:
      "One bounded read for the whole account. `stars` is one point per day over `range` (default 90d). Traffic covers the last 90 days of what has been recorded.",
    request: { query: z.object({ range: RangeParam.optional() }) },
    responses: {
      200: ok(
        "Overview",
        z.object({
          totals: z.object({
            repos: z.number(),
            stars: z.number(),
            forks: z.number(),
            open_issues: z.number(),
            gained_7d: z.number().nullable(),
            gained_30d: z.number().nullable(),
            views_14d: z.number().nullable(),
            view_uniques_14d: z.number().nullable(),
            clones_14d: z.number().nullable(),
            clone_uniques_14d: z.number().nullable(),
          }),
          stars: z.array(z.object({ day: z.string(), stars: z.number() })),
          traffic: z.array(TrafficPointSchema),
          rising: z.array(RepoSchema),
          referrers: z.array(SourceSchema),
          pages: z.array(SourceSchema),
        }),
      ),
      403: fail("Not a member"),
    },
  });

  app.openapi(overview, async (c) => {
    if (!member(c)) return c.json({ error: "Sign in to see this app." }, 403);
    const range = c.req.valid("query").range ?? "90d";
    const [t, stars, traffic, rising, referrers, pages] = await Promise.all([
      totals(),
      starSeries(range),
      trafficSeries(daysBefore(today(), 89)),
      movers(7, 5),
      sources("referrer", 8),
      sources("path", 8),
    ]);
    return c.json({ totals: t, stars, traffic, rising, referrers, pages }, 200);
  });

  const list = createRoute({
    method: "get",
    path: "/api/repos",
    tags: ["Stats"],
    summary: "Tracked repos with their stars, growth and traffic",
    description: "Paged. `sort` picks the ranking; `hidden=1` lists the repos the user hid instead.",
    request: {
      query: PageQuery.extend({
        sort: SortParam.optional().openapi({ description: "Default: stars" }),
        hidden: z.enum(["0", "1"]).optional(),
      }),
    },
    responses: {
      200: ok(
        "A page of repos",
        z.object({
          repos: z.array(RepoSchema.extend({ spark: z.array(z.number().nullable()).openapi({ description: "Stars per day, last 30 days" }) })),
          total: z.number(),
          page: z.number(),
          limit: z.number(),
          sums: z.object({ stars: z.number(), forks: z.number(), views: z.number().nullable(), clones: z.number().nullable() }),
        }),
      ),
      403: fail("Not a member"),
    },
  });

  app.openapi(list, async (c) => {
    if (!member(c)) return c.json({ error: "Sign in to see this app." }, 403);
    const q = c.req.valid("query");
    const { page, limit, offset, search } = pageParams(q);
    const result = await repoPage({ sort: q.sort ?? "stars", search: search ?? "", limit, offset, hidden: q.hidden === "1" });
    return c.json({ ...result, page, limit }, 200);
  });

  const one = createRoute({
    method: "get",
    path: "/api/repos/{owner}/{name}",
    tags: ["Stats"],
    summary: "One repo: its full star history, recorded traffic, referrers and popular pages",
    request: { params: z.object({ owner: z.string(), name: z.string() }) },
    responses: {
      200: ok(
        "The repo",
        z.object({
          repo: RepoSchema.extend({ topics: z.array(z.string()), listed_on: z.string().nullable(), first_seen: z.string() }),
          stars: z.array(z.object({ day: z.string(), stars: z.number() })),
          traffic: z.array(TrafficPointSchema),
          referrers: z.array(SourceSchema),
          paths: z.array(SourceSchema),
        }),
      ),
      403: fail("Not a member"),
      404: fail("Not tracked"),
    },
  });

  app.openapi(one, async (c) => {
    if (!member(c)) return c.json({ error: "Sign in to see this app." }, 403);
    const { owner, name } = c.req.valid("param");
    const detail = await repoDetail(`${owner}/${name}`);
    if (!detail) return c.json({ error: `${owner}/${name} is not a repo this app has seen.` }, 404);
    return c.json(detail, 200);
  });

  const hide = createRoute({
    method: "patch",
    path: "/api/repos/{owner}/{name}",
    tags: ["Stats"],
    summary: "Hide a repo from every view and total, or bring it back",
    description: "A hidden repo is no longer read from GitHub, which also saves API calls. Its history is kept.",
    request: {
      params: z.object({ owner: z.string(), name: z.string() }),
      body: { content: { "application/json": { schema: z.object({ hidden: z.boolean() }) } } },
    },
    responses: { 200: ok("Saved", OkSchema), 403: fail("Not a member"), 404: fail("Unknown repo") },
  });

  app.openapi(hide, async (c) => {
    if (!member(c)) return c.json({ error: "Sign in to change this app." }, 403);
    const { owner, name } = c.req.valid("param");
    const full = `${owner}/${name}`;
    if (!(await get("SELECT 1 FROM repos WHERE full_name = ?", [full]))) {
      return c.json({ error: `${full} is not a repo this app has seen.` }, 404);
    }
    await run("UPDATE repos SET hidden = ? WHERE full_name = ?", [c.req.valid("json").hidden ? 1 : 0, full]);
    return c.json({ ok: true }, 200);
  });
}
