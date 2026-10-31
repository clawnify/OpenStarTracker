import { describe, expect, it } from "vitest";
import { sample, timeTicks } from "./charts";
import { axisLabels } from "./format";

const labels = (first: string, last: string, width: number) => timeTicks(first, last, width).map((t) => t.label);

describe("timeTicks", () => {
  it("marks years on a span of several", () => {
    expect(labels("2021-09-14", "2026-10-31", 1124)).toEqual(["2022", "2023", "2024", "2025", "2026"]);
  });

  it("thins the years on a phone instead of dropping them", () => {
    expect(labels("2021-09-14", "2026-10-31", 234)).toEqual(["2022", "2024", "2026"]);
  });

  it("counts a span that starts on 1 January from that year", () => {
    expect(labels("2022-01-01", "2025-06-01", 1124)).toEqual(["2022", "2023", "2024", "2025"]);
  });

  it("marks months on a year, printing the year on January", () => {
    expect(labels("2025-11-01", "2026-10-31", 540)).toEqual(["Nov", "2026", "Mar", "May", "Jul", "Sep"]);
  });

  it("marks weeks on a month", () => {
    expect(labels("2026-10-02", "2026-10-31", 1124)).toEqual(["Oct 2", "Oct 9", "Oct 16", "Oct 23", "Oct 30"]);
  });

  it("falls back to the two ends, with their year, when no boundary fits", () => {
    expect(labels("2026-01-05", "2026-04-10", 100)).toEqual(["Jan 2026", "Apr 2026"]);
  });

  it("gives a single day one tick", () => {
    expect(labels("2026-10-31", "2026-10-31", 1124)).toEqual(["Oct 31"]);
  });
});

describe("sample", () => {
  it("keeps every index when they fit", () => {
    expect(sample(4, 10)).toEqual([0, 1, 2, 3]);
  });

  it("spreads the sample and keeps both ends", () => {
    expect(sample(1000, 3)).toEqual([0, 500, 999]);
  });
});

describe("axisLabels", () => {
  it("shortens thousands", () => {
    expect(axisLabels([0, 5000, 10000, 15000])).toEqual(["0", "5K", "10K", "15K"]);
    expect(axisLabels([12000, 12500, 13000])).toEqual(["12K", "12.5K", "13K"]);
  });

  it("writes ticks out when the short form would repeat", () => {
    expect(axisLabels([12950, 12960, 12970])).toEqual(["12,950", "12,960", "12,970"]);
  });
});
