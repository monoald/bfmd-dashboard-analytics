import { describe, expect, it, vi } from "vitest";
import type { ResolvedDateRange } from "../types";

vi.mock("./client", () => ({ fetchWc: vi.fn() }));

import { fetchWc } from "./client";
import { getReturningCustomerRate } from "./customers";

const range: ResolvedDateRange = {
  key: "7d",
  interval: "day",
  current: { start: new Date("2026-08-01"), end: new Date("2026-08-07") },
  previous: { start: new Date("2026-07-25"), end: new Date("2026-07-31") },
};

describe("getReturningCustomerRate", () => {
  it("computes the percentage of customers with more than one order", async () => {
    vi.mocked(fetchWc)
      .mockResolvedValueOnce([{ id: 1, orders_count: 2 }, { id: 2, orders_count: 1 }, { id: 3, orders_count: 3 }, { id: 4, orders_count: 1 }])
      .mockResolvedValueOnce([{ id: 5, orders_count: 1 }]);

    const result = await getReturningCustomerRate(range);

    expect(result.current).toBe(50);
    expect(result.previous).toBe(0);
  });

  it("returns 0 when there are no customers in the period", async () => {
    vi.mocked(fetchWc).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const result = await getReturningCustomerRate(range);

    expect(result).toEqual({ current: 0, previous: 0 });
  });
});
