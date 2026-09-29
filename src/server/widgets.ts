// Tiles for the Clawnify home page. The dashboard draws them; this only
// supplies data. Each tile carries the icon and colour of the <AppNav> section
// it opens (client/app.tsx), so a widget reads as part of that section.

import { orgId, widgets, type Widget } from "@clawnify/app";
import { daysBefore, today, type App } from "./env.js";
import { movers, sources, starSeries, totals, trafficSeries } from "./metrics.js";
import { settings } from "./sync.js";

// Keep in step with the "repos" and "traffic" items of the nav in client/app.tsx.
const REPOS = { icon: "star", color: "amber" } as const;
const TRAFFIC = { icon: "activity", color: "green" } as const;

export function registerWidgets(app: App) {
  widgets(app, async (c) => {
    if (!orgId(c) || !(await settings())) return [];
    const [t, stars, traffic, month, referrers] = await Promise.all([
      totals(),
      starSeries("90d"),
      trafficSeries(daysBefore(today(), 29)),
      movers(30, 12),
      sources("referrer", 5),
    ]);

    const tiles: Widget[] = [
      { key: "total-stars", kind: "metric", title: "Stars across all repos", value: t.stars, at: "/repos", ...REPOS },
      { key: "stars-this-week", kind: "metric", title: "Stars gained in the last 7 days", value: t.gained_7d ?? 0, at: "/repos?sort=gained_7d", ...REPOS },
      {
        key: "stars-90d", kind: "series", title: "Total stars, last 90 days", at: "/", ...REPOS,
        points: stars.map((p) => ({ x: p.day, y: p.stars })),
      },
      {
        key: "stars-by-repo-30d", kind: "breakdown", title: "Stars gained this month, by repo", at: "/repos?sort=gained_30d", ...REPOS,
        items: month.filter((r) => (r.gained_30d ?? 0) > 0).map((r) => ({ label: r.name.slice(0, 80), value: r.gained_30d ?? 0 })),
      },
    ];
    // Traffic tiles only once there is traffic: without a token that can read
    // it they would be a permanent zero that looks like nobody visits.
    if (traffic.length > 0) {
      tiles.push({
        key: "views-30d", kind: "series", title: "Repo views per day, last 30 days", at: "/traffic", ...TRAFFIC,
        points: traffic.map((p) => ({ x: p.day, y: p.views })),
      });
    }
    if (referrers.length > 0) {
      tiles.push({
        key: "top-referrers", kind: "list", title: "Where visitors come from", at: "/traffic", ...TRAFFIC,
        items: referrers.map((r) => ({ label: r.key.slice(0, 80), meta: `${r.count.toLocaleString("en-US")} views` })),
      });
    }
    return tiles;
  });
}
