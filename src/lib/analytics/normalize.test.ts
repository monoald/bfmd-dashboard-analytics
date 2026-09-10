import { describe, expect, it } from "vitest";
import {
  averageSeries,
  buildDashboardPayload,
  computeChange,
  sparklineToSeries,
  sumSeries,
  weightedRate,
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

describe("sumSeries", () => {
  it("sums the given key across all points", () => {
    const series = [
      { date: "Aug 1", currentPeriod: 10, previousPeriod: 5 },
      { date: "Aug 2", currentPeriod: 20, previousPeriod: 8 },
    ];
    expect(sumSeries(series, "currentPeriod")).toBe(30);
    expect(sumSeries(series, "previousPeriod")).toBe(13);
  });

  it("returns 0 for an empty series", () => {
    expect(sumSeries([], "currentPeriod")).toBe(0);
  });
});

describe("averageSeries", () => {
  it("averages the given key across all points", () => {
    const series = [
      { date: "Aug 1", currentPeriod: 10, previousPeriod: 4 },
      { date: "Aug 2", currentPeriod: 20, previousPeriod: 8 },
    ];
    expect(averageSeries(series, "currentPeriod")).toBe(15);
    expect(averageSeries(series, "previousPeriod")).toBe(6);
  });

  it("returns 0 for an empty series instead of dividing by zero", () => {
    expect(averageSeries([], "currentPeriod")).toBe(0);
  });
});

describe("weightedRate", () => {
  it("weights by the paired count series instead of averaging the raw rates", () => {
    // Hour 0: 1 session, 0% conversion. Hour 1: 9 sessions, 100% conversion.
    // Plain average of rates = (0+100)/2 = 50%, but the true period rate is
    // 9 conversions out of 10 sessions = 90%.
    const rateSeries = [
      { date: "0", currentPeriod: 0, previousPeriod: 0 },
      { date: "1", currentPeriod: 100, previousPeriod: 0 },
    ];
    const weightSeries = [
      { date: "0", currentPeriod: 1, previousPeriod: 0 },
      { date: "1", currentPeriod: 9, previousPeriod: 0 },
    ];

    expect(weightedRate(rateSeries, weightSeries, "currentPeriod")).toBe(90);
  });

  it("returns 0 when total weight is 0, instead of dividing by zero", () => {
    const rateSeries = [{ date: "0", currentPeriod: 50, previousPeriod: 0 }];
    const weightSeries = [{ date: "0", currentPeriod: 0, previousPeriod: 0 }];

    expect(weightedRate(rateSeries, weightSeries, "currentPeriod")).toBe(0);
  });

  it("treats a bucket missing from the weight series as zero weight", () => {
    const rateSeries = [
      { date: "0", currentPeriod: 50, previousPeriod: 0 },
      { date: "1", currentPeriod: 20, previousPeriod: 0 },
    ];
    const weightSeries = [{ date: "0", currentPeriod: 10, previousPeriod: 0 }];

    // Only bucket 0 has weight, so it fully determines the result.
    expect(weightedRate(rateSeries, weightSeries, "currentPeriod")).toBe(50);
  });
});

describe("sparklineToSeries", () => {
  it("maps bare sparkline numbers into TimeSeriesData points with empty dates and zeroed previousPeriod", () => {
    expect(sparklineToSeries([10, 20, 30])).toEqual([
      { date: "", currentPeriod: 10, previousPeriod: 0 },
      { date: "", currentPeriod: 20, previousPeriod: 0 },
      { date: "", currentPeriod: 30, previousPeriod: 0 },
    ]);
  });

  it("returns an empty array for an empty sparkline", () => {
    expect(sparklineToSeries([])).toEqual([]);
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
    itemsSoldOverTime: {
      current: [{ date: "Aug 1", itemsSold: 10 }],
      previous: [{ date: "Aug 1", itemsSold: 6 }],
    },
    returningCustomerRate: { current: 50, previous: 40 },
    newAndReturningCustomerCounts: {
      current: { new: 6, returning: 6 },
      previous: { new: 7, returning: 4 },
    },
    returningCustomerRateBreakdown: {
      current: [
        { date: "2026-08-01T00:00:00.000Z", customers: 12, returningCustomers: 6 },
      ],
      previous: [
        { date: "2026-07-25T00:00:00.000Z", customers: 11, returningCustomers: 4 },
      ],
    },
    salesByProduct: [{ name: "Widget", value: 100 }],
    salesByChannel: [{ name: "Online Store", value: 100 }],
    sessionsOverTime: [{ date: "Aug 1", currentPeriod: 10, previousPeriod: 8 }],
    sessionsOverTimeBreakdown: [
      {
        date: "Aug 1",
        sessions: { current: 10, previous: 8 },
        onlineStoreVisitors: { current: 7, previous: 6 },
      },
    ],
    sessionsByDevice: [{ name: "mobile", value: 10 }],
    sessionsByLocation: [{ name: "US · NY", value: 10 }],
    conversionFunnel: [{ step: "Sessions", sessions: 10, percentage: 100 }],
    conversionRateOverTime: [
      { date: "Aug 1", currentPeriod: 10, previousPeriod: 5 },
    ],
    conversionRateOverTimeBreakdown: [
      {
        date: "Aug 1",
        sessions: { current: 100, previous: 80 },
        addedToCart: { current: 30, previous: 24 },
        reachedCheckout: { current: 15, previous: 12 },
        completedCheckout: { current: 10, previous: 4 },
        conversionRate: { current: 10, previous: 5 },
      },
    ],
    conversionRateSummary: { value: 10, changePercentage: 100, trend: "up" },
    totalSalesBySocialReferrer: [{ name: "youtube", value: 50 }],
    customerCohortAnalysis: [],
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
    expect(payload.summaryCards.returningCustomerRate).toEqual({
      value: 50,
      changePercentage: 25,
      trend: "up",
      sparkline: [50],
    });
    expect(payload.summaryCards.conversionRate).toEqual({
      value: 10,
      changePercentage: 100,
      trend: "up",
      sparkline: [10],
    });
    // current: netRevenue 90 / ordersCount 4 = 22.5; previous: 90 / 3 = 30.
    expect(payload.summaryCards.averageOrderValue.value).toBe(22.5);
  });

  it("formats revenueBreakdownOverTime date labels from real WC date_start strings, including time only for an 'hour' interval", () => {
    const raw = baseRaw();
    raw.revenueStats = {
      current: revenueStats({ grossSales: 100, ordersCount: 4 }),
      previous: revenueStats({ grossSales: 80, ordersCount: 3 }),
    };
    raw.revenueStats.current.intervals[0].date = "2026-09-02 23:00:00";
    raw.revenueStats.previous.intervals[0].date = "2026-09-01 23:00:00";

    const hourly = buildDashboardPayload(raw, "hour");
    expect(hourly.charts.revenueBreakdownOverTime[0]).toMatchObject({
      currentDateLabel: "Sep 2, 2026, 11:00 PM",
      previousDateLabel: "Sep 1, 2026, 11:00 PM",
    });

    const daily = buildDashboardPayload(raw, "day");
    expect(daily.charts.revenueBreakdownOverTime[0]).toMatchObject({
      currentDateLabel: "Sep 2, 2026",
      previousDateLabel: "Sep 1, 2026",
    });
  });

  it("computes averageOrderValue from period totals, not an average of the sparse per-bucket aovOverTime series", () => {
    // Regression test: aovOverTime zero-fills empty buckets (see
    // aovOverTimeFrom), so naively averaging that series across many mostly-
    // empty buckets massively understates the true AOV whenever order
    // activity is concentrated in a few buckets — e.g. a single busy hour
    // out of 24. The headline must come from totals.averageOrderValue
    // (total net revenue / total orders for the whole period) instead.
    const sparseIntervals = (ordersInBucket: number) =>
      Array.from({ length: 24 }, (_, i) => ({
        date: `${i}:00`,
        grossSales: i === 0 ? 1194 : 0,
        netRevenue: i === 0 ? 796 : 0,
        discounts: 0,
        refunds: 0,
        shipping: 0,
        taxes: 0,
        totalSales: i === 0 ? 796 : 0,
        ordersCount: i === 0 ? ordersInBucket : 0,
      }));
    const sparseRevenueStats = (ordersInBucket: number): RevenueStatsResult => ({
      intervals: sparseIntervals(ordersInBucket),
      totals: {
        grossSales: 1194,
        netRevenue: 796,
        discounts: 398,
        refunds: 0,
        shipping: 0,
        taxes: 0,
        totalSales: 796,
        ordersCount: ordersInBucket,
        averageOrderValue: 796 / ordersInBucket,
      },
    });
    const raw = baseRaw();
    raw.revenueStats = {
      current: sparseRevenueStats(6),
      previous: sparseRevenueStats(3),
    };

    const payload = buildDashboardPayload(raw);

    expect(payload.summaryCards.averageOrderValue.value).toBeCloseTo(
      796 / 6,
    );
    // The naive (buggy) calculation would average 24 mostly-zero buckets:
    // (796/6) / 24 ≈ 5.53 — assert we're nowhere near that.
    expect(payload.summaryCards.averageOrderValue.value).toBeGreaterThan(100);
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
    expect(payload.charts.revenueBreakdownOverTime).toEqual([
      {
        // baseRaw()'s fixture date ("Aug 1") isn't real WC date_start
        // format, so formatWcIntervalLabel falls back to it unchanged.
        currentDateLabel: "Aug 1",
        previousDateLabel: "Aug 1",
        grossSales: { current: 100, previous: 80 },
        discounts: { current: -5, previous: -5 },
        orders: { current: 4, previous: 3 },
        averageOrderValue: { current: 90 / 4, previous: 90 / 3 },
      },
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

  it("derives salesOverTimeBreakdown per-interval rows directly from revenue stats intervals, with duties/additionalFees always zero (WC has no such fields)", () => {
    const payload = buildDashboardPayload(baseRaw());

    expect(payload.charts.salesOverTimeBreakdown).toEqual([
      {
        currentDateLabel: "Aug 1",
        previousDateLabel: "Aug 1",
        orders: { current: 4, previous: 3 },
        grossSales: { current: 100, previous: 80 },
        discounts: { current: -5, previous: -5 },
        salesReversals: { current: -2, previous: -2 },
        netSales: { current: 90, previous: 90 },
        shippingCharges: { current: 8, previous: 8 },
        duties: { current: 0, previous: 0 },
        additionalFees: { current: 0, previous: 0 },
        taxes: { current: 3, previous: 3 },
        totalSales: { current: 101, previous: 101 },
      },
    ]);
  });

  it("derives returningCustomerRateBreakdown rows from the raw per-bucket customer activity, formatting date labels as UTC", () => {
    const payload = buildDashboardPayload(baseRaw(), "day");

    expect(payload.charts.returningCustomerRateBreakdown).toEqual([
      {
        currentDateLabel: "Aug 1, 2026",
        previousDateLabel: "Jul 25, 2026",
        returningCustomers: { current: 6, previous: 4 },
        customers: { current: 12, previous: 11 },
        returningCustomerRate: { current: 50, previous: 36.4 },
      },
    ]);
  });

  it("computes returningCustomerRateSummary from the whole-period new/returning counts, not by summing the breakdown rows", () => {
    const payload = buildDashboardPayload(baseRaw());

    expect(payload.charts.returningCustomerRateSummary).toEqual({
      returningCustomers: { current: 6, previous: 4 },
      customers: { current: 12, previous: 11 },
      returningCustomerRate: { current: 50, previous: 40 },
    });
  });

  it("isolates a returningCustomerRateBreakdown failure to its own card, defaulting to an empty array, without affecting the returningCustomerRate summary card", () => {
    const raw = baseRaw();
    raw.returningCustomerRateBreakdown = new Error("WC API error");

    const payload = buildDashboardPayload(raw);

    expect(payload.errors.returningCustomerRate).toBe("WC API error");
    expect(payload.charts.returningCustomerRateBreakdown).toEqual([]);
    expect(payload.summaryCards.returningCustomerRate.value).toBe(50);
  });

  it("derives ordersOverTimeBreakdown rows from revenueStats (orders, AOV) plus itemsSoldOverTime (items per order), with reversedQuantity always zero (WC has no item-refund-quantity field)", () => {
    const payload = buildDashboardPayload(baseRaw());

    expect(payload.charts.ordersOverTimeBreakdown).toEqual([
      {
        currentDateLabel: "Aug 1",
        previousDateLabel: "Aug 1",
        orders: { current: 4, previous: 3 },
        itemsPerOrder: { current: 2.5, previous: 2 },
        averageOrderValue: { current: 22.5, previous: 30 },
        reversedQuantity: { current: 0, previous: 0 },
      },
    ]);
  });

  it("isolates an itemsSoldOverTime failure to the ordersOverTimeBreakdown chart, defaulting items per order to zero, without affecting the orders summary card", () => {
    const raw = baseRaw();
    raw.itemsSoldOverTime = new Error("WC API error");

    const payload = buildDashboardPayload(raw);

    expect(payload.errors.orders).toBe("WC API error");
    expect(payload.charts.ordersOverTimeBreakdown).toEqual([
      {
        currentDateLabel: "Aug 1",
        previousDateLabel: "Aug 1",
        orders: { current: 4, previous: 3 },
        itemsPerOrder: { current: 0, previous: 0 },
        averageOrderValue: { current: 22.5, previous: 30 },
        reversedQuantity: { current: 0, previous: 0 },
      },
    ]);
    expect(payload.summaryCards.orders.value).toBe(4);
  });

  it("passes through GA4-sourced charts unchanged", () => {
    const payload = buildDashboardPayload(baseRaw());

    expect(payload.charts.sessionsOverTime).toEqual([
      { date: "Aug 1", currentPeriod: 10, previousPeriod: 8 },
    ]);
    expect(payload.charts.totalSalesBySocialReferrer).toEqual([
      { name: "youtube", value: 50 },
    ]);
    expect(payload.charts.sessionsOverTimeBreakdown).toEqual([
      {
        date: "Aug 1",
        sessions: { current: 10, previous: 8 },
        onlineStoreVisitors: { current: 7, previous: 6 },
      },
    ]);
    expect(payload.charts.conversionRateOverTimeBreakdown).toEqual([
      {
        date: "Aug 1",
        sessions: { current: 100, previous: 80 },
        addedToCart: { current: 30, previous: 24 },
        reachedCheckout: { current: 15, previous: 12 },
        completedCheckout: { current: 10, previous: 4 },
        conversionRate: { current: 10, previous: 5 },
      },
    ]);
  });

  it("isolates a conversionRateOverTimeBreakdown failure without affecting the plain conversionRateOverTime chart", () => {
    const raw = baseRaw();
    raw.conversionRateOverTimeBreakdown = new Error("GA4 quota exceeded");

    const payload = buildDashboardPayload(raw);

    expect(payload.errors.conversionRateOverTimeBreakdown).toBe(
      "GA4 quota exceeded",
    );
    expect(payload.charts.conversionRateOverTimeBreakdown).toEqual([]);
    expect(payload.charts.conversionRateOverTime).toEqual([
      { date: "Aug 1", currentPeriod: 10, previousPeriod: 5 },
    ]);
  });

  it("isolates a sessionsOverTimeBreakdown failure without affecting the plain sessionsOverTime chart", () => {
    const raw = baseRaw();
    raw.sessionsOverTimeBreakdown = new Error("GA4 quota exceeded");

    const payload = buildDashboardPayload(raw);

    expect(payload.errors.sessionsOverTimeBreakdown).toBe(
      "GA4 quota exceeded",
    );
    expect(payload.charts.sessionsOverTimeBreakdown).toEqual([]);
    expect(payload.charts.sessionsOverTime).toEqual([
      { date: "Aug 1", currentPeriod: 10, previousPeriod: 8 },
    ]);
  });

  it("isolates a customerCohortAnalysis failure to its own card, defaulting to an empty array", () => {
    const raw = baseRaw();
    raw.customerCohortAnalysis = new Error("WooCommerce API error 500");

    const payload = buildDashboardPayload(raw);

    expect(payload.errors.customerCohortAnalysis).toBe(
      "WooCommerce API error 500",
    );
    expect(payload.charts.customerCohortAnalysis).toEqual([]);
  });

  it("passes through customerCohortAnalysis rows unchanged on success", () => {
    const raw = baseRaw();
    raw.customerCohortAnalysis = [
      { cohortMonth: "2026-06", cohortSize: 2, retentionByMonth: [50] },
    ];

    const payload = buildDashboardPayload(raw);

    expect(payload.charts.customerCohortAnalysis).toEqual([
      { cohortMonth: "2026-06", cohortSize: 2, retentionByMonth: [50] },
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

  it("flags a conversion-rate-summary failure separately from the funnel and rate-over-time charts it doesn't affect", () => {
    const raw = baseRaw();
    raw.conversionRateSummary = new Error("GA4 quota exceeded");

    const payload = buildDashboardPayload(raw);

    expect(payload.errors.conversionRate).toBe("GA4 quota exceeded");
    expect(payload.summaryCards.conversionRate.value).toBe(0);
    // The funnel and rate-over-time charts come from separate GA4 calls, so
    // they stay populated even though the summary headline they're paired
    // with on the dashboard failed — page.tsx must check errors.conversionRate
    // itself rather than assume these charts' own success implies a valid
    // headline.
    expect(payload.charts.conversionFunnel).toEqual([
      { step: "Sessions", sessions: 10, percentage: 100 },
    ]);
    expect(payload.charts.conversionRateOverTime).toEqual([
      { date: "Aug 1", currentPeriod: 10, previousPeriod: 5 },
    ]);
  });
});
