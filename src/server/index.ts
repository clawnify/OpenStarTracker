// OpenStarTracker: the API.
//
// `createApp` brings the OpenAPI router, the per-request database wiring, and
// the two discovery routes (`/api/openapi.json`, `/llms.txt`) that let the org's
// agent learn this API without anyone documenting it twice.

import { createApp } from "@clawnify/app";
import type { Env } from "./env.js";
import { registerTracking } from "./routes/tracking.js";
import { registerRepos } from "./routes/repos.js";
import { registerWidgets } from "./widgets.js";

const app = createApp<Env>({
  title: "OpenStarTracker",
  version: "1.0.0",
  description:
    "How a GitHub account's open-source repos are doing: stars, forks and open issues per day, and the views, clones, referrers and popular pages GitHub only keeps for 14 days, recorded daily so the history outlives GitHub's window.",
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message || String(err) }, 500);
});

registerTracking(app);
registerRepos(app);
registerWidgets(app);

export default app;
