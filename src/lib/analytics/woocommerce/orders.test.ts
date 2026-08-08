import { describe, expect, it, vi } from "vitest";
import type { ResolvedDateRange } from "../types";

vi.mock("./client", () => ({ fetchWcCount: vi.fn() }));

import { fetchWcCount } from "./client";
import { getOrdersFulfilled } from "./orders";

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
