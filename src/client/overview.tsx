// The account at a glance: four numbers, the star curve, and what moved.

import { useEffect, useState, type ReactNode } from "react";
import { api, type Overview, type Range, type Status } from "./api";
import type { SyncState } from "./app";
import { BarChart, LineChart } from "./charts";
import { delta, num, relative } from "./format";
import type { Route } from "./routing";
import { Banner, Card, Delta, Empty, Row, Segmented, Stat, Toolbar } from "./ui";

const RANGES: { value: Range; label: string }[] = [
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "1y", label: "1 year" },
  { value: "all", label: "All" },
];

export function OverviewScreen({
  status,
  version,
  sync,
  refreshButton,
  onGo,
}: {
  status: Status;
  version: number;
  sync: SyncState;
  refreshButton: ReactNode;
  onGo: (r: Route) => void;
}) {
  const [range, setRange] = useState<Range>("90d");
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    api
      .overview(range)
      .then((d) => live && setData(d))
      .catch((e) => live && setError((e as Error).message));
    return () => {
      live = false;
    };
  }, [range, version]);

  const s = status.settings!;
  const t = data?.totals;
  const lastRun = status.runs.find((r) => r.status !== "running");
  const hasTraffic = (data?.traffic.length ?? 0) > 0;
  const firstSync = status.runs.length === 0 || (sync.running && !data?.stars.some((p) => p.stars > 0));

  return (
    <>
      <Toolbar
        title={
          <span className="inline-flex items-center gap-2">
            {s.owner_avatar && <img src={s.owner_avatar} alt="" className="size-6 rounded-full" />}
            {s.owner}
          </span>
        }
        meta={
          <>
            {num(status.tracked)} tracked repos · updated {relative(lastRun?.finished_at ?? null)}
            {status.next_sync_at && <> · next update {relative(status.next_sync_at)}</>}
          </>
        }
      >
        {refreshButton}
      </Toolbar>

      <div className="mx-auto grid max-w-[80rem] gap-4 p-6">
        {error && <Banner tone="danger">{error}</Banner>}
        {status.traffic === "no_token" && (
          <Banner tone="info">
            No GitHub token is set, so GitHub may stop answering and never shows views, clones or referrers:{" "}
            <button type="button" className="font-medium underline underline-offset-2" onClick={() => onGo({ view: "settings" })}>
              add one in Settings
            </button>
            .
          </Banner>
        )}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat
            loading={!t}
            label="Stars"
            value={num(t?.stars)}
            meta={
              <>
                <Delta value={t?.gained_7d ?? null}>{delta(t?.gained_7d)}</Delta> in 7 days
              </>
            }
          />
          <Stat
            loading={!t}
            label="Stars in 30 days"
            value={<Delta value={t?.gained_30d ?? null}>{delta(t?.gained_30d)}</Delta>}
            meta={<>{num(t?.forks)} forks in total</>}
          />
          <Stat
            loading={!t}
            label="Views, last 14 days"
            value={num(t?.views_14d)}
            meta={t?.view_uniques_14d != null ? <>{num(t.view_uniques_14d)} unique visitors</> : "Needs a token"}
          />
          <Stat
            loading={!t}
            label="Clones, last 14 days"
            value={num(t?.clones_14d)}
            meta={t?.clone_uniques_14d != null ? <>{num(t.clone_uniques_14d)} unique cloners</> : "Needs a token"}
          />
        </div>

        <Card
          title="Stars across all repos"
          hint={range === "all" ? "Since the earliest star this app could read." : "Every tracked repo, added up per day."}
          action={<Segmented label="Time range" value={range} options={RANGES} onChange={setRange} />}
        >
          {!data ? (
            <div className="skeleton h-[220px]" />
          ) : firstSync ? (
            <Empty title="Reading your repos" hint="The first read rebuilds each repo's star history, so the curve fills in as it goes." />
          ) : (
            <LineChart
              points={data.stars.map((p) => ({ day: p.day, value: p.stars }))}
              series="stars"
              unit="stars"
              caption="Total stars per day"
            />
          )}
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card
            title="Rising this week"
            hint="Most stars gained in the last 7 days."
            action={
              <button type="button" className="text-sm text-muted hover:text-foreground" onClick={() => onGo({ view: "repos", sort: "gained_7d" })}>
                View all
              </button>
            }
          >
            {!data ? (
              <div className="skeleton h-40" />
            ) : data.rising.length === 0 ? (
              <p className="text-sm text-muted">No repos yet.</p>
            ) : (
              <ul>
                {data.rising.map((r) => (
                  <Row
                    key={r.full_name}
                    href={`/repos/${r.full_name}`}
                    onClick={() => onGo({ view: "repo", fullName: r.full_name })}
                    title={r.name}
                    subtitle={`${num(r.stars)} stars`}
                    value={<Delta value={r.gained_7d}>{delta(r.gained_7d)}</Delta>}
                  />
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="Where visitors come from"
            hint="GitHub's top referrers per repo over the last 14 days, added up."
            action={
              hasTraffic ? (
                <button type="button" className="text-sm text-muted hover:text-foreground" onClick={() => onGo({ view: "traffic" })}>
                  View all
                </button>
              ) : undefined
            }
          >
            {!data ? (
              <div className="skeleton h-40" />
            ) : data.referrers.length === 0 ? (
              <p className="text-sm text-muted">
                {status.traffic === "no_token" || status.traffic === "denied"
                  ? "GitHub only shows referrers to a token that can push to the repos."
                  : "Nothing recorded yet. It appears after the next sync."}
              </p>
            ) : (
              <ul>
                {data.referrers.slice(0, 5).map((r) => (
                  <Row key={r.key} title={r.key} subtitle={`${num(r.uniques)} unique visitors`} value={`${num(r.count)} views`} />
                ))}
              </ul>
            )}
          </Card>
        </div>

        {hasTraffic && data && (
          <Card title="Views per day" hint="Every tracked repo's page views, as recorded day by day.">
            <BarChart points={data.traffic.map((p) => ({ day: p.day, value: p.views }))} series="views" unit="views" caption="Repo views per day" />
          </Card>
        )}
      </div>
    </>
  );
}
