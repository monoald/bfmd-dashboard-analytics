import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResolvedDateRange } from "../types";

vi.mock("./client", () => ({ fetchWc: vi.fn() }));

import { fetchWc } from "./client";
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
  it("computes the percentage of active customers who had ordered before the period started", async () => {
    vi.mocked(fetchWc)
      // current period: 4 customers active in this window
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }])
      // of those 4, only 1 and 3 have any order before the window started
      .mockResolvedValueOnce([
        { id: 1, orders_count: 2 },
        { id: 3, orders_count: 1 },
      ])
      // previous period: 1 customer active in that window
      .mockResolvedValueOnce([{ id: 5 }])
      // customer 5 has no prior orders before the previous window started
      .mockResolvedValueOnce([]);

    const result = await getReturningCustomerRate(range);

    expect(result.current).toBe(50);
    expect(result.previous).toBe(0);
  });

  it("returns 0 when there are no active customers in the period, without querying prior orders", async () => {
    vi.mocked(fetchWc).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const result = await getReturningCustomerRate(range);

    expect(result).toEqual({ current: 0, previous: 0 });
    expect(fetchWc).toHaveBeenCalledTimes(2);
  });

  it("looks up prior orders for exactly the active customers' IDs, before the period's start", async () => {
    vi.mocked(fetchWc)
      .mockResolvedValueOnce([{ id: 10 }, { id: 20 }])
      .mockResolvedValueOnce([{ id: 10, orders_count: 1 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await getReturningCustomerRate(range);

    expect(fetchWc).toHaveBeenNthCalledWith(
      2,
      "/wc-analytics/reports/customers",
      expect.objectContaining({
        customers: "10,20",
        before: new Date(range.current.start.getTime() - 1).toISOString(),
      }),
    );
  });
});

describe("getNewAndReturningCustomerCounts", () => {
  it("splits active customers into new and returning counts per period", async () => {
    vi.mocked(fetchWc)
      // current period: 4 customers active in this window
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }])
      // of those 4, only 1 and 3 have any order before the window started
      .mockResolvedValueOnce([
        { id: 1, orders_count: 2 },
        { id: 3, orders_count: 1 },
      ])
      // previous period: 1 customer active in that window
      .mockResolvedValueOnce([{ id: 5 }])
      // customer 5 has no prior orders before the previous window started
      .mockResolvedValueOnce([]);

    const result = await getNewAndReturningCustomerCounts(range);

    expect(result.current).toEqual({ new: 2, returning: 2 });
    expect(result.previous).toEqual({ new: 1, returning: 0 });
  });

  it("returns zero counts for a period with no active customers, without querying prior orders", async () => {
    vi.mocked(fetchWc).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const result = await getNewAndReturningCustomerCounts(range);

    expect(result).toEqual({
      current: { new: 0, returning: 0 },
      previous: { new: 0, returning: 0 },
    });
    expect(fetchWc).toHaveBeenCalledTimes(2);
  });
});
