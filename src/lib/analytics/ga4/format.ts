import type { PeriodBounds, TimeSeriesData } from "../types";

export function toIsoDate(date: Date): string {
  // UTC getters, not local ones: `date` may be a plain local-midnight
  // instant (preset ranges) or an EST-pinned one (custom ranges, see
  // resolveCustomRangeParams in date-range.ts) — UTC reads recover the
  // intended calendar day for both on every real server this app runs on
  // (Vercel is UTC; dev machines here run at negative UTC offsets), unlike
  // local getters which can roll a fixed-offset instant to the wrong day
  // depending on which timezone the current process happens to be in.
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatBucketLabel(
  rawDate: string,
  interval: "hour" | "day" | "week",
): string {
  if (interval === "hour") {
    const hour = Number(rawDate.slice(8, 10));
    const period = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${hour12} ${period}`;
  }

  const month = Number(rawDate.slice(4, 6));
  const day = Number(rawDate.slice(6, 8));
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${monthNames[month - 1]} ${day}`;
}

function groupIntoWeeks(series: TimeSeriesData[]): TimeSeriesData[] {
  const weeks: TimeSeriesData[] = [];
  for (let i = 0; i < series.length; i += 7) {
    const chunk = series.slice(i, i + 7);
    weeks.push({
      date: chunk[0].date,
      currentPeriod: chunk.reduce((sum, point) => sum + point.currentPeriod, 0),
      previousPeriod: chunk.reduce(
        (sum, point) => sum + point.previousPeriod,
        0,
      ),
    });
  }
  return weeks;
}

// GA4 omits hours/days with zero activity from its response entirely rather
// than returning a zero row. Deriving the bucket list from the *maps*
// (whatever GA4 actually returned) instead of the *period's real calendar
// range* silently compacts away those gaps — for "week" grouping this
// doesn't just drop points, it misaligns every subsequent week boundary,
// since groupIntoWeeks chunks by array position. This walks the actual
// period bounds (calendar-day arithmetic, DST-safe by construction, same
// approach as mock-data.ts's bucketDates) so every expected bucket gets a
// slot — real value if GA4 returned one, 0 otherwise.
function expectedKeysForPeriod(
  period: PeriodBounds,
  interval: "hour" | "day" | "week",
): string[] {
  const pad = (n: number) => String(n).padStart(2, "0");

  if (interval === "hour") {
    // pickInterval only returns "hour" for a <=1-day span, so `period`
    // always covers exactly one calendar day here. UTC getters (see
    // toIsoDate above for why) correctly recover that day for both preset
    // and EST-pinned custom-range instants.
    const year = period.start.getUTCFullYear();
    const month = period.start.getUTCMonth() + 1;
    const day = period.start.getUTCDate();
    return Array.from(
      { length: 24 },
      (_, hour) => `${year}${pad(month)}${pad(day)}${pad(hour)}`,
    );
  }

  // UTC calendar-date arithmetic, not local getters/setters — see
  // mock-data.ts's bucketDates for why (same reasoning applies here).
  const keys: string[] = [];
  let cursor = new Date(period.start.getTime());
  while (cursor.getTime() <= period.end.getTime()) {
    keys.push(
      `${cursor.getUTCFullYear()}${pad(cursor.getUTCMonth() + 1)}${pad(cursor.getUTCDate())}`,
    );
    cursor = new Date(
      Date.UTC(
        cursor.getUTCFullYear(),
        cursor.getUTCMonth(),
        cursor.getUTCDate() + 1,
        cursor.getUTCHours(),
        cursor.getUTCMinutes(),
        cursor.getUTCSeconds(),
        cursor.getUTCMilliseconds(),
      ),
    );
  }
  return keys;
}

export function alignSeries(
  currentMap: Map<string, number>,
  previousMap: Map<string, number>,
  currentPeriod: PeriodBounds,
  previousPeriod: PeriodBounds,
  interval: "hour" | "day" | "week",
): TimeSeriesData[] {
  const currentKeys = expectedKeysForPeriod(currentPeriod, interval);
  const previousKeys = expectedKeysForPeriod(previousPeriod, interval);
  const bucketCount = Math.max(currentKeys.length, previousKeys.length);

  const series: TimeSeriesData[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const currentKey = currentKeys[i];
    const previousKey = previousKeys[i];
    const labelSource = currentKey ?? previousKey;
    series.push({
      date: formatBucketLabel(labelSource, interval),
      currentPeriod: currentKey ? (currentMap.get(currentKey) ?? 0) : 0,
      previousPeriod: previousKey ? (previousMap.get(previousKey) ?? 0) : 0,
    });
  }
  return interval === "week" ? groupIntoWeeks(series) : series;
}
