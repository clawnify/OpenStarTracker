// Every tracked repo in one table. The page is the sheet: no card around it.

import { useEffect, useState, type ReactNode } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { api, type RepoPage, type Sort } from "./api";
import { Sparkline } from "./charts";
import { delta, num } from "./format";
import type { Route } from "./routing";
import { Banner, Chip, Delta, Empty, ghostClass, inputClass, Toolbar } from "./ui";

const SORT_LABELS: Record<Sort, string> = {
  stars: "Stars",
  gained_7d: "Stars this week",
  gained_30d: "Stars this month",
  views: "Views",
  clones: "Clones",
  forks: "Forks",
  pushed: "Last push",
  name: "Name",
};

export function ReposScreen({
  version,
  sort,
  refreshButton,
  onGo,
}: {
  version: number;
  sort: Sort;
  refreshButton: ReactNode;
  onGo: (r: Route) => void;
}) {
  const [search, setSearch] = useState("");
  const [hidden, setHidden] = useState(false);
  const [data, setData] = useState<RepoPage | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      api
        .repos({ sort, search, hidden })
        .then((d) => live && setData(d))
        .catch((e) => live && setError((e as Error).message));
    }, search ? 200 : 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [sort, search, hidden, version]);

  const setSort = (s: Sort) => onGo({ view: "repos", sort: s });
  const th = "h-8 px-3 text-left text-[0.8125rem] font-medium whitespace-nowrap text-muted";
  const num_th = `${th} text-right`;

  function SortHeader({ by, children, align = "right" }: { by: Sort; children: ReactNode; align?: "left" | "right" }) {
    const active = sort === by;
    return (
      <th className={align === "right" ? num_th : th} aria-sort={active ? "descending" : "none"}>
        <button
          type="button"
          onClick={() => setSort(by)}
          className={`inline-flex items-center gap-1 rounded-xs hover:text-foreground ${active ? "text-foreground" : ""}`}
        >
          {children}
          {active && <span aria-hidden>↓</span>}
        </button>
      </th>
    );
  }

  return (
    <>
      <Toolbar title="Repositories" meta={data ? `${num(data.total)} ${hidden ? "hidden" : "tracked"} · sorted by ${SORT_LABELS[sort].toLowerCase()}` : " "}>
        {refreshButton}
      </Toolbar>

      <div className="flex flex-wrap items-center gap-2 px-6 py-3">
        <label className="relative w-full max-w-72">
          <span className="sr-only">Search repos</span>
          <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" aria-hidden />
          <input className={`${inputClass} pl-8`} placeholder="Search name, description, language" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label className="inline-flex items-center gap-2 text-[0.8125rem] whitespace-nowrap text-muted">
          <span>Sorted by</span>
          <select className={`${inputClass} w-auto`} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            {(Object.keys(SORT_LABELS) as Sort[]).map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={ghostClass} aria-pressed={hidden} onClick={() => setHidden((h) => !h)}>
          {hidden ? "Show tracked repos" : "Show hidden repos"}
        </button>
      </div>

      {error && (
        <div className="px-6">
          <Banner tone="danger">{error}</Banner>
        </div>
      )}

      {!data ? (
        <div className="grid gap-2 px-6">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="skeleton h-8" />
          ))}
        </div>
      ) : data.repos.length === 0 ? (
        search ? (
          <Empty title={`Nothing matches “${search}”`} hint="The search looks at names, descriptions and languages." action={<button type="button" className={ghostClass} onClick={() => setSearch("")}>Clear the search</button>} />
        ) : hidden ? (
          <Empty title="No hidden repos" hint="Hide a repo from its page to leave it out of every total." />
        ) : (
          <Empty title="No repos yet" hint="They appear after the first sync reads the account's public repos." />
        )
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[60rem] border-collapse text-[0.8125rem]">
            <thead>
              <tr className="border-b border-rule">
                <SortHeader by="name" align="left">
                  Repository
                </SortHeader>
                <SortHeader by="stars">Stars</SortHeader>
                <SortHeader by="gained_7d">7 days</SortHeader>
                <SortHeader by="gained_30d">30 days</SortHeader>
                <th className={th}>
                  <span className="sr-only">Stars over 30 days</span>
                </th>
                <SortHeader by="forks">Forks</SortHeader>
                <th className={num_th} title="Open issues and pull requests">
                  Open
                </th>
                <SortHeader by="views">Views 14d</SortHeader>
                <th className={num_th}>Visitors</th>
                <SortHeader by="clones">Clones 14d</SortHeader>
              </tr>
            </thead>
            <tbody>
              {data.repos.map((r) => (
                <tr key={r.full_name} className="border-b border-rule transition-colors duration-150 hover:bg-sunken">
                  <td className="max-w-[26rem] px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <a
                        href={`/repos/${r.full_name}`}
                        className="truncate font-medium text-foreground hover:underline"
                        onClick={(e) => {
                          if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                          e.preventDefault();
                          onGo({ view: "repo", fullName: r.full_name });
                        }}
                      >
                        {r.name}
                      </a>
                      {r.language && <Chip>{r.language}</Chip>}
                      {r.archived === 1 && <Chip>Archived</Chip>}
                      {r.is_fork === 1 && <Chip>Fork</Chip>}
                    </div>
                    {r.description && <div className="truncate text-muted">{r.description}</div>}
                  </td>
                  <td className="tnum px-3 text-right font-medium">{num(r.stars)}</td>
                  <td className="px-3 text-right">
                    <Delta value={r.gained_7d}>{delta(r.gained_7d)}</Delta>
                  </td>
                  <td className="px-3 text-right">
                    <Delta value={r.gained_30d}>{delta(r.gained_30d)}</Delta>
                  </td>
                  <td className="px-3">
                    <Sparkline values={r.spark} label={`${r.name} stars over 30 days`} />
                  </td>
                  <td className="tnum px-3 text-right">{num(r.forks)}</td>
                  <td className="tnum px-3 text-right">{num(r.open_issues)}</td>
                  <td className="tnum px-3 text-right">{r.traffic_access === "denied" ? <span className="text-faint" title="The token cannot read this repo's traffic">n/a</span> : num(r.views_14d)}</td>
                  <td className="tnum px-3 text-right text-muted">{num(r.view_uniques_14d)}</td>
                  <td className="tnum px-3 text-right">{r.traffic_access === "denied" ? <span className="text-faint">n/a</span> : num(r.clones_14d)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-medium">
                <td className="px-3 py-2 text-muted">Total · {num(data.total)} repos</td>
                <td className="tnum px-3 text-right">{num(data.sums.stars)}</td>
                <td colSpan={3} />
                <td className="tnum px-3 text-right">{num(data.sums.forks)}</td>
                <td />
                <td className="tnum px-3 text-right">{num(data.sums.views)}</td>
                <td />
                <td className="tnum px-3 text-right">{num(data.sums.clones)}</td>
              </tr>
            </tfoot>
          </table>
          {data.total > data.repos.length && (
            <p className="px-6 py-3 text-sm text-muted">
              Showing the first {data.repos.length} of {num(data.total)}. Search to narrow it down.
            </p>
          )}
        </div>
      )}
    </>
  );
}
