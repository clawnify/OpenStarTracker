// What to track, whether the sync is healthy, and running it.

import { createRoute, z } from "@clawnify/app";
import { verifyDelivery } from "@clawnify/queue";
import { get, query, run } from "../db.js";
import { fail, member, ok, type App } from "../env.js";
import { getOwner, github, GitHubError } from "../github.js";
import { afterStep, book, currentBooking, ensureScheduled } from "../schedule.js";
import { pending, settings, syncInFlight, syncStep, TRACKED } from "../sync.js";

const SettingsSchema = z
  .object({
    owner: z.string(),
    owner_type: z.string(),
    owner_avatar: z.string().nullable(),
    include_forks: z.boolean(),
    include_archived: z.boolean(),
    listed_on: z.string().nullable(),
  })
  .openapi("Settings");

const RunSchema = z
  .object({
    id: z.string(),
    started_at: z.string(),
    finished_at: z.string().nullable(),
    trigger: z.string(),
    status: z.string(),
    repos: z.number(),
    api_calls: z.number(),
    error: z.string().nullable(),
  })
  .openapi("SyncRun");

const StatusSchema = z
  .object({
    settings: SettingsSchema.nullable(),
    token: z.boolean().openapi({ description: "Whether a GITHUB_TOKEN is configured" }),
    traffic: z
      .enum(["ok", "partial", "denied", "unknown", "no_token"])
      .openapi({ description: "Whether the token can read traffic: for every tracked repo, some, none, or not tried yet" }),
    traffic_error: z.string().nullable().openapi({ description: "What GitHub said when it last refused traffic, if it did" }),
    pending: z.number().openapi({ description: "Tracked repos not yet read today" }),
    tracked: z.number(),
    runs: z.array(RunSchema),
    next_sync_at: z.string().nullable(),
    scheduled: z.boolean().openapi({ description: "Whether a daily sync can be booked (false off the platform)" }),
  })
  .openapi("Status");

const StepSchema = z
  .object({
    status: z.enum(["ok", "partial", "failed", "in-progress"]),
    listed: z.number().nullable().openapi({ description: "Repos GitHub listed, when this step read the list" }),
    processed: z.number(),
    remaining: z.number().openapi({ description: "Tracked repos still to read today; call again until 0" }),
    api_calls: z.number(),
    errors: z.array(z.string()),
  })
  .openapi("SyncStep");

function shapeSettings(s: Awaited<ReturnType<typeof settings>>) {
  return s ? { ...s, include_forks: s.include_forks === 1, include_archived: s.include_archived === 1 } : null;
}

export function registerTracking(app: App) {
  const status = createRoute({
    method: "get",
    path: "/api/status",
    tags: ["Tracking"],
    summary: "Which account is tracked, whether GitHub access works, and how the sync is doing",
    responses: { 200: ok("Status", StatusSchema), 403: fail("Not a member") },
  });

  app.openapi(status, async (c) => {
    if (!member(c)) return c.json({ error: "Sign in to see this app." }, 403);
    const s = await settings();
    // The watchdog: with an account chosen there must always be a sync booked.
    const booking = s ? await ensureScheduled(c.env, new URL(c.req.url).origin) : await currentBooking();
    const access = await get<{ tracked: number; ok: number; denied: number }>(
      `SELECT COUNT(*) AS tracked,
              SUM(CASE WHEN r.traffic_access = 'ok' THEN 1 ELSE 0 END) AS ok,
              SUM(CASE WHEN r.traffic_access = 'denied' THEN 1 ELSE 0 END) AS denied
         FROM ${TRACKED}`,
    );
    const okN = Number(access?.ok ?? 0);
    const deniedN = Number(access?.denied ?? 0);
    const traffic = !c.env.GITHUB_TOKEN
      ? "no_token"
      : okN > 0 && deniedN > 0
        ? "partial"
        : okN > 0
          ? "ok"
          : deniedN > 0
            ? "denied"
            : "unknown";
    const refusal = await get<{ traffic_error: string }>(
      `SELECT r.traffic_error FROM ${TRACKED} AND r.traffic_access = 'denied' AND r.traffic_error IS NOT NULL LIMIT 1`,
    );
    const runs = await query<z.infer<typeof RunSchema>>(
      `SELECT id, started_at, finished_at, trigger, status, repos, api_calls, error
         FROM sync_runs ORDER BY started_at DESC LIMIT 5`,
    );
    return c.json(
      {
        settings: shapeSettings(s),
        token: Boolean(c.env.GITHUB_TOKEN),
        traffic,
        traffic_error: traffic === "denied" || traffic === "partial" ? (refusal?.traffic_error ?? null) : null,
        pending: s ? await pending() : 0,
        tracked: Number(access?.tracked ?? 0),
        runs,
        next_sync_at: booking?.runAt ?? null,
        scheduled: Boolean(c.env.CLAWNIFY_TOKEN),
      } as const,
      200,
    );
  });

  const save = createRoute({
    method: "put",
    path: "/api/settings",
    tags: ["Tracking"],
    summary: "Choose the GitHub user or organisation to track",
    description:
      "Checks the account exists on GitHub and stores its canonical login. Changing the account or the fork/archived switches makes the next sync re-read the repo list. Follow with POST /api/sync until remaining is 0.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              owner: z
                .string()
                .min(1)
                .max(100)
                .openapi({ description: "GitHub login or profile URL, e.g. 'clawnify' or 'https://github.com/clawnify'" }),
              include_forks: z.boolean().optional(),
              include_archived: z.boolean().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: ok("Saved", SettingsSchema),
      400: fail("Unknown account"),
      403: fail("Not a member"),
      429: fail("GitHub's hourly limit is spent; the message says until when"),
    },
  });

  app.openapi(save, async (c) => {
    if (!member(c)) return c.json({ error: "Sign in to change this app." }, 403);
    const body = c.req.valid("json");
    const login = body.owner.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/^@/, "").split("/")[0]!;
    if (!/^[A-Za-z0-9-]{1,39}$/.test(login)) return c.json({ error: `“${body.owner}” is not a GitHub login.` }, 400);
    let owner;
    try {
      owner = await getOwner(github(c.env.GITHUB_TOKEN), login);
    } catch (err) {
      if (err instanceof GitHubError && err.status === 404) return c.json({ error: `GitHub has no account called “${login}”.` }, 400);
      if (err instanceof GitHubError && err.resetAt) return c.json({ error: err.message }, 429);
      throw err;
    }
    const current = await settings();
    await run(
      `INSERT INTO settings (id, owner, owner_type, owner_avatar, include_forks, include_archived, listed_on, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, NULL, datetime('now'))
       ON CONFLICT (id) DO UPDATE SET owner = excluded.owner, owner_type = excluded.owner_type,
         owner_avatar = excluded.owner_avatar, include_forks = excluded.include_forks,
         include_archived = excluded.include_archived, listed_on = NULL, updated_at = excluded.updated_at`,
      [
        owner.login,
        owner.type,
        owner.avatar_url,
        (body.include_forks ?? current?.include_forks === 1) ? 1 : 0,
        (body.include_archived ?? current?.include_archived === 1) ? 1 : 0,
      ],
    );
    return c.json(shapeSettings(await settings())!, 200);
  });

  const sync = createRoute({
    method: "post",
    path: "/api/sync",
    tags: ["Tracking"],
    summary: "Read GitHub now: one bounded step",
    description:
      "Lists the repos (once a day) and reads traffic and star history for the next few. Repeat while `remaining` is above 0. Pass `fresh=1` on the first call to re-read every repo even if it was read today (after a token change, for instance); leave it off the calls that follow. A daily sync runs on its own, so call this only when fresh numbers are wanted now.",
    request: {
      query: z.object({
        fresh: z.enum(["0", "1"]).optional().openapi({ description: "1 = start over and re-read every repo" }),
      }),
    },
    responses: { 200: ok("One step", StepSchema), 202: ok("A step is already running", StepSchema), 403: fail("Not a member") },
  });

  app.openapi(sync, async (c) => {
    if (!member(c)) return c.json({ error: "Sign in to run a sync." }, 403);
    if (await syncInFlight()) {
      return c.json(
        { status: "in-progress" as const, listed: null, processed: 0, remaining: await pending(), api_calls: 0, errors: [] },
        202,
      );
    }
    const r = await syncStep(c.env, "manual", { fresh: c.req.valid("query").fresh === "1" });
    return c.json(
      { status: r.status, listed: r.listed, processed: r.processed, remaining: r.remaining, api_calls: r.apiCalls, errors: r.errors },
      200,
    );
  });

  // The queue's delivery route. Public in clawnify.json because the platform
  // queue calls it without a session; a valid queue signature is the only
  // thing it accepts, so a stranger cannot make the app spend its GitHub quota.
  // Kept off the OpenAPI surface: nobody but the queue should call it.
  app.post("/api/queue/sync", async (c) => {
    const raw = await c.req.text();
    const signed = await verifyDelivery(raw, {
      signature: c.req.header("X-Queue-Signature") ?? null,
      timestamp: c.req.header("X-Queue-Timestamp") ?? null,
      keyId: c.req.header("X-Queue-Key-Id") ?? null,
    }).catch(() => false);
    if (!signed) return c.json({ error: "Not a queue delivery." }, 401);

    const origin = new URL(c.req.url).origin;
    if (!(await settings())) return c.json({ status: "off" }, 200);
    if (await syncInFlight()) {
      // Someone pressed Refresh at the same moment. Look again shortly rather
      // than dropping the booking, which would end the daily chain.
      const at = new Date(Date.now() + 5 * 60 * 1000);
      await book(c.env, origin, at, `busy-${at.toISOString().slice(0, 16)}`);
      return c.json({ status: "in-progress" }, 200);
    }
    let result;
    try {
      result = await syncStep(c.env, "schedule");
    } finally {
      // Booked whatever happened above, so one bad run cannot end the chain.
      await afterStep(c.env, origin, result?.remaining ?? (await pending()), (result?.processed ?? 0) > 0 || result?.listed != null);
    }
    return c.json(result, 200);
  });
}
