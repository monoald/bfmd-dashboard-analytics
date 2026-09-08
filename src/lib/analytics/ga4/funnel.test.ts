import { describe, expect, it, vi } from "vitest";
import type { ResolvedDateRange } from "../types";

vi.mock("./client", () => ({ runGa4Report: vi.fn() }));

import { runGa4Report } from "./client";
import {
  getConversionFunnel,
  getConversionRateOverTime,
  getConversionRateOverTimeBreakdown,
  getConversionRateSummary,
} from "./funnel";

const range: ResolvedDateRange = {
  key: "7d",
  interval: "day",
  current: { start: new Date("2026-08-01"), end: new Date("2026-08-07") },
  previous: { start: new Date("2026-07-25"), end: new Date("2026-07-31") },
};

describe("getConversionFunnel", () => {
  it("builds four funnel steps with sessions, percentage of top-of-funnel sessions, and previousSessions", async () => {
    vi.mocked(runGa4Report)
      .mockResolvedValueOnce([{ dimensionValues: [], metricValues: [1000] }]) // current sessions
      .mockResolvedValueOnce([
        { dimensionValues: ["add_to_cart"], metricValues: [300] },
      ])
      .mockResolvedValueOnce([
        { dimensionValues: ["begin_checkout"], metricValues: [150] },
      ])
      .mockResolvedValueOnce([
        { dimensionValues: ["purchase"], metricValues: [100] },
      ])
      .mockResolvedValueOnce([{ dimensionValues: [], metricValues: [800] }]) // previous sessions
      .mockResolvedValueOnce([
        { dimensionValues: ["add_to_cart"], metricValues: [280] },
      ])
      .mockResolvedValueOnce([
        { dimensionValues: ["begin_checkout"], metricValues: [140] },
      ])
      .mockResolvedValueOnce([
        { dimensionValues: ["purchase"], metricValues: [90] },
      ]);

    const result = await getConversionFunnel(range);

    expect(result).toEqual([
      {
        step: "Sessions",
        sessions: 1000,
        percentage: 100,
        previousSessions: 800,
      },
      {
        step: "Added to cart",
        sessions: 300,
        percentage: 30,
        previousSessions: 280,
      },
      {
        step: "Reached checkout",
        sessions: 150,
        percentage: 15,
        previousSessions: 140,
      },
      {
        step: "Completed checkout",
        sessions: 100,
        percentage: 10,
        previousSessions: 90,
      },
    ]);
  });
});

describe("getConversionRateSummary", () => {
  it("computes the change in completed-checkout / sessions between periods", async () => {
    vi.mocked(runGa4Report)
      .mockResolvedValueOnce([{ dimensionValues: [], metricValues: [1000] }])
      .mockResolvedValueOnce([
        { dimensionValues: ["add_to_cart"], metricValues: [300] },
      ])
      .mockResolvedValueOnce([
        { dimensionValues: ["begin_checkout"], metricValues: [150] },
      ])
      .mockResolvedValueOnce([
        { dimensionValues: ["purchase"], metricValues: [100] },
      ])
      .mockResolvedValueOnce([{ dimensionValues: [], metricValues: [800] }])
      .mockResolvedValueOnce([
        { dimensionValues: ["add_to_cart"], metricValues: [200] },
      ])
      .mockResolvedValueOnce([
        { dimensionValues: ["begin_checkout"], metricValues: [100] },
      ])
      .mockResolvedValueOnce([
        { dimensionValues: ["purchase"], metricValues: [64] },
      ]);

    const result = await getConversionRateSummary(range);

    expect(result.value).toBe(10);
    expect(result.trend).toBe("up");
  });
});

describe("getConversionRateOverTime", () => {
  it("aligns current and previous per-bucket conversion rates, zero-filling days GA4 didn't return", async () => {
    vi.mocked(runGa4Report)
      .mockResolvedValueOnce([
        { dimensionValues: ["20260801"], metricValues: [100] },
      ]) // current sessions
      .mockResolvedValueOnce([
        { dimensionValues: ["20260801", "purchase"], metricValues: [10] },
      ]) // current purchases
      .mockResolvedValueOnce([
        { dimensionValues: ["20260725"], metricValues: [50] },
      ]) // previous sessions
      .mockResolvedValueOnce([
        { dimensionValues: ["20260725", "purchase"], metricValues: [5] },
      ]); // previous purchases

    const result = await getConversionRateOverTime(range);

    // range spans 7 days each side; only one active day was returned per
    // side, the rest must be zero-filled rather than dropped.
    expect(result).toHaveLength(7);
    expect(result[0]).toEqual({
      date: "Aug 1",
      currentPeriod: 10,
      previousPeriod: 10,
    });
    expect(result[1]).toEqual({
      date: "Aug 2",
      currentPeriod: 0,
      previousPeriod: 0,
    });
  });
});

describe("getConversionRateOverTimeBreakdown", () => {
  it("aligns sessions and each funnel-step count per bucket, computing conversionRate from the raw counts (not averaging per-bucket percentages)", async () => {
    vi.mocked(runGa4Report)
      .mockResolvedValueOnce([
        { dimensionValues: ["20260801"], metricValues: [100] },
      ]) // current sessions
      .mockResolvedValueOnce([
        { dimensionValues: ["20260801", "add_to_cart"], metricValues: [40] },
      ]) // current addedToCart
      .mockResolvedValueOnce([
        {
          dimensionValues: ["20260801", "begin_checkout"],
          metricValues: [20],
        },
      ]) // current reachedCheckout
      .mockResolvedValueOnce([
        { dimensionValues: ["20260801", "purchase"], metricValues: [10] },
      ]) // current completedCheckout
      .mockResolvedValueOnce([
        { dimensionValues: ["20260725"], metricValues: [50] },
      ]) // previous sessions
      .mockResolvedValueOnce([
        { dimensionValues: ["20260725", "add_to_cart"], metricValues: [15] },
      ]) // previous addedToCart
      .mockResolvedValueOnce([
        {
          dimensionValues: ["20260725", "begin_checkout"],
          metricValues: [8],
        },
      ]) // previous reachedCheckout
      .mockResolvedValueOnce([
        { dimensionValues: ["20260725", "purchase"], metricValues: [5] },
      ]); // previous completedCheckout

    const result = await getConversionRateOverTimeBreakdown(range);

    expect(result).toHaveLength(7);
    expect(result[0]).toEqual({
      date: "Aug 1",
      sessions: { current: 100, previous: 50 },
      addedToCart: { current: 40, previous: 15 },
      reachedCheckout: { current: 20, previous: 8 },
      completedCheckout: { current: 10, previous: 5 },
      // conversionRate = completedCheckout / sessions * 100: 10/100=10.0,
      // 5/50=10.0 — deliberately equal to the naive "average the rate"
      // result here, so a regression to averaging wouldn't be caught by
      // this row alone; the point of this test is the shape/wiring, not
      // distinguishing the two calculation methods (that's covered by the
      // existing weightedRate/AOV regression tests elsewhere).
      conversionRate: { current: 10, previous: 10 },
    });
    expect(result[1]).toEqual({
      date: "Aug 2",
      sessions: { current: 0, previous: 0 },
      addedToCart: { current: 0, previous: 0 },
      reachedCheckout: { current: 0, previous: 0 },
      completedCheckout: { current: 0, previous: 0 },
      conversionRate: { current: 0, previous: 0 },
    });
  });
});
