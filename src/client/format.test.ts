import { describe, expect, it } from "vitest";
import { delta, num, relative } from "./format";

describe("format", () => {
  it("keeps small numbers exact and compacts large ones", () => {
    expect(num(1234)).toBe("1,234");
    expect(num(12345)).toBe("12.3K");
    expect(num(null)).toBe("—");
  });
  it("signs deltas and says when one is unknown", () => {
    expect(delta(5)).toBe("+5");
    expect(delta(-3)).toBe("−3");
    expect(delta(0)).toBe("0");
    expect(delta(null)).toBe("—");
  });
  it("reads SQLite's zoneless timestamps as UTC", () => {
    const now = Date.parse("2026-01-01T12:00:00Z");
    expect(relative("2026-01-01 11:55:00", now)).toBe("5 minutes ago");
    expect(relative("2026-01-02T12:00:00Z", now)).toBe("tomorrow");
  });
});
