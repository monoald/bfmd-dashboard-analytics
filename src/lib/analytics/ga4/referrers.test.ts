import { describe, expect, it, vi } from "vitest";
import type { ResolvedDateRange } from "../types";

vi.mock("./client", () => ({ runGa4Report: vi.fn() }));

import { runGa4Report } from "./client";
import { getSocialReferrerRevenue } from "./referrers";

const range: ResolvedDateRange = {
  key: "today",
  interval: "hour",
  current: { start: new Date("2026-08-07T00:00:00Z"), end: new Date("2026-08-07T23:59:59Z") },
  previous: { start: new Date("2026-08-06T00:00:00Z"), end: new Date("2026-08-06T23:59:59Z") },
};

describe("getSocialReferrerRevenue", () => {
  it("filters to social medium, extracts the source name, and sorts by revenue descending", async () => {
    vi.mocked(runGa4Report).mockResolvedValue([
      { dimensionValues: ["facebook / social"], metricValues: [34.945] },
      { dimensionValues: ["youtube / social"], metricValues: [6135.07] },
    ]);

    const result = await getSocialReferrerRevenue(range);

    expect(runGa4Report).toHaveBeenCalledWith(
      expect.objectContaining({
        dimensions: ["sessionSourceMedium"],
        metrics: ["purchaseRevenue"],
        dimensionFilter: { fieldName: "sessionMedium", value: "social" },
      })
    );
    expect(result).toEqual([
      { name: "youtube", value: 6135.07 },
      { name: "facebook", value: 34.95 },
    ]);
  });
});
