import { describe, expect, it } from "vitest";
import { carryForward, dayRange, gained, rebuildStars, totalSeries } from "./history";

describe("rebuildStars", () => {
  it("works backwards from today's count and starts from zero when every star was read", () => {
    const { rows, since } = rebuildStars(
      4,
      ["2026-01-01T10:00:00Z", "2026-01-01T12:00:00Z", "2026-01-05T09:00:00Z", "2026-02-10T00:00:00Z"],
      true,
    );
    expect(rows).toEqual([
      { day: "2025-12-31", stars: 0 },
      { day: "2026-01-01", stars: 2 },
      { day: "2026-01-05", stars: 3 },
      { day: "2026-02-10", stars: 4 },
    ]);
    expect(since).toBe("2025-12-31");
  });

  it("keeps a partial read anchored to today's count, not to zero", () => {
    // 1,000 stars, but only the newest three were read.
    const { rows, since } = rebuildStars(1000, ["2026-03-01T00:00:00Z", "2026-03-02T00:00:00Z", "2026-03-02T05:00:00Z"], false);
    expect(rows).toEqual([
      { day: "2026-03-01", stars: 998 },
      { day: "2026-03-02", stars: 1000 },
    ]);
    expect(since).toBe("2026-03-01");
  });

  it("never goes negative when stars were removed after they were listed", () => {
    // The listing said 1, but two stargazers came back.
    const { rows } = rebuildStars(1, ["2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z"], true);
    expect(rows.every((r) => r.stars >= 0)).toBe(true);
  });

  it("has nothing to say about a repo without stars", () => {
    expect(rebuildStars(0, [], true)).toEqual({ rows: [], since: null });
  });
});

describe("carryForward", () => {
  it("fills gaps with the last known value and leaves the unknown past null", () => {
    const days = dayRange("2026-01-01", "2026-01-05");
    expect(carryForward([{ day: "2026-01-02", stars: 5 }, { day: "2026-01-04", stars: 7 }], days)).toEqual([null, 5, 5, 7, 7]);
  });

  it("seeds from a value before the range", () => {
    expect(carryForward([{ day: "2025-12-01", stars: 3 }], ["2026-01-01", "2026-01-02"])).toEqual([3, 3]);
  });
});

describe("totalSeries", () => {
  it("adds a new repo as a step without bending the past", () => {
    const days = dayRange("2026-01-01", "2026-01-03");
    const byRepo = new Map([
      ["a/one", [{ day: "2026-01-01", stars: 10 }]],
      ["a/two", [{ day: "2026-01-03", stars: 4 }]],
    ]);
    expect(totalSeries(byRepo, days)).toEqual([10, 10, 14]);
  });
});

describe("gained", () => {
  it("is the difference when the history reaches back", () => {
    expect(gained(12, 9, "2020-01-01T00:00:00Z", "2026-01-01")).toBe(3);
  });
  it("counts every star for a repo created inside the window", () => {
    expect(gained(12, null, "2026-01-03T00:00:00Z", "2026-01-01")).toBe(12);
  });
  it("is unknown for an older repo with no history that far back", () => {
    expect(gained(12, null, "2020-01-01T00:00:00Z", "2026-01-01")).toBeNull();
  });
});

describe("dayRange", () => {
  it("crosses month and year ends", () => {
    expect(dayRange("2025-12-30", "2026-01-02")).toEqual(["2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02"]);
  });
});
