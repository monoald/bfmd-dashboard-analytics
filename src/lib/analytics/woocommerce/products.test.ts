import { describe, expect, it, vi } from "vitest";
import type { ResolvedDateRange } from "../types";

vi.mock("./client", () => ({ fetchWc: vi.fn() }));

import { fetchWc } from "./client";
import { getTopProductsByRevenue } from "./products";

const range: ResolvedDateRange = {
  key: "7d",
  interval: "day",
  current: { start: new Date("2026-08-01"), end: new Date("2026-08-07") },
  previous: { start: new Date("2026-07-25"), end: new Date("2026-07-31") },
};

describe("getTopProductsByRevenue", () => {
  it("maps product rows to NamedValue, ordered by revenue descending, with previousValue joined by product_id", async () => {
    vi.mocked(fetchWc)
      .mockResolvedValueOnce([
        {
          product_id: 1,
          extended_info: { name: "Cocoa Flavanols" },
          subtotals: { net_revenue: 236.4567 },
        },
        {
          product_id: 2,
          extended_info: { name: "Magnesium Sleep Aid" },
          subtotals: { net_revenue: 51.2 },
        },
      ])
      .mockResolvedValueOnce([
        { product_id: 1, subtotals: { net_revenue: 200 } },
        { product_id: 2, subtotals: { net_revenue: 60.005 } },
      ]);

    const result = await getTopProductsByRevenue(range);

    expect(result).toEqual([
      { name: "Cocoa Flavanols", value: 236.46, previousValue: 200 },
      { name: "Magnesium Sleep Aid", value: 51.2, previousValue: 60.01 },
    ]);
    expect(fetchWc).toHaveBeenNthCalledWith(
      1,
      "/wc-analytics/reports/revenue/products",
      expect.objectContaining({
        orderby: "net_revenue",
        order: "desc",
        per_page: "10",
        extended_info: "true",
      }),
    );
    expect(fetchWc).toHaveBeenNthCalledWith(
      2,
      "/wc-analytics/reports/revenue/products",
      expect.objectContaining({
        products: "1,2",
        per_page: "2",
      }),
    );
  });

  it("falls back to 'Unknown product' when extended_info is missing, and previousValue 0 when a product has no prior revenue", async () => {
    vi.mocked(fetchWc)
      .mockResolvedValueOnce([
        { product_id: 5, subtotals: { net_revenue: 10 } },
      ])
      .mockResolvedValueOnce([]);

    const result = await getTopProductsByRevenue(range);

    expect(result[0].name).toBe("Unknown product");
    expect(result[0].previousValue).toBe(0);
  });
});
