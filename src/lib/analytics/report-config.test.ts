import { describe, expect, it } from "vitest";
import { getReportConfig, REPORT_CONFIGS } from "./report-config";

describe("REPORT_CONFIGS", () => {
  it("has exactly 16 entries with unique slugs", () => {
    expect(REPORT_CONFIGS).toHaveLength(16);
    const slugs = REPORT_CONFIGS.map((config) => config.slug);
    expect(new Set(slugs).size).toBe(16);
  });

  it("covers every shape at least once", () => {
    const shapes = new Set(REPORT_CONFIGS.map((config) => config.shape));
    expect(shapes).toEqual(
      new Set([
        "line-comparison",
        "line-simple",
        "donut",
        "list",
        "ranked",
        "funnel",
        "cohort-grid",
      ]),
    );
  });
});

describe("getReportConfig", () => {
  it("finds a config by slug", () => {
    expect(getReportConfig("sessions-by-device-type")).toEqual({
      slug: "sessions-by-device-type",
      title: "Sessions by device type",
      shape: "donut",
    });
  });

  it("returns undefined for an unknown slug", () => {
    expect(getReportConfig("not-a-real-slug")).toBeUndefined();
  });

  it("finds the customer cohort analysis config", () => {
    expect(getReportConfig("customer-cohort-analysis")).toEqual({
      slug: "customer-cohort-analysis",
      title: "Customer cohort analysis",
      shape: "cohort-grid",
    });
  });
});
