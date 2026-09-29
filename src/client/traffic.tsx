// Account-wide traffic: the daily curve GitHub forgets after 14 days, and
// where people arrive from.

import { useEffect, useState, type ReactNode } from "react";
import { api, type Overview, type Status } from "./api";
import { BarChart } from "./charts";
import { num } from "./format";
import type { Route } from "./routing";
import { Banner, Card, Empty, Row, Segmented, Stat, Toolbar, primaryClass } from "./ui";

export function TrafficScreen({
  status,
  version,
  refreshButton,
  onGo,
}: {
  status: Status;
  version: number;
  refreshButton: ReactNode;
  onGo: (r: Route) => void;
}) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [measure, setMeasure] = useState<"views" | "clones">("views");

  useEffect(() => {
    let live = true;
    api
      .overview("30d")
      .then((d) => live && setData(d))
      .catch((e) => live && setError((e as Error).message));
    return () => {
      live = false;
    };
  }, [version]);

  const t = data?.totals;
  const blocked = status.traffic === "no_token" || status.traffic === "denied";

  return (
    <>
      <Toolbar title="Traffic" meta="Views, clones and referrers across every tracked repo.">
        {refreshButton}
      </Toolbar>
      <div className="mx-auto grid max-w-[80rem] gap-4 p-6">
        {error && <Banner tone="danger">{error}</Banner>}
        {status.traffic === "partial" && (
          <Banner tone="warning">The token can read traffic for some repos but not all. Repos it cannot read show n/a.</Banner>
        )}

        {blocked && data && data.traffic.length === 0 ? (
          <Empty
            title={status.traffic === "no_token" ? "Traffic needs a GitHub token" : "This token cannot read traffic"}
            hint="GitHub only shows views, clones and referrers to someone who can push to the repo. A fine-grained token with “Administration: read” on the repos is enough."
            action={
              <button type="button" className={primaryClass} onClick={() => onGo({ view: "settings" })}>
                Set up a token
              </button>
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Stat loading={!t} label="Views, last 14 days" value={num(t?.views_14d)} />
              <Stat loading={!t} label="Unique visitors" value={num(t?.view_uniques_14d)} meta="Per repo, added up" />
              <Stat loading={!t} label="Clones, last 14 days" value={num(t?.clones_14d)} />
              <Stat loading={!t} label="Unique cloners" value={num(t?.clone_uniques_14d)} meta="Per repo, added up" />
            </div>

            <Card
              title={measure === "views" ? "Views per day" : "Clones per day"}
              hint="The last 90 days of what has been recorded."
              action={
                <Segmented
                  label="Measure"
                  value={measure}
                  options={[
                    { value: "views", label: "Views" },
                    { value: "clones", label: "Clones" },
                  ]}
                  onChange={setMeasure}
                />
              }
            >
              {!data ? (
                <div className="skeleton h-[200px]" />
              ) : data.traffic.length === 0 ? (
                <p className="text-sm text-muted">Nothing recorded yet. It appears after the next sync.</p>
              ) : (
                <BarChart
                  points={data.traffic.map((p) => ({ day: p.day, value: measure === "views" ? p.views : p.clones }))}
                  series={measure}
                  unit={measure}
                  caption={`${measure} per day across all repos`}
                />
              )}
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Referring sites" hint="Each repo's top 10 over the last 14 days, added up.">
                {!data ? (
                  <div className="skeleton h-40" />
                ) : data.referrers.length === 0 ? (
                  <p className="text-sm text-muted">Nothing recorded yet.</p>
                ) : (
                  <ul>
                    {data.referrers.map((r) => (
                      <Row key={r.key} title={r.key} subtitle={`${num(r.uniques)} unique · ${r.repos} ${r.repos === 1 ? "repo" : "repos"}`} value={num(r.count)} />
                    ))}
                  </ul>
                )}
              </Card>
              <Card title="Most viewed pages" hint="Each repo's top 10 pages over the last 14 days.">
                {!data ? (
                  <div className="skeleton h-40" />
                ) : data.pages.length === 0 ? (
                  <p className="text-sm text-muted">Nothing recorded yet.</p>
                ) : (
                  <ul>
                    {data.pages.map((p) => (
                      <Row key={p.key} title={p.key.replace(/^\/[^/]+\//, "")} subtitle={p.title ?? undefined} value={num(p.count)} />
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </>
        )}
      </div>
    </>
  );
}
