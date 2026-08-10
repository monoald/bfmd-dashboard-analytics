# Custom Date Range Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 4th "Custom" chip to the dashboard's date filter (next to Today / Last 7 Days / Last 30 Days) that opens a popover with 6 named calendar presets (Yesterday, Month to date, Last month, Year to date, Last year, Last 90 days) plus a two-month calendar for an arbitrary custom range, all styled with this app's existing dark-navy/teal theme.

**Architecture:** Extend `DateRangeKey`/`ResolvedDateRange` to cover the new presets and a `"custom"` variant carrying explicit start/end dates. Generalize the two places that currently hardcode a 3-way range switch (mock data bucket generation, GA4 bucket alignment) to derive bucket count/labels from the resolved range's actual span instead. Add a new `CustomDateRangePicker` client component using Base UI's `Popover` (already a dependency) and a newly-added `react-day-picker` for the calendar grid.

Full design context: `docs/superpowers/specs/2026-08-10-custom-date-range-picker-design.md`.

## Global Constraints

- The existing 3 chips (Today, Last 7 Days, Last 30 Days) keep their exact current behavior and appearance — this plan only adds a 4th chip and its popover.
- Every named preset's "previous period" is an equal-length (or equal-calendar-unit) window immediately preceding its current period, matching how `today`/`7d`/`30d` already work — no new UI for configuring the comparison period separately.
- `interval` on `ResolvedDateRange` gains `"week"` alongside `"hour"`/`"day"`. The rule (span-based, not key-based): `<= 1` day span → `"hour"`, `> 60` days → `"week"`, otherwise `"day"`. This must be a single shared function, not duplicated per-preset logic.
- No changes to WooCommerce/GA4 fetcher *dimension-selection* logic. GA4's existing `interval === "hour" ? "dateHour" : "date"` ternary already defaults to `"date"` for any non-hour interval, including the new `"week"` value — week-level aggregation happens by grouping the (already-daily) aligned series in `ga4/format.ts`, not by requesting a different GA4 dimension. Do not add a `"yearWeek"` GA4 dimension or similar — that is explicitly out of scope and unnecessary.
- Every range (including custom) must be shareable via URL: `?range=<key>` for named presets/existing keys, `?range=custom&start=YYYY-MM-DD&end=YYYY-MM-DD` for custom ranges.
- `react-day-picker` was published as a new major version (v10) very recently, with `classNames` keys renamed from the v8/v9 API most tutorials and training data describe (e.g. `table` → `month_grid`, `day_selected` → `selected`, `nav_button` → `button_previous`/`button_next`). Before writing any DayPicker JSX, the implementing task must read the actually-installed package's type definitions (or `https://daypicker.dev`) rather than reusing remembered v8-style prop or classNames names. This is called out explicitly in that task, not assumed.
- Follow the project's existing verification loop for every task: `npx tsc --noEmit` → relevant `npm test` scope → full `npm test` → `npm run lint` → `npx prettier --write` on touched files → `npm run build`. The UI task (5) and wiring task (6) additionally require a dev-server + Playwright visual/interaction check (start the server, verify, kill it, delete temp files — this project has no dev server left running between turns).

---

### Task 1: Extend date-range types and resolution logic

**Files:**
- Modify: `src/lib/analytics/types.ts`
- Modify: `src/lib/analytics/date-range.ts`
- Modify: `src/lib/analytics/date-range.test.ts`
- Modify: `src/lib/analytics/format.ts` (add `formatShortDate`; this file already exists from the report-detail-pages feature with `formatCurrency`/`formatPercent`)
- Modify: `src/lib/analytics/format.test.ts`

**Interfaces:**
- Produces: `DateRangeKey` extended with `"yesterday" | "mtd" | "last-month" | "ytd" | "last-year" | "90d" | "custom"`. `ResolvedDateRange.interval` extended with `"week"`.
- Produces: `resolveDateRange(key, now)` handles all new named presets; throws if called with `"custom"` (custom ranges don't have a `now`-relative resolution — use the next function instead).
- Produces: `resolveCustomRange(start: Date, end: Date): ResolvedDateRange`.
- Produces: `resolveRangeKeyParam(range)` recognizes all new keys (unchanged behavior for existing ones).
- Produces: `resolveCustomRangeParams(start: string | undefined, end: string | undefined): { start: Date; end: Date } | null` — parses two `YYYY-MM-DD` strings, returns `null` on missing/invalid/out-of-order input.
- Produces: `resolveRangeSelection(range, start, end): { rangeKey: DateRangeKey; customRange: { start: Date; end: Date } | null }` — the single entry point later tasks use: resolves the key, and if it's `"custom"`, resolves+validates the custom bounds, falling back the whole selection to `"today"` if they're missing/invalid.
- Produces: `buildRangeQueryParams(rangeKey, customRange?): string` — e.g. `"range=7d"` or `"range=custom&start=2026-07-01&end=2026-07-15"`.
- Produces: `formatShortDate(date: Date): string` in `format.ts` — e.g. `"Aug 9, 2026"`.
- Consumes: `toIsoDate` from `./ga4/format` (already exists) for `buildRangeQueryParams`'s date serialization.

- [ ] **Step 1: Extend the types**

In `src/lib/analytics/types.ts`, change:

```ts
export type DateRangeKey = "today" | "7d" | "30d";
```

to:

```ts
export type DateRangeKey =
  | "today"
  | "7d"
  | "30d"
  | "yesterday"
  | "mtd"
  | "last-month"
  | "ytd"
  | "last-year"
  | "90d"
  | "custom";
```

and change:

```ts
export interface ResolvedDateRange {
  key: DateRangeKey;
  interval: "hour" | "day";
  current: PeriodBounds;
  previous: PeriodBounds;
}
```

to:

```ts
export interface ResolvedDateRange {
  key: DateRangeKey;
  interval: "hour" | "day" | "week";
  current: PeriodBounds;
  previous: PeriodBounds;
}
```

- [ ] **Step 2: Write the failing tests for the new date-range.ts functions**

Read `src/lib/analytics/date-range.test.ts` first (it currently tests `resolveDateRange` for today/7d/30d and `resolveRangeKeyParam`). Add these `describe` blocks, and extend the top import line to also import `resolveCustomRange`, `resolveCustomRangeParams`, `resolveRangeSelection`, and `buildRangeQueryParams` from `./date-range`:

```ts
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
});

describe("resolveCustomRange", () => {
  it("resolves an arbitrary start/end into a current period, with an equal-length previous period immediately before it", () => {
    const range = resolveCustomRange(
      new Date(2026, 6, 1),
      new Date(2026, 6, 15),
    );

    expect(range.key).toBe("custom");
    expect(range.current.start.getDate()).toBe(1);
    expect(range.current.start.getMonth()).toBe(6);
    expect(range.current.end.getDate()).toBe(15);
    expect(range.current.end.getMonth()).toBe(6);
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
    expect(result!.start.getFullYear()).toBe(2026);
    expect(result!.start.getMonth()).toBe(6);
    expect(result!.start.getDate()).toBe(1);
    expect(result!.end.getDate()).toBe(15);
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- date-range.test.ts`
Expected: FAIL — none of the new functions/keys exist yet.

- [ ] **Step 4: Implement the new date-range.ts logic**

Replace the full contents of `src/lib/analytics/date-range.ts` with:

```ts
import { toIsoDate } from "./ga4/format";
import type { DateRangeKey, PeriodBounds, ResolvedDateRange } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_INTERVAL_THRESHOLD_DAYS = 60;

function startOfDay(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  );
}

function endOfDay(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  );
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// Same day-of-month in a different year/month, clamped to that month's
// length (e.g. day 31 in a 30-day month becomes day 30; Feb 29 in a
// non-leap year becomes Feb 28).
function clampedDate(year: number, month: number, day: number): Date {
  return new Date(year, month, Math.min(day, daysInMonth(year, month)));
}

function pickInterval(current: PeriodBounds): "hour" | "day" | "week" {
  const spanDays = Math.round(
    (current.end.getTime() - current.start.getTime()) / DAY_MS,
  );
  if (spanDays <= 1) return "hour";
  if (spanDays > WEEK_INTERVAL_THRESHOLD_DAYS) return "week";
  return "day";
}

function buildRange(
  key: DateRangeKey,
  current: PeriodBounds,
  previous: PeriodBounds,
): ResolvedDateRange {
  return { key, interval: pickInterval(current), current, previous };
}

export function resolveDateRange(
  key: DateRangeKey,
  now: Date,
): ResolvedDateRange {
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  if (key === "today") {
    return buildRange(
      key,
      { start: todayStart, end: todayEnd },
      {
        start: new Date(todayStart.getTime() - DAY_MS),
        end: new Date(todayEnd.getTime() - DAY_MS),
      },
    );
  }

  if (key === "yesterday") {
    const yesterdayStart = new Date(todayStart.getTime() - DAY_MS);
    const yesterdayEnd = new Date(todayEnd.getTime() - DAY_MS);
    return buildRange(
      key,
      { start: yesterdayStart, end: yesterdayEnd },
      {
        start: new Date(yesterdayStart.getTime() - DAY_MS),
        end: new Date(yesterdayEnd.getTime() - DAY_MS),
      },
    );
  }

  if (key === "7d" || key === "30d" || key === "90d") {
    const lengthDays = key === "7d" ? 7 : key === "30d" ? 30 : 90;
    const currentStart = startOfDay(
      new Date(todayEnd.getTime() - (lengthDays - 1) * DAY_MS),
    );
    const previousEnd = new Date(currentStart.getTime() - 1);
    const previousStart = startOfDay(
      new Date(previousEnd.getTime() - (lengthDays - 1) * DAY_MS),
    );
    return buildRange(
      key,
      { start: currentStart, end: todayEnd },
      { start: previousStart, end: previousEnd },
    );
  }

  if (key === "mtd") {
    const currentStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0,
      0,
    );
    const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousStart = new Date(
      previousMonthDate.getFullYear(),
      previousMonthDate.getMonth(),
      1,
      0,
      0,
      0,
      0,
    );
    const previousEnd = endOfDay(
      clampedDate(
        previousMonthDate.getFullYear(),
        previousMonthDate.getMonth(),
        now.getDate(),
      ),
    );
    return buildRange(
      key,
      { start: currentStart, end: todayEnd },
      { start: previousStart, end: previousEnd },
    );
  }

  if (key === "last-month") {
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const currentStart = new Date(
      lastMonthDate.getFullYear(),
      lastMonthDate.getMonth(),
      1,
      0,
      0,
      0,
      0,
    );
    const currentEnd = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
    const twoMonthsAgoDate = new Date(
      lastMonthDate.getFullYear(),
      lastMonthDate.getMonth() - 1,
      1,
    );
    const previousStart = new Date(
      twoMonthsAgoDate.getFullYear(),
      twoMonthsAgoDate.getMonth(),
      1,
      0,
      0,
      0,
      0,
    );
    const previousEnd = endOfDay(
      new Date(lastMonthDate.getFullYear(), lastMonthDate.getMonth(), 0),
    );
    return buildRange(
      key,
      { start: currentStart, end: currentEnd },
      { start: previousStart, end: previousEnd },
    );
  }

  if (key === "ytd") {
    const currentStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    const previousStart = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
    const previousEnd = endOfDay(
      clampedDate(now.getFullYear() - 1, now.getMonth(), now.getDate()),
    );
    return buildRange(
      key,
      { start: currentStart, end: todayEnd },
      { start: previousStart, end: previousEnd },
    );
  }

  if (key === "last-year") {
    const currentStart = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
    const currentEnd = endOfDay(new Date(now.getFullYear() - 1, 11, 31));
    const previousStart = new Date(now.getFullYear() - 2, 0, 1, 0, 0, 0, 0);
    const previousEnd = endOfDay(new Date(now.getFullYear() - 2, 11, 31));
    return buildRange(
      key,
      { start: currentStart, end: currentEnd },
      { start: previousStart, end: previousEnd },
    );
  }

  throw new Error(
    "resolveDateRange cannot resolve 'custom' — use resolveCustomRange(start, end) instead",
  );
}

export function resolveCustomRange(start: Date, end: Date): ResolvedDateRange {
  const current: PeriodBounds = {
    start: startOfDay(start),
    end: endOfDay(end),
  };
  const spanMs = current.end.getTime() - current.start.getTime();
  const previous: PeriodBounds = {
    start: new Date(current.start.getTime() - spanMs - 1),
    end: new Date(current.start.getTime() - 1),
  };
  return buildRange("custom", current, previous);
}

const VALID_RANGE_KEYS: DateRangeKey[] = [
  "today",
  "7d",
  "30d",
  "yesterday",
  "mtd",
  "last-month",
  "ytd",
  "last-year",
  "90d",
  "custom",
];

export function resolveRangeKeyParam(range: string | undefined): DateRangeKey {
  return VALID_RANGE_KEYS.includes(range as DateRangeKey)
    ? (range as DateRangeKey)
    : "today";
}

export function resolveCustomRangeParams(
  start: string | undefined,
  end: string | undefined,
): { start: Date; end: Date } | null {
  if (!start || !end) return null;
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null;
  }
  if (startDate.getTime() > endDate.getTime()) return null;
  return { start: startDate, end: endDate };
}

export interface ResolvedRangeSelection {
  rangeKey: DateRangeKey;
  customRange: { start: Date; end: Date } | null;
}

export function resolveRangeSelection(
  range: string | undefined,
  start: string | undefined,
  end: string | undefined,
): ResolvedRangeSelection {
  const rangeKey = resolveRangeKeyParam(range);
  if (rangeKey !== "custom") return { rangeKey, customRange: null };
  const customRange = resolveCustomRangeParams(start, end);
  return customRange
    ? { rangeKey: "custom", customRange }
    : { rangeKey: "today", customRange: null };
}

export function buildRangeQueryParams(
  rangeKey: DateRangeKey,
  customRange?: { start: Date; end: Date } | null,
): string {
  if (rangeKey === "custom" && customRange) {
    return `range=custom&start=${toIsoDate(customRange.start)}&end=${toIsoDate(customRange.end)}`;
  }
  return `range=${rangeKey}`;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- date-range.test.ts`
Expected: PASS (all tests, existing and new)

- [ ] **Step 6: Add `formatShortDate` to `format.ts`**

Read `src/lib/analytics/format.ts` first (it currently exports `formatCurrency`/`formatPercent`). Add a test to `format.test.ts`:

```ts
describe("formatShortDate", () => {
  it("formats a date as 'Mon D, YYYY'", () => {
    expect(formatShortDate(new Date(2026, 7, 9))).toBe("Aug 9, 2026");
  });
});
```

Run `npm test -- format.test.ts` to see it fail, then add to `format.ts`:

```ts
const SHORT_DATE_MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatShortDate(date: Date): string {
  return `${SHORT_DATE_MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}
```

Run `npm test -- format.test.ts` again to confirm it passes.

- [ ] **Step 7: Verify and commit**

```
npx tsc --noEmit
npm test
npm run lint
npx prettier --write src/lib/analytics/types.ts src/lib/analytics/date-range.ts src/lib/analytics/date-range.test.ts src/lib/analytics/format.ts src/lib/analytics/format.test.ts
npm run build
```

`npx tsc --noEmit` will likely surface errors in files that construct a `ResolvedDateRange` or switch over `interval`/`DateRangeKey` exhaustively elsewhere in the codebase (e.g. `ga4/format.ts`, `mock-data.ts`, `cache.ts`, `DashboardDateFilter.tsx`) — that's expected; those are fixed in later tasks. If `tsc` only fails in those specific files/lines (not in `date-range.ts`/`types.ts`/`format.ts` themselves), that's fine to leave for now; note it in your report. If it fails inside `date-range.ts`/`types.ts`/`format.ts` themselves, fix that before committing.

```bash
git add src/lib/analytics/types.ts src/lib/analytics/date-range.ts src/lib/analytics/date-range.test.ts src/lib/analytics/format.ts src/lib/analytics/format.test.ts
git commit -m "Extend DateRangeKey with 6 named presets and a custom range

Adds yesterday/mtd/last-month/ytd/last-year/90d plus an arbitrary
'custom' key carrying explicit start/end dates. interval gains 'week',
picked by a single span-based rule (<=1 day -> hour, >60 days -> week,
else day) shared by every preset including custom. resolveRangeSelection
is the new single entry point pages will use to resolve range+start+end
query params into a DateRangeKey and optional custom bounds."
```

---

### Task 2: Add week-bucket support to `ga4/format.ts` and widen WC/GA4 interval types

**Files:**
- Modify: `src/lib/analytics/ga4/format.ts`
- Modify: `src/lib/analytics/ga4/format.test.ts`
- Modify: `src/lib/analytics/ga4/sessions.ts` (type-only change)
- Modify: `src/lib/analytics/ga4/funnel.ts` (type-only change)
- Modify: `src/lib/analytics/woocommerce/revenue.ts` (type-only change)

**Interfaces:**
- Produces: `alignSeries(currentMap, previousMap, interval)` now accepts `interval: "hour" | "day" | "week"`. When `interval === "week"`, the function still builds the series from daily-keyed maps (GA4 is still queried at daily granularity — see Global Constraints) and groups every 7 consecutive aligned points into one, summing `currentPeriod`/`previousPeriod` and labeling the group by its first point's date.
- Produces: `formatBucketLabel(rawDate, interval)` widens its `interval` param type to `"hour" | "day" | "week"` — no new branch needed, since a `"week"` bucket's `rawDate` key is still a plain `YYYYMMDD` daily key (the *first* day of that week's group), which the existing non-hour branch already formats correctly.
- Consumes: nothing new.

**Important distinction between the GA4 and WooCommerce fetchers in this task:** GA4's fetchers (`sessions.ts`, `funnel.ts`) always request daily data and need `alignSeries` to do the weekly grouping client-side, as described above. `woocommerce/revenue.ts` is different: it passes `interval` straight through as a literal query parameter to WooCommerce's own `/wc-analytics/reports/revenue/stats` endpoint (`interval,` in the params object, `fetchRevenueStatsForPeriod`), which is documented to natively support `"week"` as a valid aggregation value and returns pre-aggregated weekly buckets itself. So `revenue.ts` needs *only* the type annotation widened — no grouping logic, since WooCommerce does the aggregation server-side. `normalize.ts`'s `salesOverTimeFrom`/`aovOverTimeFrom` zip `current.intervals[i]` with `previous.intervals[i]` by array index (not by date-matching like GA4's `alignSeries`), which continues to work unchanged as long as both periods return the same number of buckets — true here since current/previous are always equal-length.

- [ ] **Step 1: Read the current file**

Read `src/lib/analytics/ga4/format.ts` and `src/lib/analytics/ga4/format.test.ts` in full first.

- [ ] **Step 2: Write the failing test for week-grouping**

Add this to `ga4/format.test.ts` (matching its existing style — check the existing `describe("alignSeries", ...)` block and add a new `it` inside it, or a new `describe` if the file doesn't already group `alignSeries` tests together):

```ts
it("groups every 7 aligned daily buckets into one when interval is 'week', summing values and labeling by the first day", () => {
  const currentMap = new Map<string, number>();
  const previousMap = new Map<string, number>();
  // 9 consecutive days: 20260701 .. 20260709
  for (let i = 0; i < 9; i++) {
    const day = String(i + 1).padStart(2, "0");
    currentMap.set(`202607${day}`, 10);
    previousMap.set(`202607${day}`, 5);
  }

  const result = alignSeries(currentMap, previousMap, "week");

  // 9 days -> ceil(9/7) = 2 week-buckets: [day1..day7], [day8..day9]
  expect(result).toHaveLength(2);
  expect(result[0]).toEqual({ date: "Jul 1", currentPeriod: 70, previousPeriod: 35 });
  expect(result[1]).toEqual({ date: "Jul 8", currentPeriod: 20, previousPeriod: 10 });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -- ga4/format.test.ts`
Expected: FAIL — `alignSeries` doesn't group into weeks yet (and may not even accept `"week"` as a type yet, depending on how strict the test file's TS checking is at the `vitest` transpile step — either way, the assertions will fail).

- [ ] **Step 4: Implement week-grouping in `alignSeries`**

In `src/lib/analytics/ga4/format.ts`, widen `formatBucketLabel`'s and `alignSeries`'s `interval` parameter types from `"hour" | "day"` to `"hour" | "day" | "week"`. `formatBucketLabel`'s existing implementation needs no other change (its non-hour branch already handles a `YYYYMMDD` key correctly regardless of whether that key represents a day-bucket or the first day of a week-bucket).

Add a new helper and call it from `alignSeries`:

```ts
function groupIntoWeeks(series: TimeSeriesData[]): TimeSeriesData[] {
  const weeks: TimeSeriesData[] = [];
  for (let i = 0; i < series.length; i += 7) {
    const chunk = series.slice(i, i + 7);
    weeks.push({
      date: chunk[0].date,
      currentPeriod: chunk.reduce((sum, point) => sum + point.currentPeriod, 0),
      previousPeriod: chunk.reduce((sum, point) => sum + point.previousPeriod, 0),
    });
  }
  return weeks;
}
```

Change `alignSeries`'s final line from `return series;` to:

```ts
  return interval === "week" ? groupIntoWeeks(series) : series;
```

(The rest of `alignSeries`'s body — building `series` from the daily-keyed maps via `formatBucketLabel(labelSource, interval)` — needs its `interval` argument's call unaffected, since `formatBucketLabel` treats `"week"` identically to `"day"` for formatting purposes as noted above. Only the final grouping step is new.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- ga4/format.test.ts`
Expected: PASS (all tests, including the new one)

- [ ] **Step 6: Widen the two call sites' type annotations**

In `src/lib/analytics/ga4/sessions.ts`, find `async function fetchSessionsByBucket(period: PeriodBounds, interval: "hour" | "day")` and change the parameter type to `interval: "hour" | "day" | "week"`. Do not change anything else in that function — the existing `interval === "hour" ? "dateHour" : "date"` ternary already does the right thing for `"week"` (falls through to `"date"`, i.e. daily GA4 data, which `alignSeries` then groups).

In `src/lib/analytics/ga4/funnel.ts`, find `async function fetchRateByBucket(period: PeriodBounds, interval: "hour" | "day")` and make the identical type-only change.

- [ ] **Step 7: Widen `revenue.ts`'s interval type (WooCommerce — no grouping logic needed)**

In `src/lib/analytics/woocommerce/revenue.ts`, find `async function fetchRevenueStatsForPeriod(period: PeriodBounds, interval: "hour" | "day")` and change the parameter type to `interval: "hour" | "day" | "week"`. Do not change anything else in this file — `interval` is already forwarded as-is to the WooCommerce Analytics API's `interval` query parameter a few lines down, and WooCommerce handles the weekly aggregation itself server-side (see the "Important distinction" note above). This is a pure type-only change.

- [ ] **Step 8: Verify and commit**

```
npx tsc --noEmit
npm test
npm run lint
npx prettier --write src/lib/analytics/ga4/format.ts src/lib/analytics/ga4/format.test.ts src/lib/analytics/ga4/sessions.ts src/lib/analytics/ga4/funnel.ts src/lib/analytics/woocommerce/revenue.ts
npm run build
```

Same note as Task 1 Step 7 applies: `tsc` may still fail in `mock-data.ts`, `cache.ts`, or `DashboardDateFilter.tsx` (not yet updated) — only worry about errors inside the 5 files this task touches.

```bash
git add src/lib/analytics/ga4/format.ts src/lib/analytics/ga4/format.test.ts src/lib/analytics/ga4/sessions.ts src/lib/analytics/ga4/funnel.ts src/lib/analytics/woocommerce/revenue.ts
git commit -m "Support week-bucketed series for long date ranges

GA4 is still queried at daily granularity for every interval other than
hour; alignSeries now groups every 7 consecutive aligned daily buckets
into one (summed) when interval is 'week', so Last 90 days/Year to
date/Last year/long custom ranges render as readable weekly charts
instead of 90-365 daily points. WooCommerce's revenue/stats endpoint
natively supports a 'week' interval value server-side, so its fetcher
only needed its type annotation widened, not new grouping logic."
```

---

### Task 3: Generalize mock data bucket generation from the resolved range

**Files:**
- Modify: `src/lib/analytics/mock-data.ts`
- Modify: `src/lib/analytics/mock-data.test.ts`

**Interfaces:**
- Produces: `buildMockDashboardPayload(range: ResolvedDateRange): DashboardPayload` — **signature change** from `buildMockDashboardPayload(rangeKey: DateRangeKey)`. Callers now pass an already-resolved range instead of a bare key (Task 4 updates the one production call site).
- Consumes: `ResolvedDateRange` from `./types`.

- [ ] **Step 1: Read the current file**

Read `src/lib/analytics/mock-data.ts` and `src/lib/analytics/mock-data.test.ts` in full first — this task changes the function's public signature, so every existing test call site needs updating too.

- [ ] **Step 2: Update the tests to the new signature first**

In `mock-data.test.ts`, add `resolveDateRange` to its imports (`from "./date-range"`) and replace every call like `buildMockDashboardPayload("today")` with `buildMockDashboardPayload(resolveDateRange("today", NOW))`, where `NOW` is a fixed `const NOW = new Date(2026, 7, 7, 12, 0, 0);` declared once near the top of the file (the exact date doesn't matter to any existing assertion — they check lengths and relative values, not calendar dates — but a fixed `now` keeps the whole suite deterministic instead of depending on the real wall clock).

Apply this replacement to all existing calls (`"today"` → `resolveDateRange("today", NOW)`, `"7d"` → `resolveDateRange("7d", NOW)`, `"30d"` → `resolveDateRange("30d", NOW)`).

Then add two new tests, one for a new named preset and one for the week-interval path:

```ts
it("generates one bucket per day for a 'mtd' range matching its actual span, not a fixed count", () => {
  const range = resolveDateRange("mtd", NOW); // NOW is Aug 7 -> 7 days elapsed in August
  const payload = buildMockDashboardPayload(range);

  expect(payload.charts.salesOverTime).toHaveLength(7);
});

it("generates weekly buckets for a 'week' interval range", () => {
  const range = resolveDateRange("last-year", NOW);
  const payload = buildMockDashboardPayload(range);

  expect(range.interval).toBe("week");
  // A full year is ~52 weekly buckets; assert it's in a sane weekly-not-daily
  // ballpark rather than an exact count (leap years / week-boundary rounding
  // can shift it by one or two).
  expect(payload.charts.salesOverTime.length).toBeGreaterThan(45);
  expect(payload.charts.salesOverTime.length).toBeLessThan(60);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- mock-data.test.ts`
Expected: FAIL — `buildMockDashboardPayload` doesn't accept a `ResolvedDateRange` yet.

- [ ] **Step 4: Rewrite the bucket-generation logic in `mock-data.ts`**

Replace the `bucketLabels` function and the top of `buildMockDashboardPayload` as follows.

Remove the old `bucketLabels` function entirely:

```ts
function bucketLabels(rangeKey: DateRangeKey, now: Date): string[] {
  if (rangeKey === "today") {
    return Array.from({ length: 24 }, (_, hour) => hourLabel(hour));
  }
  const days = rangeKey === "7d" ? 7 : 30;
  return Array.from({ length: days }, (_, i) => dayLabel(days - 1 - i, now));
}
```

Replace it with:

```ts
function bucketStep(interval: ResolvedDateRange["interval"]): number {
  if (interval === "hour") return 60 * 60 * 1000;
  if (interval === "week") return 7 * 24 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

function bucketDates(range: ResolvedDateRange): Date[] {
  const step = bucketStep(range.interval);
  const dates: Date[] = [];
  for (
    let t = range.current.start.getTime();
    t <= range.current.end.getTime();
    t += step
  ) {
    dates.push(new Date(t));
  }
  return dates;
}

function bucketLabels(range: ResolvedDateRange): string[] {
  return bucketDates(range).map((date) =>
    range.interval === "hour"
      ? hourLabel(date.getHours())
      : `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`,
  );
}
```

The `dayLabel` function is now unused (its only caller was the old `bucketLabels`) — remove it too. `hourLabel` and `MONTH_NAMES` stay unchanged and are still used.

In `buildMockDashboardPayload`, change the signature and the two lines that used the old `bucketLabels`/`now`:

```ts
export function buildMockDashboardPayload(
  rangeKey: DateRangeKey,
): DashboardPayload {
  const now = new Date();
  const labels = bucketLabels(rangeKey, now);
  const perBucketBase =
    rangeKey === "today"
      ? { revenue: 2200, sessions: 220, orders: 5.5 }
      : { revenue: 9000, sessions: 750, orders: 22 };
```

becomes:

```ts
export function buildMockDashboardPayload(
  range: ResolvedDateRange,
): DashboardPayload {
  const labels = bucketLabels(range);
  const perBucketBase =
    range.interval === "hour"
      ? { revenue: 2200, sessions: 220, orders: 5.5 }
      : range.interval === "week"
        ? { revenue: 9000 * 7, sessions: 750 * 7, orders: 22 * 7 }
        : { revenue: 9000, sessions: 750, orders: 22 };
```

Nothing else in the function body needs to change — every other reference to `labels`/`labels.length` downstream is unaffected by how `labels` was produced. Update the top-of-file import line from `import type { DashboardPayload, DateRangeKey, TimeSeriesData } from "./types";` to also include `ResolvedDateRange`: `import type { DashboardPayload, DateRangeKey, ResolvedDateRange, TimeSeriesData } from "./types";` (keep `DateRangeKey` — it may still be referenced elsewhere in the file; if it is not, remove it instead of leaving an unused import).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- mock-data.test.ts`
Expected: PASS (all tests, existing and new)

- [ ] **Step 6: Verify and commit**

```
npx tsc --noEmit
npm test
npm run lint
npx prettier --write src/lib/analytics/mock-data.ts src/lib/analytics/mock-data.test.ts
npm run build
```

`tsc` will still show errors in `actions.ts` (still calling `buildMockDashboardPayload(rangeKey)` with a bare key) and possibly `cache.ts`/`DashboardDateFilter.tsx` — expected, fixed in later tasks. Only errors inside the 2 files this task touches need fixing now.

```bash
git add src/lib/analytics/mock-data.ts src/lib/analytics/mock-data.test.ts
git commit -m "Generalize mock data bucket generation from the resolved range

buildMockDashboardPayload now takes a ResolvedDateRange and derives its
bucket count/labels/per-bucket scale from the range's actual span and
interval, instead of a fixed switch over 3 DateRangeKey values. This is
what lets every new named preset and arbitrary custom range produce a
sensibly-sized mock series without special-casing each one."
```

---

### Task 4: Wire custom ranges through `actions.ts`

**Files:**
- Modify: `src/lib/analytics/actions.ts`
- Modify: `src/lib/analytics/actions.test.ts`

**Interfaces:**
- Produces: `getDashboardData(rangeKey: DateRangeKey, customRange?: { start: Date; end: Date }): Promise<DashboardPayload>` — resolves the range once (via `resolveDateRange` or `resolveCustomRange`, matching `rangeKey`) before branching into the mock/real paths, so both receive an identical `ResolvedDateRange`.
- Consumes: `resolveCustomRange` from `./date-range` (already exists after Task 1).

- [ ] **Step 1: Read the current file**

Read `src/lib/analytics/actions.ts` and `src/lib/analytics/actions.test.ts` in full first.

- [ ] **Step 2: Write the failing test for the custom-range path**

Add this test inside the existing `describe("getDashboardData", ...)` block in `actions.test.ts`, after the existing 3 tests:

```ts
it("resolves a custom start/end range and passes it to the mock data builder", async () => {
  vi.unstubAllEnvs();
  mockHappyPath();

  const payload = await getDashboardData("custom", {
    start: new Date(2026, 6, 1),
    end: new Date(2026, 6, 15),
  });

  expect(payload.errors).toEqual({});
  // Jul 1 - Jul 15 inclusive is 15 daily buckets
  expect(payload.charts.salesOverTime).toHaveLength(15);
});

it("falls back to resolving 'today' if rangeKey is 'custom' but no customRange is provided", async () => {
  vi.unstubAllEnvs();
  mockHappyPath();

  const payload = await getDashboardData("custom");

  expect(payload.errors).toEqual({});
  expect(payload.charts.salesOverTime).toHaveLength(24); // today = 24 hourly buckets
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- actions.test.ts`
Expected: FAIL — `getDashboardData` doesn't accept a second parameter yet, and still calls `buildMockDashboardPayload(rangeKey)` with a bare key (which Task 3 changed to require a `ResolvedDateRange`) — this second issue means even the 3 *existing* tests are currently failing after Task 3's change, until this task fixes the call site. Confirm that's the actual failure mode before proceeding (if something else is failing, stop and report NEEDS_CONTEXT).

- [ ] **Step 4: Update `getDashboardData`**

In `src/lib/analytics/actions.ts`, change the import line from:

```ts
import { resolveDateRange } from "./date-range";
```

to:

```ts
import { resolveCustomRange, resolveDateRange } from "./date-range";
```

Then replace the function body:

```ts
export async function getDashboardData(
  rangeKey: DateRangeKey,
): Promise<DashboardPayload> {
  if (!hasRealCredentials()) {
    return buildMockDashboardPayload(rangeKey);
  }

  const range = resolveDateRange(rangeKey, new Date());

  const [
```

with:

```ts
export async function getDashboardData(
  rangeKey: DateRangeKey,
  customRange?: { start: Date; end: Date },
): Promise<DashboardPayload> {
  const range =
    rangeKey === "custom"
      ? customRange
        ? resolveCustomRange(customRange.start, customRange.end)
        : resolveDateRange("today", new Date())
      : resolveDateRange(rangeKey, new Date());

  if (!hasRealCredentials()) {
    return buildMockDashboardPayload(range);
  }

  const [
```

(Everything below that — the `Promise.all([...])` block and the rest of the function — already uses the `range` variable and needs no further changes.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- actions.test.ts`
Expected: PASS (all 5 tests: the original 3 plus the 2 new ones)

- [ ] **Step 6: Verify and commit**

```
npx tsc --noEmit
npm test
npm run lint
npx prettier --write src/lib/analytics/actions.ts src/lib/analytics/actions.test.ts
npm run build
```

`tsc` should now be clean or very close to it — the only remaining call sites that could still error are `cache.ts` (shouldn't need changes — verify) and `DashboardDateFilter.tsx`/the two `page.tsx` files (fixed in Tasks 5-6). Report exactly which files/lines still fail, if any.

```bash
git add src/lib/analytics/actions.ts src/lib/analytics/actions.test.ts
git commit -m "Wire custom date ranges through getDashboardData

getDashboardData now resolves its ResolvedDateRange once (via
resolveDateRange or resolveCustomRange) before branching into the mock
or real data path, so both receive the same range regardless of whether
rangeKey is a named preset or 'custom'. Falls back to resolving 'today'
if rangeKey is 'custom' but no customRange was actually provided."
```

---

### Task 5: Add `react-day-picker` and build `CustomDateRangePicker`

**Files:**
- Modify: `package.json` (add `react-day-picker` dependency)
- Create: `src/components/analytics/CustomDateRangePicker.tsx`
- No test file — this component is a thin, highly interactive client wrapper around two third-party libraries (Base UI popover mechanics, react-day-picker calendar); its correctness is best verified by the dev-server/Playwright check in Step 5 below, consistent with how this project has previously verified interactive UI (e.g. `ThemeToggle`, `DashboardDateFilter`) primarily through such checks rather than exhaustive unit tests of library-driven interaction. If straightforward pure-logic pieces emerge while building this (e.g. a label-formatting helper), still give those direct unit tests.

**Interfaces:**
- Produces: `<CustomDateRangePicker />` — a self-contained client component (reads/writes its own `useSearchParams`/`useRouter`, matching `DashboardDateFilter`'s existing pattern) rendering the 4th chip. No props.
- Consumes: `resolveRangeSelection`, `buildRangeQueryParams` (`@/lib/analytics/date-range`), `formatShortDate` (`@/lib/analytics/format`), `CHIP_CLASS` (`./theme`), Base UI's `Popover` (`@base-ui/react/popover`), `react-day-picker`'s `DayPicker`.

**Before writing any DayPicker JSX:** install the package, then read its actual type definitions. Do not write DayPicker props/classNames from memory or from any v8/v9-era example — this package went through a v10 rename very recently with breaking `classNames` key changes (see Global Constraints). Concretely:

```bash
npm install react-day-picker
```

Then inspect `node_modules/react-day-picker/dist/**/*.d.ts` (or run `npx daypicker --help` / fetch `https://daypicker.dev` if the installed docs aren't clear enough) to confirm, for the installed version:
- The exact prop names for `mode="range"` (is the selected-range prop still called `selected` with a `{ from, to }` shape, or has this changed in v10? Confirm before using it below).
- The exact prop name for the range-change callback (`onSelect`, or renamed?).
- The current `classNames` key names for: the month grid/table, the day cell, the selected day, a day inside the selected range (not an endpoint), the range start/end, the navigation previous/next buttons, and the caption/month-label. The Global Constraints section lists some v8→v10 renames already discovered (`table`→`month_grid`, `day_selected`→`selected`, `nav_button`→`button_previous`/`button_next`) — confirm these and find the rest.

If any prop/behavior below turns out to not match the installed version, adjust to match reality — the installed package's types are the source of truth, not this plan.

- [ ] **Step 1: Install the dependency**

```bash
npm install react-day-picker
```

Confirm it installed successfully and check what version landed in `package.json`/`package-lock.json`.

- [ ] **Step 2: Investigate the installed API (per the instructions above)**

Read the relevant type definition files. Write down (in your eventual task report) the exact prop names and classNames keys you found, so the reviewer can cross-check your component against them without re-deriving it themselves.

- [ ] **Step 3: Build `CustomDateRangePicker.tsx`**

Create `src/components/analytics/CustomDateRangePicker.tsx`. The required behavior (adapt the exact DayPicker prop names/classNames per Step 2's findings — everything else below is exact):

```tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Popover } from "@base-ui/react/popover";
import { DayPicker } from "react-day-picker";
import { formatShortDate } from "@/lib/analytics/format";
import {
  buildRangeQueryParams,
  resolveRangeSelection,
} from "@/lib/analytics/date-range";
import type { DateRangeKey } from "@/lib/analytics/types";
import { CHIP_CLASS } from "./theme";

interface NamedPreset {
  key: DateRangeKey;
  label: string;
}

const NAMED_PRESETS: NamedPreset[] = [
  { key: "yesterday", label: "Yesterday" },
  { key: "mtd", label: "Month to date" },
  { key: "last-month", label: "Last month" },
  { key: "ytd", label: "Year to date" },
  { key: "last-year", label: "Last year" },
  { key: "90d", label: "Last 90 days" },
];

interface DraftRange {
  from?: Date;
  to?: Date;
}

export function CustomDateRangePicker() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [draftRange, setDraftRange] = useState<DraftRange | undefined>();

  const { rangeKey, customRange } = resolveRangeSelection(
    searchParams.get("range") ?? undefined,
    searchParams.get("start") ?? undefined,
    searchParams.get("end") ?? undefined,
  );

  const activePreset = NAMED_PRESETS.find((preset) => preset.key === rangeKey);
  const isActive = rangeKey === "custom" || activePreset !== undefined;
  const triggerLabel =
    rangeKey === "custom" && customRange
      ? `${formatShortDate(customRange.start)} – ${formatShortDate(customRange.end)}`
      : (activePreset?.label ?? "Custom");

  function navigateTo(
    nextRangeKey: DateRangeKey,
    nextCustomRange?: { start: Date; end: Date },
  ) {
    const params = new URLSearchParams(searchParams.toString());
    const query = new URLSearchParams(
      buildRangeQueryParams(nextRangeKey, nextCustomRange),
    );
    params.set("range", query.get("range")!);
    if (query.has("start")) {
      params.set("start", query.get("start")!);
      params.set("end", query.get("end")!);
    } else {
      params.delete("start");
      params.delete("end");
    }
    router.push(`?${params.toString()}`);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) return;
    if (rangeKey === "custom" && customRange) {
      setShowCalendar(true);
      setDraftRange({ from: customRange.start, to: customRange.end });
    } else {
      setShowCalendar(false);
      setDraftRange(undefined);
    }
  }

  function handlePresetClick(key: DateRangeKey) {
    navigateTo(key);
    setOpen(false);
  }

  function handleApply() {
    if (draftRange?.from && draftRange?.to) {
      navigateTo("custom", { start: draftRange.from, end: draftRange.to });
    }
    setOpen(false);
  }

  function handleCancel() {
    setOpen(false);
  }

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger
        className={`${CHIP_CLASS} cursor-pointer ${
          isActive
            ? "border-(--analytics-accent) bg-(--analytics-accent-dim) text-(--analytics-accent)"
            : ""
        }`}
      >
        {triggerLabel}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={6}>
          <Popover.Popup className="flex overflow-hidden rounded-(--analytics-radius) border border-(--analytics-border) bg-(--analytics-surface) text-(--analytics-t1) shadow-lg">
            <ul className="w-40 shrink-0 space-y-0.5 border-r border-(--analytics-border) p-1.5">
              {NAMED_PRESETS.map((preset) => (
                <li key={preset.key}>
                  <button
                    type="button"
                    onClick={() => handlePresetClick(preset.key)}
                    className={`w-full cursor-pointer rounded-md px-2.5 py-1.5 text-left text-[12px] hover:bg-(--analytics-accent-dim) ${
                      rangeKey === preset.key
                        ? "bg-(--analytics-accent-dim) text-(--analytics-accent)"
                        : "text-(--analytics-t2)"
                    }`}
                  >
                    {preset.label}
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => setShowCalendar(true)}
                  className={`w-full cursor-pointer rounded-md px-2.5 py-1.5 text-left text-[12px] hover:bg-(--analytics-accent-dim) ${
                    showCalendar || rangeKey === "custom"
                      ? "bg-(--analytics-accent-dim) text-(--analytics-accent)"
                      : "text-(--analytics-t2)"
                  }`}
                >
                  Custom range
                </button>
              </li>
            </ul>
            {showCalendar && (
              <div className="p-3">
                <div className="mb-2 flex items-center gap-2 text-[12px] text-(--analytics-t2)">
                  <span>
                    {draftRange?.from
                      ? formatShortDate(draftRange.from)
                      : "Start date"}
                  </span>
                  <span>&rarr;</span>
                  <span>
                    {draftRange?.to ? formatShortDate(draftRange.to) : "End date"}
                  </span>
                </div>
                <DayPicker
                  mode="range"
                  numberOfMonths={2}
                  selected={draftRange}
                  onSelect={setDraftRange}
                  /* classNames: map to --analytics-* tokens per Step 2's findings */
                />
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className={`${CHIP_CLASS} cursor-pointer`}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleApply}
                    disabled={!draftRange?.from || !draftRange?.to}
                    className={`${CHIP_CLASS} cursor-pointer border-(--analytics-accent) bg-(--analytics-accent-dim) text-(--analytics-accent) disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
```

Fill in the `classNames` prop (marked with a comment above) using the exact keys found in Step 2, mapping visually to: selected/range days and the range-start/end endpoints use `var(--analytics-accent)` background or text; day cells otherwise use `var(--analytics-t1)`/`var(--analytics-t2)`; the grid/table background is transparent (it's already inside the themed `Popover.Popup`); navigation buttons use `var(--analytics-t2)` with hover state `var(--analytics-accent)`. No default react-day-picker CSS should be visible — do not import `react-day-picker/dist/style.css` or any default stylesheet; style entirely via `classNames`.

- [ ] **Step 4: Type-check and lint**

```
npx tsc --noEmit
npm run lint
npx prettier --write src/components/analytics/CustomDateRangePicker.tsx package.json
npm run build
```

Fix any type errors — in particular, confirm `Popover.Trigger`'s `className` prop and default rendered element match what Step 3's JSX assumes (it renders a native `<button>` by default per Base UI's docs; if the installed version differs, adjust).

- [ ] **Step 5: Visual and interaction check**

This component isn't wired into any page yet (Task 6 does that), so temporarily render it to verify it in isolation: create a throwaway route or temporarily add `<CustomDateRangePicker />` to the existing dashboard header in `src/app/admin/analytics/page.tsx` for this check only, **then revert that temporary edit** before committing (Task 6 does the real wiring properly, including URL round-tripping).

Start the dev server, use Playwright (cached package: `ls ~/.npm/_npx/*/node_modules/playwright/index.mjs`) to:
1. Click the "Custom" chip and confirm the popover opens showing the 6 named presets + "Custom range", styled with the app's dark theme (no default white/blue DayPicker chrome visible anywhere).
2. Click "Custom range" and confirm a two-month calendar appears alongside the sidebar.
3. Click a start date, then an end date, and confirm the "Start date"/"End date" labels update and a visible range highlight appears between them in the calendar.
4. Confirm "Apply" is disabled until both dates are picked, then becomes clickable.
5. Confirm the popover closes on both "Cancel" and clicking a named preset.
6. Check both light and dark mode.

Then revert the temporary wiring in `page.tsx`, kill the dev server, and delete any temp files.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/components/analytics/CustomDateRangePicker.tsx
git commit -m "Add CustomDateRangePicker: named presets + two-month calendar

New component for the dashboard's date filter's 4th chip. Sidebar lists
6 named presets (Yesterday, Month to date, Last month, Year to date,
Last year, Last 90 days) plus 'Custom range', which reveals a
react-day-picker two-month range calendar restyled entirely with this
app's --analytics-* theme tokens. Uses Base UI's Popover (already a
dependency) for the popover mechanics. Not yet wired into any page —
see the next task."
```

---

### Task 6: Wire the picker into `DashboardDateFilter` and both pages

**Files:**
- Modify: `src/components/analytics/DashboardDateFilter.tsx`
- Modify: `src/app/admin/analytics/page.tsx`
- Modify: `src/app/admin/analytics/reports/[slug]/page.tsx`

**Interfaces:**
- Consumes: `CustomDateRangePicker` (Task 5), `resolveRangeSelection`/`buildRangeQueryParams` (Task 1).

No new test file — both `page.tsx` files have no test coverage (established precedent from the report-detail-pages feature); verify via `tsc`/`build`/a Playwright check.

- [ ] **Step 1: Add the chip to `DashboardDateFilter`**

Read `src/components/analytics/DashboardDateFilter.tsx` first. Make two changes:

1. The existing `handleSelect` must also clear any stale `start`/`end` params left over from a previous custom selection:

```ts
function handleSelect(key: DateRangeKey) {
  const params = new URLSearchParams(searchParams.toString());
  params.set("range", key);
  params.delete("start");
  params.delete("end");
  router.push(`?${params.toString()}`);
}
```

2. Replace the ad-hoc `activeRange` cast with the shared resolver, and render `<CustomDateRangePicker />` after the 3 existing chips:

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { resolveRangeKeyParam } from "@/lib/analytics/date-range";
import type { DateRangeKey } from "@/lib/analytics/types";
import { CustomDateRangePicker } from "./CustomDateRangePicker";
import { CHIP_CLASS } from "./theme";

const OPTIONS: { key: DateRangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 Days" },
  { key: "30d", label: "Last 30 Days" },
];

export function DashboardDateFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeRange = resolveRangeKeyParam(searchParams.get("range") ?? undefined);

  function handleSelect(key: DateRangeKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", key);
    params.delete("start");
    params.delete("end");
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex gap-1.5">
      {OPTIONS.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => handleSelect(option.key)}
          className={`${CHIP_CLASS} cursor-pointer ${
            activeRange === option.key
              ? "border-(--analytics-accent) bg-(--analytics-accent-dim) text-(--analytics-accent)"
              : ""
          }`}
        >
          {option.label}
        </button>
      ))}
      <CustomDateRangePicker />
    </div>
  );
}
```

- [ ] **Step 2: Update the dashboard page (`src/app/admin/analytics/page.tsx`)**

Read the file first. Change the `searchParams` prop type and range-resolution to also read `start`/`end`, and pass the resolved custom range to `getDashboardData`:

Find:

```tsx
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range } = await searchParams;
  const rangeKey = resolveRangeKeyParam(range);
  const data = await getDashboardData(rangeKey);
```

Replace with:

```tsx
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; start?: string; end?: string }>;
}) {
  const { range, start, end } = await searchParams;
  const { rangeKey, customRange } = resolveRangeSelection(range, start, end);
  const data = await getDashboardData(rangeKey, customRange ?? undefined);
  const rangeQuery = buildRangeQueryParams(rangeKey, customRange);
```

Update the import line from `import { resolveRangeKeyParam } from "@/lib/analytics/date-range";` to `import { buildRangeQueryParams, resolveRangeSelection } from "@/lib/analytics/date-range";`.

Then, every one of the 15 card `Link` hrefs in this file currently reads:

```tsx
href={`/admin/analytics/reports/<slug>?range=${rangeKey}`}
```

Replace `range=${rangeKey}` with `${rangeQuery}` in all 15 (the `<slug>` part differs per card and is unaffected — only the query-string portion changes), e.g.:

```tsx
href={`/admin/analytics/reports/gross-sales?${rangeQuery}`}
```

Apply this identical transformation to all 15 occurrences (grep the file for `?range=\${rangeKey}` to find every one — there should be exactly 15, one per card, matching the slug table from the report-detail-pages feature).

- [ ] **Step 3: Update the report page (`src/app/admin/analytics/reports/[slug]/page.tsx`)**

Read the file first. Apply the identical pattern:

```tsx
export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string; start?: string; end?: string }>;
}) {
  const { slug } = await params;
  const config = getReportConfig(slug);
  if (!config) notFound();

  const { range, start, end } = await searchParams;
  const { rangeKey, customRange } = resolveRangeSelection(range, start, end);
  const data = await getDashboardData(rangeKey, customRange ?? undefined);
  const rangeQuery = buildRangeQueryParams(rangeKey, customRange);
```

Update its import line the same way as Step 2. Then find the single back-link href:

```tsx
href={`/admin/analytics?range=${rangeKey}`}
```

and replace with:

```tsx
href={`/admin/analytics?${rangeQuery}`}
```

- [ ] **Step 4: Verify types and build**

```
npx tsc --noEmit
npm test
npm run lint
npx prettier --write src/components/analytics/DashboardDateFilter.tsx src/app/admin/analytics/page.tsx "src/app/admin/analytics/reports/[slug]/page.tsx"
npm run build
```

This should now be fully clean — every file this whole feature touches has been updated. If `tsc` still fails anywhere, that's a real gap this plan missed; investigate and fix rather than working around it.

- [ ] **Step 5: End-to-end visual and interaction check**

Start the dev server, then using Playwright:

1. Load `/admin/analytics?range=7d`. Confirm all 4 chips render (Today, Last 7 Days, Last 30 Days, Custom), with "Last 7 Days" highlighted as active.
2. Click "Custom", click "Last 90 days" in the sidebar. Confirm the URL becomes `?range=90d`, the page reloads with 90 days of data, and the chip now shows "Last 90 Days" as its active label.
3. Click "Custom" again, click "Custom range", pick a start and end date spanning more than 60 days apart (e.g. Jan and August of the current year), click Apply. Confirm the URL becomes `?range=custom&start=...&end=...` and the page shows data for that range (spot-check "Total sales over time" renders with weekly-looking buckets, not 200+ daily points).
4. Click one of the 15 dashboard cards while a custom range is active; confirm the resulting report page URL preserves `range=custom&start=...&end=...` (not just `range=custom` with the dates silently dropped), and that report page's data matches the same custom range.
5. From that report page, click the back link (BF logo); confirm it returns to `/admin/analytics` with the same `range=custom&start=...&end=...` still intact.
6. Click "Today" (one of the original 3 chips) while a custom range is active; confirm the URL's `start`/`end` params are actually removed (not just ignored), i.e. the URL becomes exactly `?range=today` with no leftover `start`/`end`.
7. Check both light and dark mode for the popover.

Then kill the dev server and delete any temp files/screenshots.

- [ ] **Step 6: Commit**

```bash
git add src/components/analytics/DashboardDateFilter.tsx src/app/admin/analytics/page.tsx "src/app/admin/analytics/reports/[slug]/page.tsx"
git commit -m "Wire the custom date range picker into both pages

DashboardDateFilter renders the new 4th chip and clears stale start/end
params when a plain preset is picked. Both the dashboard and every
report page now resolve range+start+end via resolveRangeSelection and
build every internal link's query string via buildRangeQueryParams, so
a custom range survives navigation between the dashboard and its 15
report pages, and back again."
```

---

## Final Review

After all 6 tasks are complete and committed, run the full verification suite once more (`npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build`) and do one more Playwright pass covering:
- Every one of the 6 new named presets, confirming each resolves to a sensible date range and the chart/table bucketing looks right (daily for the short ones, weekly for Last 90 days/Year to date/Last year).
- A custom range shorter than 60 days (daily buckets) and one longer (weekly buckets).
- Light and dark mode for the popover and calendar.
- That the existing Today/Last 7 Days/Last 30 Days chips still behave exactly as before (no regression).

Then proceed to `superpowers:finishing-a-development-branch`.
