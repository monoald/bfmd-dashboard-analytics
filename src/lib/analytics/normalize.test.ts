import { describe, expect, it } from "vitest";
import {
  buildDashboardPayload,
  computeChange,
  type RawPipelineResults,
} from "./normalize";
import type { RevenueStatsResult } from "./woocommerce/revenue";

describe("computeChange", () => {
  it("computes a positive change", () => {
    expect(computeChange(120, 100)).toEqual({
      value: 120,
      changePercentage: 20,
      trend: "up",
    });
  });

  it("computes a negative change", () => {
    expect(computeChange(80, 100)).toEqual({
      value: 80,
      changePercentage: -20,
      trend: "down",
    });
  });

  it("treats a zero previous value with positive current as a 100% increase", () => {
    expect(computeChange(50, 0)).toEqual({
      value: 50,
      changePercentage: 100,
      trend: "up",
    });
  });

  it("treats zero vs. zero as no change", () => {
    expect(computeChange(0, 0)).toEqual({
      value: 0,
      changePercentage: 0,
      trend: "up",
    });
  });

  it("rounds to one decimal place", () => {
    expect(computeChange(103, 100).changePercentage).toBe(3);
  });
});

function revenueStats(
  overrides: Partial<RevenueStatsResult["totals"]> = {},
): RevenueStatsResult {
  const totals = {
    grossSales: 100,
    netRevenue: 90,
    discounts: 5,
    refunds: 2,
    shipping: 8,
    taxes: 3,
    totalSales: 101,
    ordersCount: 4,
    averageOrderValue: 22.5,
    ...overrides,
  };
  return {
    // Single-interval period: the interval mirrors totals so the fixture stays internally
    // consistent (real WC data always has sum(intervals) === totals).
    intervals: [
      {
        date: "Aug 1",
        grossSales: totals.grossSales,
        netRevenue: totals.netRevenue,
        discounts: totals.discounts,
        refunds: totals.refunds,
        shipping: totals.shipping,
        taxes: totals.taxes,
        totalSales: totals.totalSales,
        ordersCount: totals.ordersCount,
      },
    ],
    totals,
  };
}

function baseRaw(): RawPipelineResults {
  return {
    revenueStats: {
      current: revenueStats(),
      previous: revenueStats({ grossSales: 80, ordersCount: 3 }),
    },
    ordersFulfilled: { current: 12, previous: 9 },
    returningCustomerRate: { current: 50, previous: 40 },
    salesByProduct: [{ name: "Widget", value: 100 }],
    salesByChannel: [{ name: "Online Store", value: 100 }],
    sessionsOverTime: [{ date: "Aug 1", currentPeriod: 10, previousPeriod: 8 }],
    sessionsByDevice: [{ name: "mobile", value: 10 }],
    sessionsByLocation: [{ name: "US · NY", value: 10 }],
    conversionFunnel: [{ step: "Sessions", sessions: 10, percentage: 100 }],
    conversionRateOverTime: [
      { date: "Aug 1", currentPeriod: 10, previousPeriod: 5 },
    ],
    conversionRateSummary: { value: 10, changePercentage: 100, trend: "up" },
    totalSalesBySocialReferrer: [{ name: "youtube", value: 50 }],
  };
}

describe("buildDashboardPayload", () => {
  it("computes summary cards from revenue stats, orders, and customer data", () => {
    const payload = buildDashboardPayload(baseRaw());

    expect(payload.summaryCards.grossSales.value).toBe(100);
    expect(payload.summaryCards.grossSales.changePercentage).toBe(25);
    expect(payload.summaryCards.orders.value).toBe(4);
    // computeChange rounds to 1 decimal place (see computeChange tests above), so
    // (3 / 9) * 100 = 33.333... rounds to 33.3.
    expect(payload.summaryCards.ordersFulfilled).toEqual({
      value: 12,
      changePercentage: 33.3,
      trend: "up",
    });
    expect(payload.summaryCards.returningCustomerRate.value).toBe(50);
    expect(payload.summaryCards.conversionRate).toEqual({
      value: 10,
      changePercentage: 100,
      trend: "up",
      sparkline: [10],
    });
  });

  it("derives salesOverTime, aovOverTime, and salesBreakdown from revenue stats intervals/totals", () => {
    const payload = buildDashboardPayload(baseRaw());

    expect(payload.charts.salesOverTime).toEqual([
      { date: "Aug 1", currentPeriod: 100, previousPeriod: 80 },
    ]);
    // previous period has netRevenue 90 and ordersCount 3 (overridden), so AOV is 90 / 3.
    expect(payload.charts.aovOverTime).toEqual([
      { date: "Aug 1", currentPeriod: 90 / 4, previousPeriod: 90 / 3 },
    ]);
    expect(payload.charts.salesBreakdown).toEqual([
      { label: "Gross sales", value: 100 },
      { label: "Discounts", value: -5 },
      { label: "Sales reversals", value: -2 },
      { label: "Net sales", value: 90 },
      { label: "Shipping charges", value: 8 },
      { label: "Taxes", value: 3 },
      { label: "Total sales", value: 101 },
    ]);
  });

  it("passes through GA4-sourced charts unchanged", () => {
    const payload = buildDashboardPayload(baseRaw());

    expect(payload.charts.sessionsOverTime).toEqual([
      { date: "Aug 1", currentPeriod: 10, previousPeriod: 8 },
    ]);
    expect(payload.charts.totalSalesBySocialReferrer).toEqual([
      { name: "youtube", value: 50 },
    ]);
  });

  it("isolates a revenue-stats failure to the cards it feeds, leaving other cards populated", () => {
    const raw = baseRaw();
    raw.revenueStats = new Error("WooCommerce API error 500");

    const payload = buildDashboardPayload(raw);

    expect(payload.errors.grossSales).toBe("WooCommerce API error 500");
    expect(payload.errors.orders).toBe("WooCommerce API error 500");
    expect(payload.errors.salesOverTime).toBe("WooCommerce API error 500");
    expect(payload.summaryCards.grossSales.value).toBe(0);
    expect(payload.charts.salesOverTime).toEqual([]);
    expect(payload.summaryCards.returningCustomerRate.value).toBe(50);
    expect(payload.errors.returningCustomerRate).toBeUndefined();
  });

  it("isolates a GA4 sessions failure without affecting revenue cards", () => {
    const raw = baseRaw();
    raw.sessionsOverTime = new Error("GA4 quota exceeded");

    const payload = buildDashboardPayload(raw);

    expect(payload.errors.sessionsOverTime).toBe("GA4 quota exceeded");
    expect(payload.charts.sessionsOverTime).toEqual([]);
    expect(payload.summaryCards.grossSales.value).toBe(100);
  });
});
