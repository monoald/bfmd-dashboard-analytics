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
  it("pairs sorted current and previous buckets positionally and fills gaps with 0", () => {
    const current = new Map([["20260801", 10], ["20260802", 20]]);
    const previous = new Map([["20260725", 5]]);

    const result = alignSeries(current, previous, "day");

    expect(result).toEqual([
      { date: "Aug 1", currentPeriod: 10, previousPeriod: 5 },
      { date: "Aug 2", currentPeriod: 20, previousPeriod: 0 },
    ]);
  });
});
