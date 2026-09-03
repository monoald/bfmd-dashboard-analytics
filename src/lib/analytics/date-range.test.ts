import { describe, expect, it } from "vitest";
import {
  resolveDateRange,
  resolveRangeKeyParam,
  resolveCustomRange,
  resolveCustomRangeParams,
  resolveRangeSelection,
  buildRangeQueryParams,
} from "./date-range";

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

describe("resolveRangeKeyParam", () => {
  it("returns the param when it's a valid DateRangeKey", () => {
    expect(resolveRangeKeyParam("7d")).toBe("7d");
    expect(resolveRangeKeyParam("30d")).toBe("30d");
    expect(resolveRangeKeyParam("today")).toBe("today");
  });

  it("falls back to 'today' for an invalid or missing param", () => {
    expect(resolveRangeKeyParam("bogus")).toBe("today");
    expect(resolveRangeKeyParam(undefined)).toBe("today");
  });
});

describe("resolveDateRange — new named presets", () => {
  const now = new Date(2026, 7, 7, 15, 30, 0); // Aug 7, 2026

  it("resolves 'yesterday' to the single day before now, hourly interval", () => {
    const range = resolveDateRange("yesterday", now);

    expect(range.interval).toBe("hour");
    expect(range.current.start.toISOString().slice(0, 10)).toBe("2026-08-06");
    expect(range.current.end.toISOString().slice(0, 10)).toBe("2026-08-06");
    expect(range.previous.start.toISOString().slice(0, 10)).toBe("2026-08-05");
  });

  it("resolves 'mtd' to the 1st of the month through now, comparing to the same day-of-month in the previous month", () => {
    const range = resolveDateRange("mtd", now);

    expect(range.interval).toBe("day");
    expect(range.current.start.getDate()).toBe(1);
    expect(range.current.start.getMonth()).toBe(7); // August
    expect(range.current.end.getDate()).toBe(7);
    expect(range.previous.start.getDate()).toBe(1);
    expect(range.previous.start.getMonth()).toBe(6); // July
    expect(range.previous.end.getDate()).toBe(7);
    expect(range.previous.end.getMonth()).toBe(6); // July
  });

  it("resolves 'last-month' to the entire previous calendar month vs. the month before that", () => {
    const range = resolveDateRange("last-month", now);

    expect(range.interval).toBe("day");
    expect(range.current.start.getDate()).toBe(1);
    expect(range.current.start.getMonth()).toBe(6); // July
    expect(range.current.end.getDate()).toBe(31); // July has 31 days
    expect(range.current.end.getMonth()).toBe(6);
    expect(range.previous.start.getDate()).toBe(1);
    expect(range.previous.start.getMonth()).toBe(5); // June
    expect(range.previous.end.getDate()).toBe(30); // June has 30 days
    expect(range.previous.end.getMonth()).toBe(5);
  });

  it("resolves 'ytd' to Jan 1 through now, comparing to the same span last year, and picks 'week' once the span exceeds 60 days", () => {
    const range = resolveDateRange("ytd", now);

    expect(range.interval).toBe("week"); // Jan 1 - Aug 7 is well over 60 days
    expect(range.current.start.getFullYear()).toBe(2026);
    expect(range.current.start.getMonth()).toBe(0);
    expect(range.current.start.getDate()).toBe(1);
    expect(range.previous.start.getFullYear()).toBe(2025);
    expect(range.previous.end.getFullYear()).toBe(2025);
    expect(range.previous.end.getMonth()).toBe(7); // August
    expect(range.previous.end.getDate()).toBe(7);
  });

  it("resolves 'last-year' to the entire previous calendar year vs. the year before that", () => {
    const range = resolveDateRange("last-year", now);

    expect(range.interval).toBe("week");
    expect(range.current.start.getFullYear()).toBe(2025);
    expect(range.current.start.getMonth()).toBe(0);
    expect(range.current.start.getDate()).toBe(1);
    expect(range.current.end.getFullYear()).toBe(2025);
    expect(range.current.end.getMonth()).toBe(11);
    expect(range.current.end.getDate()).toBe(31);
    expect(range.previous.start.getFullYear()).toBe(2024);
    expect(range.previous.end.getFullYear()).toBe(2024);
  });

  it("resolves '90d' to a 90-day current period and a 90-day previous period, week interval", () => {
    const range = resolveDateRange("90d", now);

    const currentLengthMs =
      range.current.end.getTime() - range.current.start.getTime();
    expect(Math.round(currentLengthMs / (24 * 60 * 60 * 1000))).toBe(90);
    expect(range.interval).toBe("week");
    expect(range.previous.end.getTime()).toBeLessThan(
      range.current.start.getTime(),
    );
  });

  it("throws if asked to resolve 'custom' — callers must use resolveCustomRange instead", () => {
    expect(() => resolveDateRange("custom", now)).toThrow();
  });

  it("clamps month-end dates correctly for 'mtd' when now is Mar 31 — previous month ends on Feb 28, not rolled forward", () => {
    const mar31 = new Date(2026, 2, 31); // March 31, 2026
    const range = resolveDateRange("mtd", mar31);

    // Current period: Mar 1 - Mar 31
    expect(range.current.start.getMonth()).toBe(2); // March
    expect(range.current.start.getDate()).toBe(1);
    expect(range.current.end.getDate()).toBe(31);

    // Previous period: Feb 1 - Feb 28 (not rolled forward to Mar 2/3)
    expect(range.previous.start.getMonth()).toBe(1); // February
    expect(range.previous.start.getDate()).toBe(1);
    expect(range.previous.end.getMonth()).toBe(1); // February
    expect(range.previous.end.getDate()).toBe(28); // Clamped, not rolled
  });

  it("clamps leap-year dates correctly for 'ytd' when now is Feb 29 in a leap year — previous year ends on Feb 28 in non-leap year", () => {
    const feb29_2028 = new Date(2028, 1, 29); // February 29, 2028 (leap year)
    const range = resolveDateRange("ytd", feb29_2028);

    // Current period: Jan 1 - Feb 29, 2028
    expect(range.current.start.getFullYear()).toBe(2028);
    expect(range.current.start.getMonth()).toBe(0); // January
    expect(range.current.end.getMonth()).toBe(1); // February
    expect(range.current.end.getDate()).toBe(29);

    // Previous period: Jan 1, 2027 - Feb 28, 2027 (2027 is not a leap year)
    expect(range.previous.start.getFullYear()).toBe(2027);
    expect(range.previous.start.getMonth()).toBe(0); // January
    expect(range.previous.end.getFullYear()).toBe(2027);
    expect(range.previous.end.getMonth()).toBe(1); // February
    expect(range.previous.end.getDate()).toBe(28); // Clamped, not rolled
  });
});

describe("resolveCustomRange", () => {
  it("resolves an arbitrary start/end into a current period, with an equal-length previous period immediately before it", () => {
    // resolveCustomRange expects EST-pinned day markers, as produced by
    // resolveCustomRangeParams — not arbitrary local-midnight Dates.
    const { start, end } = resolveCustomRangeParams(
      "2026-07-01",
      "2026-07-15",
    )!;
    const range = resolveCustomRange(start, end);

    expect(range.key).toBe("custom");
    // EST midnight Jul 1 = 05:00 UTC Jul 1; EST end-of-day Jul 15
    // (23:59:59.999 EST) = 04:59:59.999 UTC Jul 16 — one UTC calendar day
    // later, since EST end-of-day instants always fall after UTC midnight.
    expect(range.current.start.getTime()).toBe(Date.UTC(2026, 6, 1, 5));
    expect(range.current.end.getTime()).toBe(Date.UTC(2026, 6, 16, 5) - 1);
    // current span is 15 days (Jul 1 - Jul 15 inclusive), so previous should
    // end right before current starts and be the same length
    expect(range.previous.end.getTime()).toBeLessThan(
      range.current.start.getTime(),
    );
    const currentSpanMs =
      range.current.end.getTime() - range.current.start.getTime();
    const previousSpanMs =
      range.previous.end.getTime() - range.previous.start.getTime();
    expect(previousSpanMs).toBe(currentSpanMs);
  });

  it("picks interval by span length, same rule as resolveDateRange", () => {
    const shortRange = resolveCustomRange(
      new Date(2026, 6, 1),
      new Date(2026, 6, 5),
    );
    expect(shortRange.interval).toBe("day");

    const longRange = resolveCustomRange(
      new Date(2026, 0, 1),
      new Date(2026, 6, 1),
    );
    expect(longRange.interval).toBe("week");
  });

  it("keeps the previous period's calendar-day count equal to the current period's, exactly", () => {
    const { start, end } = resolveCustomRangeParams(
      "2026-07-01",
      "2026-07-15",
    )!;
    const range = resolveCustomRange(start, end);
    // current: Jul 1 - Jul 15 inclusive = 15 calendar days, so previous is
    // Jun 16 - Jun 30 (EST midnight to EST end-of-day, i.e. right before
    // current.start).
    expect(range.previous.start.getTime()).toBe(Date.UTC(2026, 5, 16, 5));
    expect(range.previous.end.getTime()).toBe(Date.UTC(2026, 6, 1, 5) - 1);
  });
});

describe("resolveRangeKeyParam — new keys", () => {
  it("recognizes every new named preset key", () => {
    for (const key of [
      "yesterday",
      "mtd",
      "last-month",
      "ytd",
      "last-year",
      "90d",
      "custom",
    ]) {
      expect(resolveRangeKeyParam(key)).toBe(key);
    }
  });
});

describe("resolveCustomRangeParams", () => {
  it("parses two valid YYYY-MM-DD strings", () => {
    const result = resolveCustomRangeParams("2026-07-01", "2026-07-15");
    expect(result).not.toBeNull();
    // Asserted via UTC getters since these Dates are EST-pinned (UTC-5)
    // instants, independent of whatever timezone the test runner is in.
    expect(result!.start.getUTCFullYear()).toBe(2026);
    expect(result!.start.getUTCMonth()).toBe(6);
    expect(result!.start.getUTCDate()).toBe(1);
    expect(result!.end.getUTCDate()).toBe(15);
  });

  it("returns null when either param is missing", () => {
    expect(resolveCustomRangeParams(undefined, "2026-07-15")).toBeNull();
    expect(resolveCustomRangeParams("2026-07-01", undefined)).toBeNull();
  });

  it("returns null for unparseable dates", () => {
    expect(resolveCustomRangeParams("not-a-date", "2026-07-15")).toBeNull();
  });

  it("returns null when start is after end", () => {
    expect(resolveCustomRangeParams("2026-07-15", "2026-07-01")).toBeNull();
  });

  it("returns null for invalid calendar dates that JS silently normalizes", () => {
    // Feb 30 doesn't exist; JS silently rolls it to Mar 2
    expect(resolveCustomRangeParams("2026-02-30", "2026-03-05")).toBeNull();
  });

  it("returns null when the span exceeds 366 days", () => {
    expect(resolveCustomRangeParams("2020-01-01", "2026-01-01")).toBeNull();
  });

  it("accepts a span of exactly 366 days", () => {
    expect(resolveCustomRangeParams("2028-01-01", "2029-01-01")).not.toBeNull();
  });
});

describe("resolveRangeSelection", () => {
  it("returns the named key with no customRange for non-custom keys, ignoring any start/end params", () => {
    const result = resolveRangeSelection("7d", "2026-07-01", "2026-07-15");
    expect(result).toEqual({ rangeKey: "7d", customRange: null });
  });

  it("returns the parsed customRange when range=custom and start/end are valid", () => {
    const result = resolveRangeSelection("custom", "2026-07-01", "2026-07-15");
    expect(result.rangeKey).toBe("custom");
    expect(result.customRange).not.toBeNull();
    expect(result.customRange!.start.getDate()).toBe(1);
    expect(result.customRange!.end.getDate()).toBe(15);
  });

  it("falls back to 'today' with no customRange when range=custom but start/end are missing or invalid", () => {
    expect(resolveRangeSelection("custom", undefined, undefined)).toEqual({
      rangeKey: "today",
      customRange: null,
    });
    expect(resolveRangeSelection("custom", "bogus", "2026-07-15")).toEqual({
      rangeKey: "today",
      customRange: null,
    });
  });
});

describe("buildRangeQueryParams", () => {
  it("builds a plain range param for named keys", () => {
    expect(buildRangeQueryParams("7d")).toBe("range=7d");
    expect(buildRangeQueryParams("yesterday")).toBe("range=yesterday");
  });

  it("builds range+start+end for a custom range", () => {
    const result = buildRangeQueryParams("custom", {
      start: new Date(2026, 6, 1),
      end: new Date(2026, 6, 15),
    });
    expect(result).toBe("range=custom&start=2026-07-01&end=2026-07-15");
  });

  it("falls back to a plain range param if rangeKey is 'custom' but no customRange is given", () => {
    expect(buildRangeQueryParams("custom")).toBe("range=custom");
  });
});
