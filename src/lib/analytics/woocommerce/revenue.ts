import { fetchWc } from "./client";
import type { PeriodBounds, ResolvedDateRange } from "../types";

interface WcRevenueStatsResponse {
  intervals: Array<{
    date_start: string;
    subtotals: {
      gross_sales: number;
      net_revenue: number;
      coupons: number;
      refunds: number;
      shipping: number;
      taxes: number;
      total_sales: number;
      orders_count: number;
    };
  }>;
}

export interface RevenueStatsInterval {
  date: string;
  grossSales: number;
  netRevenue: number;
  discounts: number;
  refunds: number;
  shipping: number;
  taxes: number;
  totalSales: number;
  ordersCount: number;
}

export interface RevenueStatsTotals {
  grossSales: number;
  netRevenue: number;
  discounts: number;
  refunds: number;
  shipping: number;
  taxes: number;
  totalSales: number;
  ordersCount: number;
  averageOrderValue: number;
}

export interface RevenueStatsResult {
  intervals: RevenueStatsInterval[];
  totals: RevenueStatsTotals;
}

function sumTotals(intervals: RevenueStatsInterval[]): RevenueStatsTotals {
  const totals = intervals.reduce(
    (acc, i) => ({
      grossSales: acc.grossSales + i.grossSales,
      netRevenue: acc.netRevenue + i.netRevenue,
      discounts: acc.discounts + i.discounts,
      refunds: acc.refunds + i.refunds,
      shipping: acc.shipping + i.shipping,
      taxes: acc.taxes + i.taxes,
      totalSales: acc.totalSales + i.totalSales,
      ordersCount: acc.ordersCount + i.ordersCount,
    }),
    { grossSales: 0, netRevenue: 0, discounts: 0, refunds: 0, shipping: 0, taxes: 0, totalSales: 0, ordersCount: 0 }
  );
  return {
    ...totals,
    averageOrderValue: totals.ordersCount === 0 ? 0 : totals.netRevenue / totals.ordersCount,
  };
}

async function fetchRevenueStatsForPeriod(period: PeriodBounds, interval: "hour" | "day"): Promise<RevenueStatsResult> {
  const raw = await fetchWc<WcRevenueStatsResponse>("/wc-analytics/reports/revenue/stats", {
    after: period.start.toISOString(),
    before: period.end.toISOString(),
    interval,
  });

  const intervals: RevenueStatsInterval[] = raw.intervals.map((i) => ({
    date: i.date_start,
    grossSales: i.subtotals.gross_sales,
    netRevenue: i.subtotals.net_revenue,
    discounts: i.subtotals.coupons,
    refunds: i.subtotals.refunds,
    shipping: i.subtotals.shipping,
    taxes: i.subtotals.taxes,
    totalSales: i.subtotals.total_sales,
    ordersCount: i.subtotals.orders_count,
  }));

  return { intervals, totals: sumTotals(intervals) };
}

export async function getRevenueStats(
  range: ResolvedDateRange
): Promise<{ current: RevenueStatsResult; previous: RevenueStatsResult }> {
  const [current, previous] = await Promise.all([
    fetchRevenueStatsForPeriod(range.current, range.interval),
    fetchRevenueStatsForPeriod(range.previous, range.interval),
  ]);
  return { current, previous };
}
