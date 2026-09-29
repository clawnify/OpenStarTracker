import { describe, expect, it } from "vitest";
import { github, GitHubError, hasNext, lastPage } from "./github";
import { chunkRows } from "./sql";

describe("Link header", () => {
  const link =
    '<https://api.github.com/repositories/1/stargazers?per_page=100&page=2>; rel="next", <https://api.github.com/repositories/1/stargazers?per_page=100&page=7>; rel="last"';
  it("finds the last page", () => expect(lastPage(link)).toBe(7));
  it("knows when there is a next page", () => expect(hasNext(link)).toBe(true));
  it("handles a single page", () => {
    expect(lastPage(null)).toBeNull();
    expect(hasNext(null)).toBe(false);
  });
});

describe("github()", () => {
  it("names the reset time when the hourly budget is spent", async () => {
    const fetcher = async () =>
      new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
        status: 403,
        headers: { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(Date.UTC(2026, 0, 1, 14, 5) / 1000) },
      });
    const gh = github("t", fetcher as typeof fetch);
    const err = await gh.get("/x").catch((e) => e);
    expect(err).toBeInstanceOf(GitHubError);
    expect(err.resetAt?.toISOString()).toBe("2026-01-01T14:05:00.000Z");
    expect(err.message).toContain("14:05 UTC");
  });

  it("does not treat a permission refusal as a rate limit", async () => {
    const fetcher = async () =>
      new Response(JSON.stringify({ message: "Must have push access to repository" }), {
        status: 403,
        headers: { "X-RateLimit-Remaining": "4000" },
      });
    const err = await github("t", fetcher as typeof fetch).get("/x").catch((e) => e);
    expect(err.resetAt).toBeNull();
    expect(err.status).toBe(403);
  });

  it("sends the token only when there is one, and counts calls", async () => {
    const seen: (string | null)[] = [];
    const fetcher = async (_: string, init: RequestInit) => {
      seen.push(new Headers(init.headers).get("Authorization"));
      return new Response("[]", { status: 200 });
    };
    const anon = github(undefined, fetcher as unknown as typeof fetch);
    await anon.get("/a");
    const authed = github("abc", fetcher as unknown as typeof fetch);
    await authed.get("/b");
    await authed.get("/c");
    expect(seen).toEqual([null, "Bearer abc", "Bearer abc"]);
    expect(authed.calls).toBe(2);
  });
});

describe("chunkRows", () => {
  it("keeps every statement under D1's 100 bound parameters", () => {
    const rows = Array.from({ length: 65 }, (_, i) => [i]);
    for (const cols of [4, 6, 7, 15]) {
      const chunks = chunkRows(rows, cols);
      expect(chunks.flat()).toHaveLength(65);
      expect(Math.max(...chunks.map((c) => c.length * cols))).toBeLessThanOrEqual(90);
    }
  });
});
