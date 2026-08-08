import { describe, expect, it, vi } from "vitest";
import type { ResolvedDateRange } from "../types";

vi.mock("./client", () => ({ runGa4Report: vi.fn() }));

import { runGa4Report } from "./client";
import {
  getConversionFunnel,
  getConversionRateOverTime,
  getConversionRateSummary,
} from "./funnel";

const range: ResolvedDateRange = {
  key: "7d",
  interval: "day",
  current: { start: new Date("2026-08-01"), end: new Date("2026-08-07") },
  previous: { start: new Date("2026-07-25"), end: new Date("2026-07-31") },
};

describe("getConversionFunnel", () => {
  it("builds four funnel steps with sessions and percentage of top-of-funnel sessions", async () => {
    vi.mocked(runGa4Report)
      .mockResolvedValueOnce([{ dimensionValues: [], metricValues: [1000] }]) // sessions
      .mockResolvedValueOnce([
        { dimensionValues: ["add_to_cart"], metricValues: [300] },
      ])
      .mockResolvedValueOnce([
        { dimensionValues: ["begin_checkout"], metricValues: [150] },
      ])
      .mockResolvedValueOnce([
        { dimensionValues: ["purchase"], metricValues: [100] },
      ]);

    const result = await getConversionFunnel(range);

    expect(result).toEqual([
      { step: "Sessions", sessions: 1000, percentage: 100 },
      { step: "Added to cart", sessions: 300, percentage: 30 },
      { step: "Reached checkout", sessions: 150, percentage: 15 },
      { step: "Completed checkout", sessions: 100, percentage: 10 },
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
  it("aligns current and previous per-bucket conversion rates", async () => {
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

    expect(result).toEqual([
      { date: "Aug 1", currentPeriod: 10, previousPeriod: 10 },
    ]);
  });
});
