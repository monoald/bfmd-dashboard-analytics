import type { PeriodBounds, TimeSeriesData } from "../types";

export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
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
    // always covers exactly one calendar day here.
    const year = period.start.getFullYear();
    const month = period.start.getMonth() + 1;
    const day = period.start.getDate();
    return Array.from(
      { length: 24 },
      (_, hour) => `${year}${pad(month)}${pad(day)}${pad(hour)}`,
    );
  }

  const keys: string[] = [];
  let cursor = new Date(
    period.start.getFullYear(),
    period.start.getMonth(),
    period.start.getDate(),
  );
  while (cursor.getTime() <= period.end.getTime()) {
    keys.push(
      `${cursor.getFullYear()}${pad(cursor.getMonth() + 1)}${pad(cursor.getDate())}`,
    );
    cursor = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate() + 1,
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
