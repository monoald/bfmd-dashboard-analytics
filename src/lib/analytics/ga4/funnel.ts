import { runGa4Report } from "./client";
import { alignSeries, toIsoDate } from "./format";
import { computeChange } from "../normalize";
import type { ChangeMetric, FunnelStep, PeriodBounds, ResolvedDateRange, TimeSeriesData } from "../types";

const FUNNEL_EVENTS = [
  { step: "Sessions", event: null as string | null },
  { step: "Added to cart", event: "add_to_cart" },
  { step: "Reached checkout", event: "begin_checkout" },
  { step: "Completed checkout", event: "purchase" },
];

async function fetchFunnelCounts(period: PeriodBounds): Promise<number[]> {
  const promises = FUNNEL_EVENTS.map((step) => {
    if (step.event === null) {
      return runGa4Report({
        dimensions: [],
        metrics: ["sessions"],
        startDate: toIsoDate(period.start),
        endDate: toIsoDate(period.end),
      });
    }
    return runGa4Report({
      dimensions: ["eventName"],
      metrics: ["sessions"],
      startDate: toIsoDate(period.start),
      endDate: toIsoDate(period.end),
      dimensionFilter: { fieldName: "eventName", value: step.event },
    });
  });

  const results = await Promise.all(promises);
  return results.map((rows) => rows[0]?.metricValues[0] ?? 0);
}

export async function getConversionFunnel(range: ResolvedDateRange): Promise<FunnelStep[]> {
  const counts = await fetchFunnelCounts(range.current);
  const sessions = counts[0] || 1;
  return FUNNEL_EVENTS.map((step, i) => ({
    step: step.step,
    sessions: counts[i],
    percentage: Math.round((counts[i] / sessions) * 1000) / 10,
  }));
}

export async function getConversionRateSummary(range: ResolvedDateRange): Promise<ChangeMetric> {
  const [currentCounts, previousCounts] = await Promise.all([
    fetchFunnelCounts(range.current),
    fetchFunnelCounts(range.previous),
  ]);
  const currentRate = currentCounts[0] ? Math.round((currentCounts[3] / currentCounts[0]) * 1000) / 10 : 0;
  const previousRate = previousCounts[0] ? Math.round((previousCounts[3] / previousCounts[0]) * 1000) / 10 : 0;
  return computeChange(currentRate, previousRate);
}

async function fetchRateByBucket(period: PeriodBounds, interval: "hour" | "day"): Promise<Map<string, number>> {
  const dimension = interval === "hour" ? "dateHour" : "date";

  const [sessionsRows, purchaseRows] = await Promise.all([
    runGa4Report({
      dimensions: [dimension],
      metrics: ["sessions"],
      startDate: toIsoDate(period.start),
      endDate: toIsoDate(period.end),
    }),
    runGa4Report({
      dimensions: [dimension, "eventName"],
      metrics: ["sessions"],
      startDate: toIsoDate(period.start),
      endDate: toIsoDate(period.end),
      dimensionFilter: { fieldName: "eventName", value: "purchase" },
    }),
  ]);

  const sessionsByBucket = new Map<string, number>();
  for (const row of sessionsRows) sessionsByBucket.set(row.dimensionValues[0], row.metricValues[0]);

  const purchasesByBucket = new Map<string, number>();
  for (const row of purchaseRows) purchasesByBucket.set(row.dimensionValues[0], row.metricValues[0]);

  const rateByBucket = new Map<string, number>();
  for (const [bucket, sessions] of sessionsByBucket) {
    const purchases = purchasesByBucket.get(bucket) ?? 0;
    rateByBucket.set(bucket, sessions === 0 ? 0 : Math.round((purchases / sessions) * 1000) / 10);
  }
  return rateByBucket;
}

export async function getConversionRateOverTime(range: ResolvedDateRange): Promise<TimeSeriesData[]> {
  const [currentMap, previousMap] = await Promise.all([
    fetchRateByBucket(range.current, range.interval),
    fetchRateByBucket(range.previous, range.interval),
  ]);
  return alignSeries(currentMap, previousMap, range.interval);
}
