import { formatWcIntervalLabel } from "./format";
import type {
  CardKey,
  ChangeMetric,
  DashboardPayload,
  FunnelStep,
  NamedValue,
  RevenueBreakdownRow,
  SalesBreakdownLine,
  TimeSeriesData,
} from "./types";
import type { RevenueStatsResult } from "./woocommerce/revenue";

export function computeChange(current: number, previous: number): ChangeMetric {
  if (previous === 0) {
    return {
      value: current,
      changePercentage: current === 0 ? 0 : 100,
      trend: current >= 0 ? "up" : "down",
    };
  }

  const changePercentage =
    Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
  return {
    value: current,
    changePercentage,
    trend: changePercentage >= 0 ? "up" : "down",
  };
}

export function sumSeries(
  series: TimeSeriesData[],
  key: "currentPeriod" | "previousPeriod",
): number {
  return series.reduce((total, point) => total + point[key], 0);
}

export function averageSeries(
  series: TimeSeriesData[],
  key: "currentPeriod" | "previousPeriod",
): number {
  return series.length === 0 ? 0 : sumSeries(series, key) / series.length;
}

export function sparklineToSeries(sparkline: number[]): TimeSeriesData[] {
  return sparkline.map((value) => ({
    date: "",
    currentPeriod: value,
    previousPeriod: 0,
  }));
}

export interface RawPipelineResults {
  revenueStats:
    { current: RevenueStatsResult; previous: RevenueStatsResult } | Error;
  ordersFulfilled: { current: number; previous: number } | Error;
  returningCustomerRate: { current: number; previous: number } | Error;
  salesByProduct: NamedValue[] | Error;
  salesByChannel: NamedValue[] | Error;
  sessionsOverTime: TimeSeriesData[] | Error;
  sessionsByDevice: NamedValue[] | Error;
  sessionsByLocation: NamedValue[] | Error;
  conversionFunnel: FunnelStep[] | Error;
  conversionRateOverTime: TimeSeriesData[] | Error;
  conversionRateSummary: ChangeMetric | Error;
  totalSalesBySocialReferrer: NamedValue[] | Error;
}

const EMPTY_REVENUE_STATS: RevenueStatsResult = {
  intervals: [],
  totals: {
    grossSales: 0,
    netRevenue: 0,
    discounts: 0,
    refunds: 0,
    shipping: 0,
    taxes: 0,
    totalSales: 0,
    ordersCount: 0,
    averageOrderValue: 0,
  },
};

function salesOverTimeFrom(stats: {
  current: RevenueStatsResult;
  previous: RevenueStatsResult;
}): TimeSeriesData[] {
  const count = Math.max(
    stats.current.intervals.length,
    stats.previous.intervals.length,
  );
  const series: TimeSeriesData[] = [];
  for (let i = 0; i < count; i++) {
    series.push({
      date:
        stats.current.intervals[i]?.date ??
        stats.previous.intervals[i]?.date ??
        "",
      currentPeriod: stats.current.intervals[i]?.grossSales ?? 0,
      previousPeriod: stats.previous.intervals[i]?.grossSales ?? 0,
    });
  }
  return series;
}

function aovOverTimeFrom(stats: {
  current: RevenueStatsResult;
  previous: RevenueStatsResult;
}): TimeSeriesData[] {
  const count = Math.max(
    stats.current.intervals.length,
    stats.previous.intervals.length,
  );
  const series: TimeSeriesData[] = [];
  for (let i = 0; i < count; i++) {
    const cur = stats.current.intervals[i];
    const prev = stats.previous.intervals[i];
    series.push({
      date: cur?.date ?? prev?.date ?? "",
      currentPeriod:
        cur && cur.ordersCount > 0 ? cur.netRevenue / cur.ordersCount : 0,
      previousPeriod:
        prev && prev.ordersCount > 0 ? prev.netRevenue / prev.ordersCount : 0,
    });
  }
  return series;
}

function revenueBreakdownOverTimeFrom(
  stats: {
    current: RevenueStatsResult;
    previous: RevenueStatsResult;
  },
  interval: "hour" | "day" | "week",
): RevenueBreakdownRow[] {
  const count = Math.max(
    stats.current.intervals.length,
    stats.previous.intervals.length,
  );
  const includeTime = interval === "hour";
  const rows: RevenueBreakdownRow[] = [];
  for (let i = 0; i < count; i++) {
    const cur = stats.current.intervals[i];
    const prev = stats.previous.intervals[i];
    rows.push({
      currentDateLabel: cur
        ? formatWcIntervalLabel(cur.date, includeTime)
        : "",
      previousDateLabel: prev
        ? formatWcIntervalLabel(prev.date, includeTime)
        : "",
      grossSales: {
        current: cur?.grossSales ?? 0,
        previous: prev?.grossSales ?? 0,
      },
      discounts: {
        current: cur ? -Math.abs(cur.discounts) : 0,
        previous: prev ? -Math.abs(prev.discounts) : 0,
      },
      orders: {
        current: cur?.ordersCount ?? 0,
        previous: prev?.ordersCount ?? 0,
      },
      averageOrderValue: {
        current: cur && cur.ordersCount > 0 ? cur.netRevenue / cur.ordersCount : 0,
        previous:
          prev && prev.ordersCount > 0 ? prev.netRevenue / prev.ordersCount : 0,
      },
    });
  }
  return rows;
}

function salesBreakdownFrom(stats: RevenueStatsResult): SalesBreakdownLine[] {
  const t = stats.totals;
  return [
    { label: "Gross sales", value: t.grossSales },
    { label: "Discounts", value: -Math.abs(t.discounts) },
    { label: "Sales reversals", value: -Math.abs(t.refunds) },
    { label: "Net sales", value: t.netRevenue },
    { label: "Shipping charges", value: t.shipping },
    { label: "Taxes", value: t.taxes },
    { label: "Total sales", value: t.totalSales },
  ];
}

export function buildDashboardPayload(
  raw: RawPipelineResults,
  interval: "hour" | "day" | "week" = "hour",
): DashboardPayload {
  const errors: Partial<Record<CardKey, string>> = {};

  function unwrap<T>(key: CardKey, result: T | Error, fallback: T): T {
    if (result instanceof Error) {
      errors[key] = result.message;
      return fallback;
    }
    return result;
  }

  let revenueStats: {
    current: RevenueStatsResult;
    previous: RevenueStatsResult;
  };
  if (raw.revenueStats instanceof Error) {
    const message = raw.revenueStats.message;
    errors.grossSales = message;
    errors.orders = message;
    errors.salesOverTime = message;
    errors.salesBreakdown = message;
    errors.aovOverTime = message;
    revenueStats = {
      current: EMPTY_REVENUE_STATS,
      previous: EMPTY_REVENUE_STATS,
    };
  } else {
    revenueStats = raw.revenueStats;
  }

  const ordersFulfilled = unwrap("ordersFulfilled", raw.ordersFulfilled, {
    current: 0,
    previous: 0,
  });
  const returningCustomerRate = unwrap(
    "returningCustomerRate",
    raw.returningCustomerRate,
    { current: 0, previous: 0 },
  );
  const conversionRateOverTimeSeries = unwrap(
    "conversionRateOverTime",
    raw.conversionRateOverTime,
    [],
  );
  const conversionRateSummaryMetric = unwrap(
    "conversionRate",
    raw.conversionRateSummary,
    {
      value: 0,
      changePercentage: 0,
      trend: "up" as const,
    },
  );

  return {
    summaryCards: {
      grossSales: {
        ...computeChange(
          revenueStats.current.totals.grossSales,
          revenueStats.previous.totals.grossSales,
        ),
        sparkline: revenueStats.current.intervals.map((i) => i.grossSales),
      },
      conversionRate: {
        ...conversionRateSummaryMetric,
        sparkline: conversionRateOverTimeSeries.map(
          (point) => point.currentPeriod,
        ),
      },
      ordersFulfilled: computeChange(
        ordersFulfilled.current,
        ordersFulfilled.previous,
      ),
      orders: {
        ...computeChange(
          revenueStats.current.totals.ordersCount,
          revenueStats.previous.totals.ordersCount,
        ),
        sparkline: revenueStats.current.intervals.map((i) => i.ordersCount),
      },
      returningCustomerRate: computeChange(
        returningCustomerRate.current,
        returningCustomerRate.previous,
      ),
      averageOrderValue: computeChange(
        revenueStats.current.totals.averageOrderValue,
        revenueStats.previous.totals.averageOrderValue,
      ),
    },
    charts: {
      sessionsOverTime: unwrap("sessionsOverTime", raw.sessionsOverTime, []),
      conversionRateOverTime: conversionRateOverTimeSeries,
      conversionFunnel: unwrap("conversionFunnel", raw.conversionFunnel, []),
      sessionsByDevice: unwrap("sessionsByDevice", raw.sessionsByDevice, []),
      sessionsByLocation: unwrap(
        "sessionsByLocation",
        raw.sessionsByLocation,
        [],
      ),
      totalSalesBySocialReferrer: unwrap(
        "totalSalesBySocialReferrer",
        raw.totalSalesBySocialReferrer,
        [],
      ),
      salesOverTime: salesOverTimeFrom(revenueStats),
      salesBreakdown: salesBreakdownFrom(revenueStats.current),
      salesByChannel: unwrap("salesByChannel", raw.salesByChannel, []),
      aovOverTime: aovOverTimeFrom(revenueStats),
      revenueBreakdownOverTime: revenueBreakdownOverTimeFrom(
        revenueStats,
        interval,
      ),
      salesByProduct: unwrap("salesByProduct", raw.salesByProduct, []),
    },
    errors,
  };
}
