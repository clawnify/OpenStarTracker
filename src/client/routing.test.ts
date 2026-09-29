import { describe, expect, it } from "vitest";
import { pathFor, routeFromPath } from "./routing";

describe("routing", () => {
  it("opens the screen a deep link names", () => {
    expect(routeFromPath("/repos/clawnify/OpenCRM", "")).toEqual({ view: "repo", fullName: "clawnify/OpenCRM" });
    expect(routeFromPath("/traffic/", "")).toEqual({ view: "traffic" });
    expect(routeFromPath("/repos", "?sort=gained_7d")).toEqual({ view: "repos", sort: "gained_7d" });
  });

  it("falls back instead of failing on something it does not know", () => {
    expect(routeFromPath("/nope", "")).toEqual({ view: "overview" });
    expect(routeFromPath("/repos", "?sort=evil")).toEqual({ view: "repos", sort: "stars" });
  });

  it("round-trips", () => {
    for (const p of ["/", "/repos", "/repos?sort=views", "/repos/a/b", "/traffic", "/settings"]) {
      const [path, q = ""] = p.split("?");
      expect(pathFor(routeFromPath(path!, q ? `?${q}` : ""))).toBe(p);
    }
  });
});
