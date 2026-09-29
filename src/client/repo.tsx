// One repo: its whole star curve, the traffic recorded for it, and where its
// visitors came from.

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowSquareOut, EyeSlash, Eye } from "@phosphor-icons/react";
import { useChatContext } from "@clawnify/app/client";
import { api, type RepoDetail, type Source } from "./api";
import { BarChart, LineChart } from "./charts";
import { delta, longDay, num } from "./format";
import type { Route } from "./routing";
import { Banner, Card, Chip, Delta, Empty, ghostClass, Row, secondaryClass, Segmented, Stat, Toolbar } from "./ui";

export function RepoScreen({
  fullName,
  version,
  onGo,
  onChanged,
}: {
  fullName: string;
  version: number;
  onGo: (r: Route) => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<RepoDetail | null>(null);
  const [error, setError] = useState("");
  const [measure, setMeasure] = useState<"views" | "clones">("views");

  useEffect(() => {
    let live = true;
    setError("");
    api
      .repo(fullName)
      .then((d) => live && setData(d))
      .catch((e) => live && setError((e as Error).message));
    return () => {
      live = false;
    };
  }, [fullName, version]);

  useChatContext({ label: "Repository", record: { type: "repo", id: fullName, label: fullName } });

  const r = data?.repo;
  async function toggleHidden() {
    if (!r) return;
    try {
      await api.setHidden(r.full_name, !r.hidden);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <Toolbar
        title={
          <span className="inline-flex items-center gap-2">
            <button type="button" className={`${ghostClass} -ml-2 px-1.5`} aria-label="Back to repositories" onClick={() => onGo({ view: "repos", sort: "stars" })}>
              <ArrowLeft size={18} aria-hidden />
            </button>
            {r?.name ?? fullName.split("/")[1]}
          </span>
        }
        meta={r?.description ?? undefined}
      >
        {r && (
          <>
            <button type="button" className={ghostClass} onClick={() => void toggleHidden()}>
              {r.hidden ? <Eye size={16} aria-hidden /> : <EyeSlash size={16} aria-hidden />}
              {r.hidden ? "Track again" : "Hide"}
            </button>
            <a href={r.html_url} target="_blank" rel="noreferrer" className={secondaryClass}>
              <ArrowSquareOut size={16} aria-hidden />
              Open on GitHub
            </a>
          </>
        )}
      </Toolbar>

      <div className="mx-auto grid max-w-[80rem] gap-4 p-6">
        {error && <Banner tone="danger">{error}</Banner>}
        {r?.hidden === 1 && <Banner tone="info">Hidden: left out of every total and no longer read from GitHub. Its history is kept.</Banner>}
        {r && (r.language || r.topics.length > 0 || r.archived === 1 || r.is_fork === 1) && (
          <div className="flex flex-wrap gap-1.5">
            {r.language && <Chip>{r.language}</Chip>}
            {r.archived === 1 && <Chip>Archived</Chip>}
            {r.is_fork === 1 && <Chip>Fork</Chip>}
            {r.topics.slice(0, 8).map((t) => (
              <Chip key={t}>{t}</Chip>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat loading={!r} label="Stars" value={num(r?.stars)} meta={<><Delta value={r?.gained_7d ?? null}>{delta(r?.gained_7d)}</Delta> in 7 days · <Delta value={r?.gained_30d ?? null}>{delta(r?.gained_30d)}</Delta> in 30</>} />
          <Stat loading={!r} label="Forks" value={num(r?.forks)} meta={<>{num(r?.open_issues)} open issues and PRs</>} />
          <Stat
            loading={!r}
            label="Views, last 14 days"
            value={r?.traffic_access === "denied" ? "n/a" : num(r?.views_14d)}
            meta={r?.view_uniques_14d != null ? <>{num(r.view_uniques_14d)} unique visitors</> : r?.traffic_access === "denied" ? "The token cannot read it" : ""}
          />
          <Stat
            loading={!r}
            label="Clones, last 14 days"
            value={r?.traffic_access === "denied" ? "n/a" : num(r?.clones_14d)}
            meta={r?.clone_uniques_14d != null ? <>{num(r.clone_uniques_14d)} unique cloners</> : ""}
          />
        </div>

        <Card
          title="Stars over time"
          hint={
            r?.history_since
              ? `Rebuilt from GitHub's star history back to ${longDay(r.history_since)}, then recorded daily.`
              : "Recorded daily from the day tracking began."
          }
        >
          {!data ? (
            <div className="skeleton h-[220px]" />
          ) : data.stars.length < 2 ? (
            <Empty title="Not enough history yet" hint="The curve starts once there are two days to connect." />
          ) : (
            <LineChart points={data.stars.map((p) => ({ day: p.day, value: p.stars }))} series="stars" unit="stars" caption={`${fullName} stars per day`} />
          )}
        </Card>

        <Card
          title={measure === "views" ? "Views per day" : "Clones per day"}
          hint="Everything recorded since tracking began. GitHub itself keeps only 14 days."
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
            <p className="text-sm text-muted">
              {r?.traffic_access === "denied"
                ? "GitHub only shows traffic to a token that can push to this repo."
                : "No traffic recorded yet. It needs a GitHub token and appears after the next sync."}
            </p>
          ) : (
            <BarChart
              points={data.traffic.map((p) => ({ day: p.day, value: measure === "views" ? p.views : p.clones }))}
              series={measure}
              unit={measure}
              caption={`${fullName} ${measure} per day`}
            />
          )}
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <SourceCard title="Referring sites" hint="Top 10 over GitHub's last 14 days." rows={data?.referrers ?? null} kind="referrer" />
          <SourceCard title="Popular pages" hint="Top 10 over GitHub's last 14 days." rows={data?.paths ?? null} kind="path" />
        </div>
      </div>
    </>
  );
}

function SourceCard({ title, hint, rows, kind }: { title: string; hint: string; rows: Source[] | null; kind: "referrer" | "path" }) {
  return (
    <Card title={title} hint={hint}>
      {!rows ? (
        <div className="skeleton h-40" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">Nothing recorded yet.</p>
      ) : (
        <ul>
          {rows.map((s) => (
            <Row
              key={s.key}
              title={kind === "path" ? (s.title || s.key) : s.key}
              subtitle={kind === "path" ? s.key : `${num(s.uniques)} unique visitors`}
              value={`${num(s.count)}`}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}
