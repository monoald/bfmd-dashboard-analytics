import { runGa4Report } from "./client";
import { alignSeries, toIsoDate } from "./format";
import { computeChange } from "../normalize";
import type {
  ChangeMetric,
  ConversionRateOverTimeBreakdownRow,
  FunnelStep,
  PeriodBounds,
  ResolvedDateRange,
  TimeSeriesData,
} from "../types";

const FUNNEL_EVENTS = [
  { step: "Sessions", event: null as string | null },
  { step: "Added to cart", event: "add_to_cart" },
  { step: "Reached checkout", event: "begin_checkout" },
  { step: "Completed checkout", event: "purchase" },
];

async function fetchFunnelCounts(period: PeriodBounds): Promise<number[]> {
  const counts: number[] = [];
  for (const step of FUNNEL_EVENTS) {
    if (step.event === null) {
      const rows = await runGa4Report({
        dimensions: [],
        metrics: ["sessions"],
        startDate: toIsoDate(period.start),
        endDate: toIsoDate(period.end),
      });
      counts.push(rows[0]?.metricValues[0] ?? 0);
      continue;
    }
    const rows = await runGa4Report({
      dimensions: ["eventName"],
      metrics: ["sessions"],
      startDate: toIsoDate(period.start),
      endDate: toIsoDate(period.end),
      dimensionFilter: { fieldName: "eventName", value: step.event },
    });
    counts.push(rows[0]?.metricValues[0] ?? 0);
  }
  return counts;
}

export async function getConversionFunnel(
  range: ResolvedDateRange,
): Promise<FunnelStep[]> {
  const currentCounts = await fetchFunnelCounts(range.current);
  const previousCounts = await fetchFunnelCounts(range.previous);
  const sessions = currentCounts[0] || 1;
  return FUNNEL_EVENTS.map((step, i) => ({
    step: step.step,
    sessions: currentCounts[i],
    percentage: Math.round((currentCounts[i] / sessions) * 1000) / 10,
    previousSessions: previousCounts[i],
  }));
}

export async function getConversionRateSummary(
  range: ResolvedDateRange,
): Promise<ChangeMetric> {
  const currentCounts = await fetchFunnelCounts(range.current);
  const previousCounts = await fetchFunnelCounts(range.previous);
  const currentRate = currentCounts[0]
    ? Math.round((currentCounts[3] / currentCounts[0]) * 1000) / 10
    : 0;
  const previousRate = previousCounts[0]
    ? Math.round((previousCounts[3] / previousCounts[0]) * 1000) / 10
    : 0;
  return computeChange(currentRate, previousRate);
}

async function fetchRateByBucket(
  period: PeriodBounds,
  interval: "hour" | "day" | "week",
): Promise<Map<string, number>> {
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
  for (const row of sessionsRows)
    sessionsByBucket.set(row.dimensionValues[0], row.metricValues[0]);

  const purchasesByBucket = new Map<string, number>();
  for (const row of purchaseRows)
    purchasesByBucket.set(row.dimensionValues[0], row.metricValues[0]);

  const rateByBucket = new Map<string, number>();
  for (const [bucket, sessions] of sessionsByBucket) {
    const purchases = purchasesByBucket.get(bucket) ?? 0;
    rateByBucket.set(
      bucket,
      sessions === 0 ? 0 : Math.round((purchases / sessions) * 1000) / 10,
    );
  }
  return rateByBucket;
}

export async function getConversionRateOverTime(
  range: ResolvedDateRange,
): Promise<TimeSeriesData[]> {
  const [currentMap, previousMap] = await Promise.all([
    fetchRateByBucket(range.current, range.interval),
    fetchRateByBucket(range.previous, range.interval),
  ]);
  return alignSeries(
    currentMap,
    previousMap,
    range.current,
    range.previous,
    range.interval,
  );
}

function toBucketMap(rows: { dimensionValues: string[]; metricValues: number[] }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) map.set(row.dimensionValues[0], row.metricValues[0]);
  return map;
}

async function fetchFunnelCountsByBucket(
  period: PeriodBounds,
  interval: "hour" | "day" | "week",
): Promise<{
  sessions: Map<string, number>;
  addedToCart: Map<string, number>;
  reachedCheckout: Map<string, number>;
  completedCheckout: Map<string, number>;
}> {
  const dimension = interval === "hour" ? "dateHour" : "date";
  const commonParams = {
    startDate: toIsoDate(period.start),
    endDate: toIsoDate(period.end),
  };

  const [sessionsRows, addToCartRows, beginCheckoutRows, purchaseRows] =
    await Promise.all([
      runGa4Report({ dimensions: [dimension], metrics: ["sessions"], ...commonParams }),
      runGa4Report({
        dimensions: [dimension, "eventName"],
        metrics: ["sessions"],
        ...commonParams,
        dimensionFilter: { fieldName: "eventName", value: "add_to_cart" },
      }),
      runGa4Report({
        dimensions: [dimension, "eventName"],
        metrics: ["sessions"],
        ...commonParams,
        dimensionFilter: { fieldName: "eventName", value: "begin_checkout" },
      }),
      runGa4Report({
        dimensions: [dimension, "eventName"],
        metrics: ["sessions"],
        ...commonParams,
        dimensionFilter: { fieldName: "eventName", value: "purchase" },
      }),
    ]);

  return {
    sessions: toBucketMap(sessionsRows),
    addedToCart: toBucketMap(addToCartRows),
    reachedCheckout: toBucketMap(beginCheckoutRows),
    completedCheckout: toBucketMap(purchaseRows),
  };
}

export async function getConversionRateOverTimeBreakdown(
  range: ResolvedDateRange,
): Promise<ConversionRateOverTimeBreakdownRow[]> {
  const [current, previous] = await Promise.all([
    fetchFunnelCountsByBucket(range.current, range.interval),
    fetchFunnelCountsByBucket(range.previous, range.interval),
  ]);

  const align = (currentMap: Map<string, number>, previousMap: Map<string, number>) =>
    alignSeries(currentMap, previousMap, range.current, range.previous, range.interval);

  const sessionsSeries = align(current.sessions, previous.sessions);
  const addedToCartSeries = align(current.addedToCart, previous.addedToCart);
  const reachedCheckoutSeries = align(
    current.reachedCheckout,
    previous.reachedCheckout,
  );
  const completedCheckoutSeries = align(
    current.completedCheckout,
    previous.completedCheckout,
  );

  function rate(completed: number, sessions: number): number {
    return sessions === 0 ? 0 : Math.round((completed / sessions) * 1000) / 10;
  }

  return sessionsSeries.map((point, i) => {
    const completed = completedCheckoutSeries[i];
    return {
      date: point.date,
      sessions: { current: point.currentPeriod, previous: point.previousPeriod },
      addedToCart: {
        current: addedToCartSeries[i].currentPeriod,
        previous: addedToCartSeries[i].previousPeriod,
      },
      reachedCheckout: {
        current: reachedCheckoutSeries[i].currentPeriod,
        previous: reachedCheckoutSeries[i].previousPeriod,
      },
      completedCheckout: {
        current: completed.currentPeriod,
        previous: completed.previousPeriod,
      },
      conversionRate: {
        current: rate(completed.currentPeriod, point.currentPeriod),
        previous: rate(completed.previousPeriod, point.previousPeriod),
      },
    };
  });
}
