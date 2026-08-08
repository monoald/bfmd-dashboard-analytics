import { describe, expect, it, vi } from "vitest";
import type { ResolvedDateRange } from "../types";

vi.mock("./client", () => ({ runGa4Report: vi.fn() }));

import { runGa4Report } from "./client";
import { getSessionsByDevice, getSessionsByLocation, getSessionsOverTime } from "./sessions";

const range: ResolvedDateRange = {
  key: "7d",
  interval: "day",
  current: { start: new Date("2026-08-01"), end: new Date("2026-08-07") },
  previous: { start: new Date("2026-07-25"), end: new Date("2026-07-31") },
};

describe("getSessionsOverTime", () => {
  it("fetches current and previous sessions by date and aligns them into a TimeSeriesData series", async () => {
    vi.mocked(runGa4Report)
      .mockResolvedValueOnce([{ dimensionValues: ["20260801"], metricValues: [100] }])
      .mockResolvedValueOnce([{ dimensionValues: ["20260725"], metricValues: [80] }]);

    const result = await getSessionsOverTime(range);

    expect(result).toEqual([{ date: "Aug 1", currentPeriod: 100, previousPeriod: 80 }]);
  });
});

describe("getSessionsByDevice", () => {
  it("maps rows to NamedValue sorted by sessions descending", async () => {
    vi.mocked(runGa4Report).mockResolvedValue([
      { dimensionValues: ["desktop"], metricValues: [10] },
      { dimensionValues: ["mobile"], metricValues: [50] },
    ]);

    const result = await getSessionsByDevice(range);

    expect(result).toEqual([
      { name: "mobile", value: 50 },
      { name: "desktop", value: 10 },
    ]);
  });
});

describe("getSessionsByLocation", () => {
  it("joins region and city, sorts descending, and caps at 10 rows", async () => {
    vi.mocked(runGa4Report).mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => ({
        dimensionValues: [`Region${i}`, `City${i}`],
        metricValues: [12 - i],
      }))
    );

    const result = await getSessionsByLocation(range);

    expect(result).toHaveLength(10);
    expect(result[0]).toEqual({ name: "Region0 · City0", value: 12 });
  });
});
