import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResolvedDateRange } from "../types";

vi.mock("./client", () => ({ fetchWcCount: vi.fn(), fetchWc: vi.fn() }));

import { fetchWc, fetchWcCount } from "./client";
import { getItemsSoldOverTime, getOrdersFulfilled } from "./orders";

afterEach(() => {
  vi.resetAllMocks();
});

const range: ResolvedDateRange = {
  key: "7d",
  interval: "day",
  current: { start: new Date("2026-08-01"), end: new Date("2026-08-07") },
  previous: { start: new Date("2026-07-25"), end: new Date("2026-07-31") },
};

describe("getOrdersFulfilled", () => {
  it("counts completed orders for current and previous periods", async () => {
    vi.mocked(fetchWcCount).mockResolvedValueOnce(12).mockResolvedValueOnce(9);

    const result = await getOrdersFulfilled(range);

    expect(result).toEqual({ current: 12, previous: 9 });
    expect(fetchWcCount).toHaveBeenCalledWith(
      "/wc-analytics/reports/orders",
      expect.objectContaining({
        "status_is[]": "completed",
        after: range.current.start.toISOString(),
        before: range.current.end.toISOString(),
      }),
    );
  });
});

describe("getItemsSoldOverTime", () => {
  it("maps orders/stats interval subtotals into per-bucket item counts for both periods", async () => {
    vi.mocked(fetchWc)
      .mockResolvedValueOnce({
        intervals: [
          { date_start: "2026-08-07 00:00:00", subtotals: { num_items_sold: 12 } },
          { date_start: "2026-08-06 00:00:00", subtotals: { num_items_sold: 8 } },
        ],
      })
      .mockResolvedValueOnce({
        intervals: [
          { date_start: "2026-07-31 00:00:00", subtotals: { num_items_sold: 5 } },
        ],
      });

    const result = await getItemsSoldOverTime(range);

    expect(result.current).toEqual([
      { date: "2026-08-07 00:00:00", itemsSold: 12 },
      { date: "2026-08-06 00:00:00", itemsSold: 8 },
    ]);
    expect(result.previous).toEqual([
      { date: "2026-07-31 00:00:00", itemsSold: 5 },
    ]);
  });

  it("queries orders/stats once per period, scoped to that period's bounds and interval", async () => {
    vi.mocked(fetchWc)
      .mockResolvedValueOnce({ intervals: [] })
      .mockResolvedValueOnce({ intervals: [] });

    await getItemsSoldOverTime(range);

    expect(fetchWc).toHaveBeenCalledTimes(2);
    expect(fetchWc).toHaveBeenCalledWith(
      "/wc-analytics/reports/orders/stats",
      expect.objectContaining({
        after: range.current.start.toISOString(),
        before: range.current.end.toISOString(),
        interval: range.interval,
      }),
    );
  });
});
