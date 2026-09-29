// The GitHub REST calls this app makes, and nothing else. Every call goes
// through `gh()`, which counts it, attaches the token when there is one, and
// turns GitHub's rate-limit answer into an error that says when to come back.

const API = "https://api.github.com";

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Set when GitHub refused because the hourly budget is spent. */
    readonly resetAt: Date | null = null,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

export interface GitHub {
  /** Calls made so far through this client. */
  readonly calls: number;
  readonly authenticated: boolean;
  get<T>(path: string, accept?: string): Promise<{ data: T; link: string | null }>;
}

export function github(token: string | undefined, fetcher: typeof fetch = fetch): GitHub {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    authenticated: Boolean(token),
    async get<T>(path: string, accept = "application/vnd.github+json") {
      calls++;
      const res = await fetcher(`${API}${path}`, {
        headers: {
          Accept: accept,
          "X-GitHub-Api-Version": "2022-11-28",
          // GitHub rejects requests without a User-Agent.
          "User-Agent": "OpenStarTracker",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (res.ok) return { data: (await res.json()) as T, link: res.headers.get("Link") };

      const body = (await res.json().catch(() => ({}))) as { message?: string };
      const remaining = res.headers.get("X-RateLimit-Remaining");
      const reset = Number(res.headers.get("X-RateLimit-Reset"));
      if ((res.status === 403 || res.status === 429) && remaining === "0") {
        const resetAt = Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000) : null;
        throw new GitHubError(
          token
            ? `GitHub's hourly limit for this token is used up${resetAt ? ` until ${resetAt.toISOString().slice(11, 16)} UTC` : ""}.`
            : "GitHub's limit for requests without a token is used up. Add a GITHUB_TOKEN to lift it.",
          res.status,
          resetAt,
        );
      }
      throw new GitHubError(body.message || `GitHub answered ${res.status}`, res.status);
    },
  };
}

/** The page number of `rel="last"` in a Link header, or null when there is none. */
export function lastPage(link: string | null): number | null {
  if (!link) return null;
  const m = link.match(/<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="last"/);
  return m ? Number(m[1]) : null;
}

export function hasNext(link: string | null): boolean {
  return Boolean(link && /rel="next"/.test(link));
}

// ── Shapes, only the fields this app reads ─────────────────────────────────

export interface Owner {
  login: string;
  type: "User" | "Organization";
  avatar_url: string;
}

export interface Repo {
  full_name: string;
  name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  topics?: string[];
  fork: boolean;
  archived: boolean;
  private: boolean;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  created_at: string;
  pushed_at: string | null;
}

export interface TrafficSeries {
  count: number;
  uniques: number;
  views?: { timestamp: string; count: number; uniques: number }[];
  clones?: { timestamp: string; count: number; uniques: number }[];
}

export interface Referrer {
  referrer: string;
  count: number;
  uniques: number;
}

export interface PopularPath {
  path: string;
  title: string;
  count: number;
  uniques: number;
}

// ── Calls ──────────────────────────────────────────────────────────────────

export async function getOwner(gh: GitHub, login: string): Promise<Owner> {
  return (await gh.get<Owner>(`/users/${encodeURIComponent(login)}`)).data;
}

/**
 * Every public repository the account owns. `/users/{login}/repos` serves
 * organisations as well as people, and only ever lists public repos, which is
 * exactly the set an open-source tracker is about.
 */
export async function listRepos(gh: GitHub, login: string): Promise<Repo[]> {
  const out: Repo[] = [];
  for (let page = 1; page <= 50; page++) {
    const { data, link } = await gh.get<Repo[]>(
      `/users/${encodeURIComponent(login)}/repos?type=owner&per_page=100&page=${page}`,
    );
    out.push(...data.filter((r) => !r.private));
    if (!hasNext(link)) break;
  }
  return out;
}

export const STARGAZERS_PER_PAGE = 100;

/** One page of stargazers with the time each star was given. */
export async function stargazerPage(gh: GitHub, fullName: string, page: number) {
  const { data, link } = await gh.get<{ starred_at: string }[]>(
    `/repos/${fullName}/stargazers?per_page=${STARGAZERS_PER_PAGE}&page=${page}`,
    "application/vnd.github.star+json",
  );
  return { stars: data.map((s) => s.starred_at), last: lastPage(link) };
}

/**
 * Views, clones, referrers and pages for the trailing 14 days. Views go first
 * and alone: a token without write access is refused there, and asking for the
 * other three anyway would spend three calls per repo on the same refusal.
 */
export async function traffic(gh: GitHub, fullName: string) {
  const views = await gh.get<TrafficSeries>(`/repos/${fullName}/traffic/views`);
  const [clones, referrers, paths] = await Promise.all([
    gh.get<TrafficSeries>(`/repos/${fullName}/traffic/clones`),
    gh.get<Referrer[]>(`/repos/${fullName}/traffic/popular/referrers`),
    gh.get<PopularPath[]>(`/repos/${fullName}/traffic/popular/paths`),
  ]);
  return { views: views.data, clones: clones.data, referrers: referrers.data, paths: paths.data };
}
