// One fetch wrapper. Auth is the platform's job at the perimeter, so there is
// no token to attach and no login to build here.

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || `${res.status} ${res.statusText}`);
  return body;
}

export interface Settings {
  owner: string;
  owner_type: string;
  owner_avatar: string | null;
  include_forks: boolean;
  include_archived: boolean;
  listed_on: string | null;
}

export interface SyncRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  trigger: string;
  status: string;
  repos: number;
  api_calls: number;
  error: string | null;
}

export interface Status {
  settings: Settings | null;
  token: boolean;
  traffic: "ok" | "partial" | "denied" | "unknown" | "no_token";
  traffic_error: string | null;
  pending: number;
  tracked: number;
  runs: SyncRun[];
  next_sync_at: string | null;
  scheduled: boolean;
}

export interface Step {
  status: "ok" | "partial" | "failed" | "in-progress";
  listed: number | null;
  processed: number;
  remaining: number;
  api_calls: number;
  errors: string[];
}

export interface Repo {
  full_name: string;
  name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  is_fork: number;
  archived: number;
  hidden: number;
  stars: number;
  forks: number;
  open_issues: number;
  created_at: string | null;
  pushed_at: string | null;
  views_14d: number | null;
  view_uniques_14d: number | null;
  clones_14d: number | null;
  clone_uniques_14d: number | null;
  traffic_access: string | null;
  history_since: string | null;
  gained_7d: number | null;
  gained_30d: number | null;
}

export interface Source {
  key: string;
  title: string | null;
  count: number;
  uniques: number;
  repos: number;
}

export interface TrafficPoint {
  day: string;
  views: number;
  view_uniques: number;
  clones: number;
  clone_uniques: number;
}

export type Range = "30d" | "90d" | "1y" | "all";
export type Sort = "stars" | "gained_7d" | "gained_30d" | "views" | "clones" | "forks" | "pushed" | "name";

export interface Overview {
  totals: {
    repos: number;
    stars: number;
    forks: number;
    open_issues: number;
    gained_7d: number | null;
    gained_30d: number | null;
    views_14d: number | null;
    view_uniques_14d: number | null;
    clones_14d: number | null;
    clone_uniques_14d: number | null;
  };
  stars: { day: string; stars: number }[];
  traffic: TrafficPoint[];
  rising: Repo[];
  referrers: Source[];
  pages: Source[];
}

export interface RepoPage {
  repos: (Repo & { spark: (number | null)[] })[];
  total: number;
  page: number;
  limit: number;
  sums: { stars: number; forks: number; views: number | null; clones: number | null };
}

export interface RepoDetail {
  repo: Repo & { topics: string[]; listed_on: string | null; first_seen: string };
  stars: { day: string; stars: number }[];
  traffic: TrafficPoint[];
  referrers: Source[];
  paths: Source[];
}

export const api = {
  status: () => request<Status>("/api/status"),
  saveSettings: (body: { owner: string; include_forks?: boolean; include_archived?: boolean }) =>
    request<Settings>("/api/settings", { method: "PUT", body: JSON.stringify(body) }),
  syncStep: (fresh: boolean) => request<Step>(`/api/sync${fresh ? "?fresh=1" : ""}`, { method: "POST" }),
  overview: (range: Range) => request<Overview>(`/api/overview?range=${range}`),
  repos: (q: { sort: Sort; search: string; hidden?: boolean; page?: number }) => {
    const p = new URLSearchParams({ sort: q.sort, limit: "100", page: String(q.page ?? 1) });
    if (q.search) p.set("search", q.search);
    if (q.hidden) p.set("hidden", "1");
    return request<RepoPage>(`/api/repos?${p}`);
  },
  repo: (fullName: string) => request<RepoDetail>(`/api/repos/${fullName}`),
  setHidden: (fullName: string, hidden: boolean) =>
    request<{ ok: boolean }>(`/api/repos/${fullName}`, { method: "PATCH", body: JSON.stringify({ hidden }) }),
};
