import { describe, expect, it, vi } from "vitest";
import type { ResolvedDateRange } from "../types";

vi.mock("./client", () => ({ fetchWc: vi.fn() }));

import { fetchWc } from "./client";
import { getRevenueStats } from "./revenue";

const range: ResolvedDateRange = {
  key: "7d",
  interval: "day",
  current: { start: new Date("2026-08-01"), end: new Date("2026-08-07") },
  previous: { start: new Date("2026-07-25"), end: new Date("2026-07-31") },
};

function rawResponse(grossSales: number) {
  return {
    intervals: [
      {
        date_start: "2026-08-01 00:00:00",
        subtotals: {
          gross_sales: grossSales,
          net_revenue: grossSales - 10,
          coupons: 5,
          refunds: 2,
          shipping: 8,
          taxes: 3,
          total_sales: grossSales - 10 + 8 + 3,
          orders_count: 4,
        },
      },
    ],
  };
}

describe("getRevenueStats", () => {
  it("fetches both current and previous periods with the resolved interval", async () => {
    vi.mocked(fetchWc).mockResolvedValueOnce(rawResponse(100)).mockResolvedValueOnce(rawResponse(80));

    await getRevenueStats(range);

    expect(fetchWc).toHaveBeenCalledWith(
      "/wc-analytics/reports/revenue/stats",
      expect.objectContaining({ interval: "day", after: range.current.start.toISOString(), before: range.current.end.toISOString() })
    );
    expect(fetchWc).toHaveBeenCalledWith(
      "/wc-analytics/reports/revenue/stats",
      expect.objectContaining({ interval: "day", after: range.previous.start.toISOString(), before: range.previous.end.toISOString() })
    );
  });

  it("maps WC subtotal fields to typed intervals and sums totals, including average order value", async () => {
    vi.mocked(fetchWc).mockResolvedValueOnce(rawResponse(100)).mockResolvedValueOnce(rawResponse(80));

    const result = await getRevenueStats(range);

    expect(result.current.intervals[0]).toEqual({
      date: "2026-08-01 00:00:00",
      grossSales: 100,
      netRevenue: 90,
      discounts: 5,
      refunds: 2,
      shipping: 8,
      taxes: 3,
      totalSales: 101,
      ordersCount: 4,
    });
    expect(result.current.totals.grossSales).toBe(100);
    expect(result.current.totals.ordersCount).toBe(4);
    expect(result.current.totals.averageOrderValue).toBe(90 / 4);
    expect(result.previous.totals.grossSales).toBe(80);
  });
});
