import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ runGa4RealtimeReport: vi.fn() }));

import { runGa4RealtimeReport } from "./client";
import { getLiveVisitorCount } from "./realtime";

afterEach(() => {
  vi.resetAllMocks();
});

describe("getLiveVisitorCount", () => {
  it("returns the activeUsers metric from a realtime report with no dimensions", async () => {
    vi.mocked(runGa4RealtimeReport).mockResolvedValueOnce([
      { dimensionValues: [], metricValues: [42] },
    ]);

    const result = await getLiveVisitorCount();

    expect(result).toBe(42);
    expect(runGa4RealtimeReport).toHaveBeenCalledWith({
      metrics: ["activeUsers"],
    });
  });

  it("returns 0 when the realtime report has no rows", async () => {
    vi.mocked(runGa4RealtimeReport).mockResolvedValueOnce([]);

    const result = await getLiveVisitorCount();

    expect(result).toBe(0);
  });
});
