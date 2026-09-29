// Screens are addressed by URL, so the dashboard's deep links (`?at=/repos/x/y`)
// and its reload-restore land on the right screen, and back works.

import type { Sort } from "./api";

export type Route =
  | { view: "overview" }
  | { view: "repos"; sort: Sort }
  | { view: "repo"; fullName: string }
  | { view: "traffic" }
  | { view: "settings" };

const SORTS: Sort[] = ["stars", "gained_7d", "gained_30d", "views", "clones", "forks", "pushed", "name"];

export function routeFromPath(pathname: string, search: string): Route {
  const path = pathname.replace(/\/+$/, "") || "/";
  const repo = path.match(/^\/repos\/([^/]+)\/([^/]+)$/);
  if (repo) return { view: "repo", fullName: `${decodeURIComponent(repo[1]!)}/${decodeURIComponent(repo[2]!)}` };
  if (path === "/repos") {
    const sort = new URLSearchParams(search).get("sort") as Sort | null;
    return { view: "repos", sort: sort && SORTS.includes(sort) ? sort : "stars" };
  }
  if (path === "/traffic") return { view: "traffic" };
  if (path === "/settings") return { view: "settings" };
  return { view: "overview" };
}

export function pathFor(route: Route): string {
  switch (route.view) {
    case "overview":
      return "/";
    case "repos":
      return route.sort === "stars" ? "/repos" : `/repos?sort=${route.sort}`;
    case "repo":
      return `/repos/${route.fullName}`;
    case "traffic":
      return "/traffic";
    case "settings":
      return "/settings";
  }
}
