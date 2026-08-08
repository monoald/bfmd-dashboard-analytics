import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ResolvedDateRange } from "../types";

vi.mock("./client", () => ({ fetchWc: vi.fn() }));

import { fetchWc } from "./client";
import { getSalesByChannel } from "./sales-channel";

const range: ResolvedDateRange = {
  key: "30d",
  interval: "day",
  current: { start: new Date("2026-07-08"), end: new Date("2026-08-07") },
  previous: { start: new Date("2026-06-08"), end: new Date("2026-07-07") },
};

function page(rows: Array<{ created_via: string; total: string }>) {
  return rows;
}

describe("getSalesByChannel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("paginates through all orders and buckets totals by created_via, mapped to friendly labels", async () => {
    const firstPage = page(
      Array.from({ length: 100 }, () => ({
        created_via: "checkout",
        total: "10.00",
      })),
    );
    const secondPage = page([
      { created_via: "checkout", total: "5.00" },
      { created_via: "admin", total: "20.00" },
    ]);
    vi.mocked(fetchWc)
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(secondPage);

    const result = await getSalesByChannel(range);

    expect(fetchWc).toHaveBeenCalledTimes(2);
    expect(fetchWc).toHaveBeenNthCalledWith(
      1,
      "/wc/v3/orders",
      expect.objectContaining({ page: "1", per_page: "100", status: "any" }),
    );
    expect(fetchWc).toHaveBeenNthCalledWith(
      2,
      "/wc/v3/orders",
      expect.objectContaining({ page: "2" }),
    );

    expect(result).toEqual([
      { name: "Online Store", value: 1005 },
      { name: "Admin", value: 20 },
    ]);
  });

  it("stops after a page with fewer rows than per_page", async () => {
    vi.mocked(fetchWc).mockResolvedValueOnce([
      { created_via: "checkout", total: "1.00" },
    ]);

    await getSalesByChannel(range);

    expect(fetchWc).toHaveBeenCalledTimes(1);
  });
});
