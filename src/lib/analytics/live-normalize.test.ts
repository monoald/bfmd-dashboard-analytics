import { describe, expect, it } from "vitest";
import { buildLiveViewPayload } from "./live-normalize";
import type { RawLiveViewResults } from "./live-normalize";

const EMPTY_REVENUE_STATS = {
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

function happyPathRaw(): RawLiveViewResults {
  return {
    revenueStats: {
      current: {
        intervals: [
          {
            date: "12 AM",
            grossSales: 100,
            netRevenue: 90,
            discounts: 10,
            refunds: 0,
            shipping: 0,
            taxes: 0,
            totalSales: 95,
            ordersCount: 2,
          },
        ],
        totals: {
          ...EMPTY_REVENUE_STATS.totals,
          totalSales: 95,
          ordersCount: 2,
        },
      },
      previous: {
        intervals: [],
        totals: {
          ...EMPTY_REVENUE_STATS.totals,
          totalSales: 200,
          ordersCount: 5,
        },
      },
    },
    sessionsOverTime: [
      { date: "12 AM", currentPeriod: 10, previousPeriod: 20 },
    ],
    conversionFunnel: [
      { step: "Sessions", sessions: 10, percentage: 100, previousSessions: 20 },
      {
        step: "Added to cart",
        sessions: 4,
        percentage: 40,
        previousSessions: 8,
      },
      {
        step: "Reached checkout",
        sessions: 3,
        percentage: 30,
        previousSessions: 6,
      },
      {
        step: "Completed checkout",
        sessions: 2,
        percentage: 20,
        previousSessions: 5,
      },
    ],
    sessionsByLocation: [{ name: "United States · Florida · Miami", value: 5 }],
    newAndReturningCustomers: { new: 3, returning: 2 },
    salesByProduct: [{ name: "Widget", value: 95 }],
  };
}

describe("buildLiveViewPayload", () => {
  it("maps a full happy-path raw pipeline into a LiveViewPayload with no errors", () => {
    const payload = buildLiveViewPayload(happyPathRaw(), 12);

    expect(payload.visitorsRightNow).toBe(12);
    expect(payload.summaryCards.totalSales).toEqual({
      value: 95,
      changePercentage: -52.5,
      trend: "down",
      sparkline: [95],
    });
    expect(payload.summaryCards.sessions).toEqual({
      value: 10,
      changePercentage: -50,
      trend: "down",
      sparkline: [10],
    });
    expect(payload.summaryCards.orders).toEqual({
      value: 2,
      changePercentage: -60,
      trend: "down",
      sparkline: [2],
    });
    // customerBehavior drops the "Sessions" step and relabels the rest
    expect(payload.customerBehavior).toEqual([
      {
        step: "Active carts",
        sessions: 4,
        percentage: 40,
        previousSessions: 8,
      },
      {
        step: "Checking out",
        sessions: 3,
        percentage: 30,
        previousSessions: 6,
      },
      { step: "Purchased", sessions: 2, percentage: 20, previousSessions: 5 },
    ]);
    expect(payload.sessionsByLocation).toEqual([
      { name: "United States · Florida · Miami", value: 5 },
    ]);
    expect(payload.newVsReturning).toEqual({ new: 3, returning: 2 });
    expect(payload.salesByProduct).toEqual([{ name: "Widget", value: 95 }]);
    expect(payload.errors).toEqual({});
  });

  it("isolates one card's fetch failure without affecting the others", () => {
    const raw = happyPathRaw();
    raw.sessionsByLocation = new Error("GA4 timeout");

    const payload = buildLiveViewPayload(raw, 12);

    expect(payload.errors.sessionsByLocation).toBe("GA4 timeout");
    expect(payload.sessionsByLocation).toEqual([]);
    // unrelated cards still populated
    expect(payload.summaryCards.totalSales.value).toBe(95);
    expect(payload.salesByProduct).toEqual([{ name: "Widget", value: 95 }]);
  });

  it("attributes a revenueStats failure to totalSales and orders, not the other cards", () => {
    const raw = happyPathRaw();
    raw.revenueStats = new Error("WC API down");

    const payload = buildLiveViewPayload(raw, 12);

    expect(payload.errors.totalSales).toBe("WC API down");
    expect(payload.errors.orders).toBe("WC API down");
    expect(payload.errors.sessions).toBeUndefined();
    expect(payload.summaryCards.totalSales).toEqual({
      value: 0,
      changePercentage: 0,
      trend: "up",
      sparkline: [],
    });
  });
});
