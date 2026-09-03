import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResolvedDateRange } from "../types";

vi.mock("./client", () => ({ fetchWcAllPages: vi.fn() }));

import { fetchWcAllPages } from "./client";
import {
  getNewAndReturningCustomerCounts,
  getReturningCustomerRate,
} from "./customers";

afterEach(() => {
  // restoreAllMocks only restores vi.spyOn spies to their original
  // implementation; this mock is a plain vi.fn() with no "original" to
  // restore to, so its queued mockResolvedValueOnce values and call
  // history need resetAllMocks instead.
  vi.resetAllMocks();
});

const range: ResolvedDateRange = {
  key: "7d",
  interval: "day",
  current: { start: new Date("2026-08-01"), end: new Date("2026-08-07") },
  previous: { start: new Date("2026-07-25"), end: new Date("2026-07-31") },
};

describe("getReturningCustomerRate", () => {
  it("computes the percentage of active customers who placed more than one order within the period", async () => {
    vi.mocked(fetchWcAllPages)
      // current period: 4 customers active in this window, 2 of whom
      // (ids 1 and 3) placed more than one order within it
      .mockResolvedValueOnce([
        { id: 1, orders_count: 2 },
        { id: 2, orders_count: 1 },
        { id: 3, orders_count: 3 },
        { id: 4, orders_count: 1 },
      ])
      // previous period: 1 customer active, with a single order
      .mockResolvedValueOnce([{ id: 5, orders_count: 1 }]);

    const result = await getReturningCustomerRate(range);

    expect(result.current).toBe(50);
    expect(result.previous).toBe(0);
  });

  it("returns 0 when there are no active customers in the period", async () => {
    vi.mocked(fetchWcAllPages).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const result = await getReturningCustomerRate(range);

    expect(result).toEqual({ current: 0, previous: 0 });
    expect(fetchWcAllPages).toHaveBeenCalledTimes(2);
  });

  it("queries the customers report once per period, scoped to that period's bounds", async () => {
    vi.mocked(fetchWcAllPages)
      .mockResolvedValueOnce([{ id: 10, orders_count: 1 }])
      .mockResolvedValueOnce([]);

    await getReturningCustomerRate(range);

    expect(fetchWcAllPages).toHaveBeenCalledTimes(2);
    expect(fetchWcAllPages).toHaveBeenCalledWith(
      "/wc-analytics/reports/customers",
      expect.objectContaining({
        after: range.current.start.toISOString(),
        before: range.current.end.toISOString(),
      }),
    );
  });
});

describe("getNewAndReturningCustomerCounts", () => {
  it("splits active customers into new and returning counts per period", async () => {
    vi.mocked(fetchWcAllPages)
      // current period: 4 customers active, 2 of whom (ids 1 and 3)
      // placed more than one order within it
      .mockResolvedValueOnce([
        { id: 1, orders_count: 2 },
        { id: 2, orders_count: 1 },
        { id: 3, orders_count: 3 },
        { id: 4, orders_count: 1 },
      ])
      // previous period: 1 customer active, with a single order
      .mockResolvedValueOnce([{ id: 5, orders_count: 1 }]);

    const result = await getNewAndReturningCustomerCounts(range);

    expect(result.current).toEqual({ new: 2, returning: 2 });
    expect(result.previous).toEqual({ new: 1, returning: 0 });
  });

  it("returns zero counts for a period with no active customers", async () => {
    vi.mocked(fetchWcAllPages).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const result = await getNewAndReturningCustomerCounts(range);

    expect(result).toEqual({
      current: { new: 0, returning: 0 },
      previous: { new: 0, returning: 0 },
    });
    expect(fetchWcAllPages).toHaveBeenCalledTimes(2);
  });
});
