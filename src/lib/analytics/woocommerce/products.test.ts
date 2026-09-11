import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResolvedDateRange } from "../types";

vi.mock("./client", () => ({ fetchWc: vi.fn() }));

import { fetchWc } from "./client";
import { getSalesByProductBreakdown, getTopProductsByRevenue } from "./products";

afterEach(() => {
  vi.resetAllMocks();
});

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
          net_revenue: 236.4567,
        },
        {
          product_id: 2,
          extended_info: { name: "Magnesium Sleep Aid" },
          net_revenue: 51.2,
        },
      ])
      .mockResolvedValueOnce([
        { product_id: 1, net_revenue: 200 },
        { product_id: 2, net_revenue: 60.005 },
      ]);

    const result = await getTopProductsByRevenue(range);

    expect(result).toEqual([
      { name: "Cocoa Flavanols", value: 236.46, previousValue: 200 },
      { name: "Magnesium Sleep Aid", value: 51.2, previousValue: 60.01 },
    ]);
    expect(fetchWc).toHaveBeenNthCalledWith(
      1,
      "/wc-analytics/reports/products",
      expect.objectContaining({
        orderby: "net_revenue",
        order: "desc",
        per_page: "10",
        extended_info: "true",
      }),
    );
    expect(fetchWc).toHaveBeenNthCalledWith(
      2,
      "/wc-analytics/reports/products",
      expect.objectContaining({
        products: "1,2",
        per_page: "2",
      }),
    );
  });

  it("falls back to 'Unknown product' when extended_info is missing, and previousValue 0 when a product has no prior revenue", async () => {
    vi.mocked(fetchWc)
      .mockResolvedValueOnce([{ product_id: 5, net_revenue: 10 }])
      .mockResolvedValueOnce([]);

    const result = await getTopProductsByRevenue(range);

    expect(result[0].name).toBe("Unknown product");
    expect(result[0].previousValue).toBe(0);
  });
});

describe("getSalesByProductBreakdown", () => {
  it("maps product rows to breakdown rows with real items-sold/net-sales figures, a hardcoded vendor, and null for columns WC's products report doesn't expose", async () => {
    vi.mocked(fetchWc)
      .mockResolvedValueOnce([
        {
          product_id: 1,
          extended_info: { name: "Cocoa Flavanols" },
          net_revenue: 236.4567,
          items_sold: 12,
        },
      ])
      .mockResolvedValueOnce([
        { product_id: 1, net_revenue: 200, items_sold: 9 },
      ])
      .mockResolvedValueOnce([{ id: 1, type: "simple" }]);

    const result = await getSalesByProductBreakdown(range);

    expect(result).toEqual([
      {
        productId: 1,
        productTitle: "Cocoa Flavanols",
        productVendor: "Black Forest Supplements",
        productType: "Simple",
        netItemsSold: { current: 12, previous: 9 },
        grossSales: null,
        discounts: null,
        salesReversals: null,
        netSales: { current: 236.46, previous: 200 },
        taxes: null,
        totalSales: null,
      },
    ]);
  });

  it("looks up product type via a single core REST call with comma-separated IDs", async () => {
    vi.mocked(fetchWc)
      .mockResolvedValueOnce([
        { product_id: 1, extended_info: { name: "A" }, net_revenue: 10, items_sold: 1 },
        { product_id: 2, extended_info: { name: "B" }, net_revenue: 5, items_sold: 1 },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 1, type: "simple" },
        { id: 2, type: "variable" },
      ]);

    const result = await getSalesByProductBreakdown(range);

    expect(fetchWc).toHaveBeenNthCalledWith(
      3,
      "/wc/v3/products",
      expect.objectContaining({ include: "1,2", per_page: "2" }),
    );
    expect(result[0].productType).toBe("Simple");
    expect(result[1].productType).toBe("Variable");
  });

  it("falls back to 'Unknown' product type when a product is missing from the core lookup", async () => {
    vi.mocked(fetchWc)
      .mockResolvedValueOnce([
        { product_id: 1, extended_info: { name: "A" }, net_revenue: 10, items_sold: 1 },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await getSalesByProductBreakdown(range);

    expect(result[0].productType).toBe("Unknown");
  });

  it("returns an empty array when there are no product rows", async () => {
    vi.mocked(fetchWc).mockResolvedValueOnce([]);

    const result = await getSalesByProductBreakdown(range);

    expect(result).toEqual([]);
  });
});
