import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResolvedDateRange } from "../types";

vi.mock("./client", () => ({ fetchWcAllPages: vi.fn() }));

import { fetchWcAllPages } from "./client";
import {
  getNewAndReturningCustomerCounts,
  getReturningCustomerRate,
  getReturningCustomerRateBreakdown,
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

describe("getReturningCustomerRateBreakdown", () => {
  const hourlyRange: ResolvedDateRange = {
    key: "today",
    interval: "hour",
    current: {
      start: new Date("2026-09-02T00:00:00.000Z"),
      end: new Date("2026-09-02T23:59:59.999Z"),
    },
    previous: {
      start: new Date("2026-09-01T00:00:00.000Z"),
      end: new Date("2026-09-01T23:59:59.999Z"),
    },
  };

  it("buckets orders by hour and classifies each bucket's customers as returning using the whole-period order count (not the bucket's own)", async () => {
    vi.mocked(fetchWcAllPages)
      .mockResolvedValueOnce([
        // customer 1: two orders in the same hour -> returning, attributed once to the 9 AM bucket
        { customer_id: 1, date_created_gmt: "2026-09-02 09:15:00" },
        { customer_id: 1, date_created_gmt: "2026-09-02 09:45:00" },
        // customer 2: a single order -> new
        { customer_id: 2, date_created_gmt: "2026-09-02 10:05:00" },
        // customer 3: two orders in *different* hours -> returning for the
        // whole period, attributed to both the 9 AM and 2 PM buckets
        { customer_id: 3, date_created_gmt: "2026-09-02 09:30:00" },
        { customer_id: 3, date_created_gmt: "2026-09-02 14:10:00" },
      ])
      .mockResolvedValueOnce([]);

    const result = await getReturningCustomerRateBreakdown(hourlyRange);

    expect(result.current).toHaveLength(24);
    const hour9 = result.current.find(
      (row) => row.date === "2026-09-02T09:00:00.000Z",
    );
    expect(hour9).toEqual({
      date: "2026-09-02T09:00:00.000Z",
      customers: 2,
      returningCustomers: 2,
    });
    const hour10 = result.current.find(
      (row) => row.date === "2026-09-02T10:00:00.000Z",
    );
    expect(hour10).toEqual({
      date: "2026-09-02T10:00:00.000Z",
      customers: 1,
      returningCustomers: 0,
    });
    const hour14 = result.current.find(
      (row) => row.date === "2026-09-02T14:00:00.000Z",
    );
    expect(hour14).toEqual({
      date: "2026-09-02T14:00:00.000Z",
      customers: 1,
      returningCustomers: 1,
    });

    expect(result.previous).toHaveLength(24);
    expect(result.previous.every((row) => row.customers === 0)).toBe(true);
  });

  it("returns rows most-recent-bucket-first", async () => {
    vi.mocked(fetchWcAllPages).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const result = await getReturningCustomerRateBreakdown(hourlyRange);

    expect(result.current[0].date).toBe("2026-09-02T23:00:00.000Z");
    expect(result.current[23].date).toBe("2026-09-02T00:00:00.000Z");
  });

  it("buckets by day when the range interval is 'day'", async () => {
    const dailyRange: ResolvedDateRange = {
      key: "7d",
      interval: "day",
      current: {
        start: new Date("2026-08-01T00:00:00.000Z"),
        end: new Date("2026-08-03T23:59:59.999Z"),
      },
      previous: {
        start: new Date("2026-07-29T00:00:00.000Z"),
        end: new Date("2026-07-31T23:59:59.999Z"),
      },
    };
    vi.mocked(fetchWcAllPages)
      .mockResolvedValueOnce([
        // customer 10: orders on day 1 and day 3 -> returning for the whole
        // period, attributed to both days
        { customer_id: 10, date_created_gmt: "2026-08-01 05:00:00" },
        { customer_id: 10, date_created_gmt: "2026-08-03 06:00:00" },
      ])
      .mockResolvedValueOnce([]);

    const result = await getReturningCustomerRateBreakdown(dailyRange);

    expect(result.current).toEqual([
      {
        date: "2026-08-03T00:00:00.000Z",
        customers: 1,
        returningCustomers: 1,
      },
      {
        date: "2026-08-02T00:00:00.000Z",
        customers: 0,
        returningCustomers: 0,
      },
      {
        date: "2026-08-01T00:00:00.000Z",
        customers: 1,
        returningCustomers: 1,
      },
    ]);
  });

  it("queries the orders report once per period, scoped to that period's bounds", async () => {
    vi.mocked(fetchWcAllPages).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await getReturningCustomerRateBreakdown(hourlyRange);

    expect(fetchWcAllPages).toHaveBeenCalledTimes(2);
    expect(fetchWcAllPages).toHaveBeenCalledWith(
      "/wc-analytics/reports/orders",
      expect.objectContaining({
        after: hourlyRange.current.start.toISOString(),
        before: hourlyRange.current.end.toISOString(),
      }),
    );
  });
});
