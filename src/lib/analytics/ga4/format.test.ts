import { describe, expect, it } from "vitest";
import { alignSeries, formatBucketLabel, toIsoDate } from "./format";

describe("toIsoDate", () => {
  it("formats a Date as YYYY-MM-DD", () => {
    expect(toIsoDate(new Date("2026-08-07T15:30:00.000Z"))).toBe("2026-08-07");
  });
});

describe("formatBucketLabel", () => {
  it("formats a GA4 dateHour value (YYYYMMDDHH) as '12 AM'-style labels", () => {
    expect(formatBucketLabel("2026080700", "hour")).toBe("12 AM");
    expect(formatBucketLabel("2026080713", "hour")).toBe("1 PM");
  });

  it("formats a GA4 date value (YYYYMMDD) as 'Mon D' labels", () => {
    expect(formatBucketLabel("20260807", "day")).toBe("Aug 7");
  });
});

describe("alignSeries", () => {
  it("fills every calendar day in the period with 0, not just the days GA4 happened to return", () => {
    // GA4 omits zero-activity days entirely rather than returning a zero
    // row — a real 3-day period with only day 1 and day 3 active must
    // still produce 3 buckets, not 2.
    const current = new Map([
      ["20260801", 10],
      ["20260803", 20],
    ]);
    const previous = new Map([["20260725", 5]]);

    const result = alignSeries(
      current,
      previous,
      { start: new Date(2026, 7, 1), end: new Date(2026, 7, 3) },
      { start: new Date(2026, 6, 25), end: new Date(2026, 6, 25) },
      "day",
    );

    expect(result).toEqual([
      { date: "Aug 1", currentPeriod: 10, previousPeriod: 5 },
      { date: "Aug 2", currentPeriod: 0, previousPeriod: 0 },
      { date: "Aug 3", currentPeriod: 20, previousPeriod: 0 },
    ]);
  });

  it("groups every 7 calendar days into one week-bucket, summing values and labeling by the first day", () => {
    const currentMap = new Map<string, number>();
    const previousMap = new Map<string, number>();
    // 9 consecutive days: 20260701 .. 20260709
    for (let i = 0; i < 9; i++) {
      const day = String(i + 1).padStart(2, "0");
      currentMap.set(`202607${day}`, 10);
      previousMap.set(`202607${day}`, 5);
    }

    const result = alignSeries(
      currentMap,
      previousMap,
      { start: new Date(2026, 6, 1), end: new Date(2026, 6, 9) },
      { start: new Date(2026, 6, 1), end: new Date(2026, 6, 9) },
      "week",
    );

    // 9 days -> ceil(9/7) = 2 week-buckets: [day1..day7], [day8..day9]
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      date: "Jul 1",
      currentPeriod: 70,
      previousPeriod: 35,
    });
    expect(result[1]).toEqual({
      date: "Jul 8",
      currentPeriod: 20,
      previousPeriod: 10,
    });
  });

  it("does not let scattered zero-activity days drift week-bucket boundaries away from real calendar weeks", () => {
    // Regression test for the bug this fix addresses: 21 real calendar
    // days with a few gaps scattered through them must still produce
    // exactly 3 week-buckets, each labeled by its TRUE calendar-week start
    // date — not compacted/shifted by the missing days.
    const currentMap = new Map<string, number>();
    const skipDays = new Set([3, 10, 17]); // one gap per week, at different offsets
    for (let i = 0; i < 21; i++) {
      if (skipDays.has(i)) continue;
      const day = String(i + 1).padStart(2, "0");
      currentMap.set(`202607${day}`, 1);
    }

    const result = alignSeries(
      currentMap,
      new Map(),
      { start: new Date(2026, 6, 1), end: new Date(2026, 6, 21) },
      { start: new Date(2026, 6, 1), end: new Date(2026, 6, 21) },
      "week",
    );

    expect(result).toHaveLength(3);
    expect(result.map((bucket) => bucket.date)).toEqual([
      "Jul 1",
      "Jul 8",
      "Jul 15",
    ]);
    // Each week had 7 real calendar days, one of them zero-activity ->
    // 6 real days summing to 6 (real days each worth 1).
    expect(result.map((bucket) => bucket.currentPeriod)).toEqual([6, 6, 6]);
  });

  it("fills a full 24-hour day even when GA4 only returned a couple of active hours", () => {
    const current = new Map([["2026080109", 5]]);

    const result = alignSeries(
      current,
      new Map(),
      { start: new Date(2026, 7, 1), end: new Date(2026, 7, 1) },
      { start: new Date(2026, 7, 1), end: new Date(2026, 7, 1) },
      "hour",
    );

    expect(result).toHaveLength(24);
    expect(result[9]).toEqual({
      date: "9 AM",
      currentPeriod: 5,
      previousPeriod: 0,
    });
    expect(result[0]).toEqual({
      date: "12 AM",
      currentPeriod: 0,
      previousPeriod: 0,
    });
  });
});
