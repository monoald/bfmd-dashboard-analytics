import type { DateRangeKey, ResolvedDateRange } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function resolveDateRange(key: DateRangeKey, now: Date): ResolvedDateRange {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (key === "today") {
    return {
      key,
      interval: "hour",
      current: { start: startOfToday, end: endOfToday },
      previous: {
        start: new Date(startOfToday.getTime() - DAY_MS),
        end: new Date(endOfToday.getTime() - DAY_MS),
      },
    };
  }

  const lengthDays = key === "7d" ? 7 : 30;
  const currentStart = new Date(endOfToday.getTime() - (lengthDays - 1) * DAY_MS);
  const currentStartMidnight = new Date(
    currentStart.getFullYear(),
    currentStart.getMonth(),
    currentStart.getDate(),
    0,
    0,
    0,
    0
  );
  const previousEnd = new Date(currentStartMidnight.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - (lengthDays - 1) * DAY_MS);
  const previousStartMidnight = new Date(
    previousStart.getFullYear(),
    previousStart.getMonth(),
    previousStart.getDate(),
    0,
    0,
    0,
    0
  );

  return {
    key,
    interval: "day",
    current: { start: currentStartMidnight, end: endOfToday },
    previous: { start: previousStartMidnight, end: previousEnd },
  };
}
