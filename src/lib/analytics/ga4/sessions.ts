import { runGa4Report } from "./client";
import { alignSeries, toIsoDate } from "./format";
import type {
  NamedValue,
  PeriodBounds,
  ResolvedDateRange,
  SessionsOverTimeBreakdownRow,
  TimeSeriesData,
} from "../types";

async function fetchSessionsByBucket(
  period: PeriodBounds,
  interval: "hour" | "day" | "week",
): Promise<Map<string, number>> {
  const rows = await runGa4Report({
    dimensions: [interval === "hour" ? "dateHour" : "date"],
    metrics: ["sessions"],
    startDate: toIsoDate(period.start),
    endDate: toIsoDate(period.end),
  });

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.dimensionValues[0], row.metricValues[0]);
  }
  return map;
}

export async function getSessionsOverTime(
  range: ResolvedDateRange,
): Promise<TimeSeriesData[]> {
  const [currentMap, previousMap] = await Promise.all([
    fetchSessionsByBucket(range.current, range.interval),
    fetchSessionsByBucket(range.previous, range.interval),
  ]);
  return alignSeries(
    currentMap,
    previousMap,
    range.current,
    range.previous,
    range.interval,
  );
}

async function fetchSessionsAndVisitorsByBucket(
  period: PeriodBounds,
  interval: "hour" | "day" | "week",
): Promise<{ sessions: Map<string, number>; visitors: Map<string, number> }> {
  const rows = await runGa4Report({
    dimensions: [interval === "hour" ? "dateHour" : "date"],
    metrics: ["sessions", "totalUsers"],
    startDate: toIsoDate(period.start),
    endDate: toIsoDate(period.end),
  });

  const sessions = new Map<string, number>();
  const visitors = new Map<string, number>();
  for (const row of rows) {
    sessions.set(row.dimensionValues[0], row.metricValues[0]);
    visitors.set(row.dimensionValues[0], row.metricValues[1]);
  }
  return { sessions, visitors };
}

export async function getSessionsOverTimeBreakdown(
  range: ResolvedDateRange,
): Promise<SessionsOverTimeBreakdownRow[]> {
  const [current, previous] = await Promise.all([
    fetchSessionsAndVisitorsByBucket(range.current, range.interval),
    fetchSessionsAndVisitorsByBucket(range.previous, range.interval),
  ]);

  const sessionsSeries = alignSeries(
    current.sessions,
    previous.sessions,
    range.current,
    range.previous,
    range.interval,
  );
  const visitorsSeries = alignSeries(
    current.visitors,
    previous.visitors,
    range.current,
    range.previous,
    range.interval,
  );

  return sessionsSeries.map((point, i) => ({
    date: point.date,
    sessions: {
      current: point.currentPeriod,
      previous: point.previousPeriod,
    },
    onlineStoreVisitors: {
      current: visitorsSeries[i].currentPeriod,
      previous: visitorsSeries[i].previousPeriod,
    },
  }));
}

async function fetchSessionsByDeviceMap(
  period: PeriodBounds,
): Promise<Map<string, number>> {
  const rows = await runGa4Report({
    dimensions: ["deviceCategory"],
    metrics: ["sessions"],
    startDate: toIsoDate(period.start),
    endDate: toIsoDate(period.end),
  });

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.dimensionValues[0], row.metricValues[0]);
  }
  return map;
}

export async function getSessionsByDevice(
  range: ResolvedDateRange,
): Promise<NamedValue[]> {
  const [currentMap, previousMap] = await Promise.all([
    fetchSessionsByDeviceMap(range.current),
    fetchSessionsByDeviceMap(range.previous),
  ]);

  return [...currentMap.entries()]
    .map(([name, value]) => ({
      name,
      value,
      previousValue: previousMap.get(name) ?? 0,
    }))
    .sort((a, b) => b.value - a.value);
}

async function fetchSessionsByLocationMap(
  period: PeriodBounds,
): Promise<Map<string, number>> {
  const rows = await runGa4Report({
    dimensions: ["country", "region", "city"],
    metrics: ["sessions"],
    startDate: toIsoDate(period.start),
    endDate: toIsoDate(period.end),
  });

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(
      `${row.dimensionValues[0]} · ${row.dimensionValues[1]} · ${row.dimensionValues[2]}`,
      row.metricValues[0],
    );
  }
  return map;
}

export async function getSessionsByLocation(
  range: ResolvedDateRange,
): Promise<NamedValue[]> {
  const [currentMap, previousMap] = await Promise.all([
    fetchSessionsByLocationMap(range.current),
    fetchSessionsByLocationMap(range.previous),
  ]);

  return [...currentMap.entries()]
    .map(([name, value]) => ({
      name,
      value,
      previousValue: previousMap.get(name) ?? 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
}
