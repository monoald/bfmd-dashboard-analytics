import { computeChange } from "./normalize";
import type {
  FunnelStep,
  LiveCardKey,
  LiveViewPayload,
  NamedValue,
  TimeSeriesData,
} from "./types";
import type { RevenueStatsResult } from "./woocommerce/revenue";

export interface RawLiveViewResults {
  revenueStats:
    { current: RevenueStatsResult; previous: RevenueStatsResult } | Error;
  sessionsOverTime: TimeSeriesData[] | Error;
  conversionFunnel: FunnelStep[] | Error;
  sessionsByLocation: NamedValue[] | Error;
  newAndReturningCustomers:
    | {
        current: { new: number; returning: number };
        previous: { new: number; returning: number };
      }
    | Error;
  salesByProduct: NamedValue[] | Error;
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

const CUSTOMER_BEHAVIOR_LABELS = ["Active carts", "Checking out", "Purchased"];

function customerBehaviorFrom(funnel: FunnelStep[]): FunnelStep[] {
  // Drops the funnel's leading "Sessions" step (already its own standalone
  // tile on this page) and relabels the remaining 3 steps for this page's
  // copy. Percentages are already relative to total sessions from
  // getConversionFunnel, so no recomputation is needed.
  return funnel.slice(1).map((step, i) => ({
    ...step,
    step: CUSTOMER_BEHAVIOR_LABELS[i],
  }));
}

export function buildLiveViewPayload(
  raw: RawLiveViewResults,
  visitorsRightNow: number,
): LiveViewPayload {
  const errors: Partial<Record<LiveCardKey, string>> = {};

  function unwrap<T>(key: LiveCardKey, result: T | Error, fallback: T): T {
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
    errors.totalSales = message;
    errors.orders = message;
    revenueStats = {
      current: EMPTY_REVENUE_STATS,
      previous: EMPTY_REVENUE_STATS,
    };
  } else {
    revenueStats = raw.revenueStats;
  }

  const sessionsOverTime = unwrap("sessions", raw.sessionsOverTime, []);
  const conversionFunnel = unwrap("customerBehavior", raw.conversionFunnel, []);
  const newAndReturningCustomers = unwrap(
    "newVsReturning",
    raw.newAndReturningCustomers,
    { current: { new: 0, returning: 0 }, previous: { new: 0, returning: 0 } },
  );

  const sessionsCurrentTotal = sessionsOverTime.reduce(
    (sum, point) => sum + point.currentPeriod,
    0,
  );
  const sessionsPreviousTotal = sessionsOverTime.reduce(
    (sum, point) => sum + point.previousPeriod,
    0,
  );

  return {
    visitorsRightNow,
    summaryCards: {
      totalSales: {
        ...computeChange(
          revenueStats.current.totals.totalSales,
          revenueStats.previous.totals.totalSales,
        ),
        sparkline: revenueStats.current.intervals.map((i) => i.totalSales),
      },
      sessions: {
        ...computeChange(sessionsCurrentTotal, sessionsPreviousTotal),
        sparkline: sessionsOverTime.map((point) => point.currentPeriod),
      },
      orders: {
        ...computeChange(
          revenueStats.current.totals.ordersCount,
          revenueStats.previous.totals.ordersCount,
        ),
        sparkline: revenueStats.current.intervals.map((i) => i.ordersCount),
      },
    },
    customerBehavior: customerBehaviorFrom(conversionFunnel),
    sessionsByLocation: unwrap(
      "sessionsByLocation",
      raw.sessionsByLocation,
      [],
    ),
    newVsReturning: newAndReturningCustomers.current,
    salesByProduct: unwrap("salesByProduct", raw.salesByProduct, []),
    errors,
  };
}
