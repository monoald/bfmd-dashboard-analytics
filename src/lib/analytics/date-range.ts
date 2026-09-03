import { toIsoDate } from "./ga4/format";
import type { DateRangeKey, PeriodBounds, ResolvedDateRange } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_INTERVAL_THRESHOLD_DAYS = 60;
const MAX_CUSTOM_RANGE_DAYS = 366;
// The WooCommerce store's timezone is fixed EST (UTC-5, no DST). Custom-range
// day boundaries are pinned to this offset (see resolveCustomRangeParams)
// instead of the server process's local timezone, so the same "2026-09-02"
// query param produces the same absolute WC API window on every machine —
// Vercel's serverless functions run in UTC while local dev machines vary,
// and without pinning, the same calendar date silently maps to a different
// hours-shifted window per environment.
const EST_UTC_OFFSET_HOURS = 5;

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

// Calendar-date day count between two EST-pinned custom-range endpoints
// (see resolveCustomRangeParams), inclusive of both endpoints. Reads Y/M/D
// via the UTC getters rather than local ones, since `start`/`end` are UTC
// instants representing EST midnight — local getters would misread the
// calendar day on any server running west of EST (UTC-6 or further).
function calendarDayCount(start: Date, end: Date): number {
  const startUtc = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate(),
  );
  const endUtc = Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth(),
    end.getUTCDate(),
  );
  return Math.round((endUtc - startUtc) / DAY_MS) + 1;
}

// EST end-of-day (23:59:59.999 EST) for a Date already pinned to EST
// midnight of that same calendar day.
function estEndOfDay(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + 1,
      EST_UTC_OFFSET_HOURS,
    ) - 1,
  );
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
    const previousMonthDate = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    );
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
  // `start`/`end` are already EST-midnight-pinned instants from
  // resolveCustomRangeParams, so current.start needs no further
  // normalization; shifting by whole days in ms stays exact since EST is a
  // fixed offset with no DST transitions to trip over.
  const current: PeriodBounds = {
    start,
    end: estEndOfDay(end),
  };
  const dayCount = calendarDayCount(start, end);
  const previous: PeriodBounds = {
    start: new Date(current.start.getTime() - dayCount * DAY_MS),
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

function isValidCalendarDate(dateStr: string, date: Date): boolean {
  // Validate that the parsed date's year/month/day round-trip back to the
  // input string's numbers, catching silent date rollover (e.g. Feb 30 -> Mar 2)
  const parts = dateStr.split("-");
  if (parts.length !== 3) return false;
  const [yearStr, monthStr, dayStr] = parts;
  const inputYear = parseInt(yearStr, 10);
  const inputMonth = parseInt(monthStr, 10);
  const inputDay = parseInt(dayStr, 10);

  // Check if the parsed values round-trip correctly. Uses UTC getters
  // since `date` is an EST-pinned instant (see resolveCustomRangeParams),
  // not a local-midnight one.
  return (
    date.getUTCFullYear() === inputYear &&
    date.getUTCMonth() + 1 === inputMonth &&
    date.getUTCDate() === inputDay
  );
}

export function resolveCustomRangeParams(
  start: string | undefined,
  end: string | undefined,
): { start: Date; end: Date } | null {
  if (typeof start !== "string" || typeof end !== "string") return null;
  if (!start || !end) return null;
  // Pin to the store's EST timezone rather than letting this parse in
  // whatever timezone the current server process happens to run in.
  const startDate = new Date(`${start}T00:00:00-0${EST_UTC_OFFSET_HOURS}:00`);
  const endDate = new Date(`${end}T00:00:00-0${EST_UTC_OFFSET_HOURS}:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null;
  }
  // Reject invalid calendar dates that JS silently normalizes
  if (
    !isValidCalendarDate(start, startDate) ||
    !isValidCalendarDate(end, endDate)
  ) {
    return null;
  }
  if (startDate.getTime() > endDate.getTime()) return null;
  const spanDays = (endDate.getTime() - startDate.getTime()) / DAY_MS;
  if (spanDays > MAX_CUSTOM_RANGE_DAYS) return null;
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
