import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runReportMock = vi.fn();

vi.mock("@google-analytics/data", () => ({
  BetaAnalyticsDataClient: vi.fn().mockImplementation(function (config: unknown) {
    return {
      runReport: runReportMock,
      __config: config,
    };
  }),
}));

import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { resetGa4ClientForTests, runGa4Report } from "./client";

describe("GA4 client", () => {
  beforeEach(() => {
    resetGa4ClientForTests();
    vi.stubEnv("GA4_PROPERTY_ID", "123456789");
    vi.stubEnv("GA4_CLIENT_EMAIL", "svc@example.iam.gserviceaccount.com");
    vi.stubEnv("GA4_PRIVATE_KEY", "line1\\nline2");
    runReportMock.mockResolvedValue([
      {
        rows: [{ dimensionValues: [{ value: "mobile" }], metricValues: [{ value: "42" }] }],
      },
    ]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("constructs the client once with credentials, converting escaped newlines", async () => {
    await runGa4Report({ dimensions: ["deviceCategory"], metrics: ["sessions"], startDate: "2026-08-01", endDate: "2026-08-07" });
    await runGa4Report({ dimensions: ["deviceCategory"], metrics: ["sessions"], startDate: "2026-08-01", endDate: "2026-08-07" });

    expect(BetaAnalyticsDataClient).toHaveBeenCalledTimes(1);
    const config = vi.mocked(BetaAnalyticsDataClient).mock.calls[0][0] as { credentials: { private_key: string } };
    expect(config.credentials.private_key).toBe("line1\nline2");
  });

  it("builds the runReport request from params and maps rows to plain values", async () => {
    const rows = await runGa4Report({
      dimensions: ["deviceCategory"],
      metrics: ["sessions"],
      startDate: "2026-08-01",
      endDate: "2026-08-07",
      dimensionFilter: { fieldName: "sessionMedium", value: "social" },
    });

    expect(runReportMock).toHaveBeenCalledWith({
      property: "properties/123456789",
      dateRanges: [{ startDate: "2026-08-01", endDate: "2026-08-07" }],
      dimensions: [{ name: "deviceCategory" }],
      metrics: [{ name: "sessions" }],
      dimensionFilter: { filter: { fieldName: "sessionMedium", stringFilter: { value: "social" } } },
    });
    expect(rows).toEqual([{ dimensionValues: ["mobile"], metricValues: [42] }]);
  });

  it("throws when GA4_PROPERTY_ID is missing", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("GA4_CLIENT_EMAIL", "svc@example.iam.gserviceaccount.com");
    vi.stubEnv("GA4_PRIVATE_KEY", "line1");

    await expect(
      runGa4Report({ dimensions: [], metrics: ["sessions"], startDate: "2026-08-01", endDate: "2026-08-07" })
    ).rejects.toThrow(/GA4_PROPERTY_ID/);
  });
});
