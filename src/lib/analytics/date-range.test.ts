import { describe, expect, it } from "vitest";
import { resolveDateRange } from "./date-range";

describe("resolveDateRange", () => {
  it("resolves 'today' to today vs. yesterday, hourly interval", () => {
    const now = new Date(2026, 7, 7, 15, 30, 0);
    const range = resolveDateRange("today", now);

    expect(range.interval).toBe("hour");
    expect(range.current.start.toISOString().slice(0, 10)).toBe("2026-08-07");
    expect(range.current.end.toISOString().slice(0, 10)).toBe("2026-08-07");
    expect(range.previous.start.toISOString().slice(0, 10)).toBe("2026-08-06");
    expect(range.previous.end.toISOString().slice(0, 10)).toBe("2026-08-06");
  });

  it("resolves '7d' to the last 7 days vs. the 7 days before, daily interval", () => {
    const now = new Date(2026, 7, 7, 15, 30, 0);
    const range = resolveDateRange("7d", now);

    expect(range.interval).toBe("day");
    expect(range.current.start.getDate()).toBe(1);
    expect(range.current.end.getDate()).toBe(7);
    expect(range.previous.start.getDate()).toBe(25);
    expect(range.previous.start.getMonth()).toBe(6); // July
    expect(range.previous.end.getDate()).toBe(31);
    expect(range.previous.end.getMonth()).toBe(6); // July
  });

  it("resolves '30d' to a 30-day current period and a 30-day previous period immediately before it", () => {
    const now = new Date(2026, 7, 7, 15, 30, 0);
    const range = resolveDateRange("30d", now);

    const currentLengthMs =
      range.current.end.getTime() - range.current.start.getTime();
    const previousLengthMs =
      range.previous.end.getTime() - range.previous.start.getTime();

    expect(Math.round(currentLengthMs / (24 * 60 * 60 * 1000))).toBe(30);
    expect(Math.round(previousLengthMs / (24 * 60 * 60 * 1000))).toBe(30);
    expect(range.previous.end.getTime()).toBeLessThan(
      range.current.start.getTime(),
    );
  });
});
