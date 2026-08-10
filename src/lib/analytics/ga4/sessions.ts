import { runGa4Report } from "./client";
import { alignSeries, toIsoDate } from "./format";
import type {
  NamedValue,
  PeriodBounds,
  ResolvedDateRange,
  TimeSeriesData,
} from "../types";

async function fetchSessionsByBucket(
  period: PeriodBounds,
  interval: "hour" | "day",
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
  return alignSeries(currentMap, previousMap, range.interval);
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
    dimensions: ["region", "city"],
    metrics: ["sessions"],
    startDate: toIsoDate(period.start),
    endDate: toIsoDate(period.end),
  });

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(
      `${row.dimensionValues[0]} · ${row.dimensionValues[1]}`,
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
