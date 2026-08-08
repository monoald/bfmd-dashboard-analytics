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
  it("maps product rows to NamedValue, ordered by revenue descending", async () => {
    vi.mocked(fetchWc).mockResolvedValue([
      {
        extended_info: { name: "Cocoa Flavanols" },
        subtotals: { net_revenue: 236.4567 },
      },
      {
        extended_info: { name: "Magnesium Sleep Aid" },
        subtotals: { net_revenue: 51.2 },
      },
    ]);

    const result = await getTopProductsByRevenue(range);

    expect(result).toEqual([
      { name: "Cocoa Flavanols", value: 236.46 },
      { name: "Magnesium Sleep Aid", value: 51.2 },
    ]);
    expect(fetchWc).toHaveBeenCalledWith(
      "/wc-analytics/reports/revenue/products",
      expect.objectContaining({
        orderby: "net_revenue",
        order: "desc",
        per_page: "10",
        extended_info: "true",
      }),
    );
  });

  it("falls back to 'Unknown product' when extended_info is missing", async () => {
    vi.mocked(fetchWc).mockResolvedValue([{ subtotals: { net_revenue: 10 } }]);

    const result = await getTopProductsByRevenue(range);

    expect(result[0].name).toBe("Unknown product");
  });
});
