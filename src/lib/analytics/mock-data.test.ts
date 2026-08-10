import { describe, expect, it } from "vitest";
import { buildMockDashboardPayload } from "./mock-data";
import { resolveDateRange } from "./date-range";

const NOW = new Date(2026, 7, 7, 12, 0, 0);

describe("buildMockDashboardPayload", () => {
  it("returns 24 hourly buckets for 'today'", () => {
    const range = resolveDateRange("today", NOW);
    const payload = buildMockDashboardPayload(range);

    expect(payload.charts.sessionsOverTime).toHaveLength(24);
    expect(payload.charts.sessionsOverTime[0].date).toMatch(
      /^\d{1,2} (AM|PM)$/,
    );
  });

  it("returns 7 daily buckets for '7d' and 30 for '30d'", () => {
    expect(
      buildMockDashboardPayload(resolveDateRange("7d", NOW)).charts
        .salesOverTime,
    ).toHaveLength(7);
    expect(
      buildMockDashboardPayload(resolveDateRange("30d", NOW)).charts
        .salesOverTime,
    ).toHaveLength(30);
  });

  it("produces non-zero, varied summary card values with no errors", () => {
    const range = resolveDateRange("7d", NOW);
    const payload = buildMockDashboardPayload(range);

    expect(payload.summaryCards.grossSales.value).toBeGreaterThan(0);
    expect(payload.summaryCards.orders.value).toBeGreaterThan(0);
    expect(payload.summaryCards.conversionRate.value).toBeGreaterThan(0);
    expect(payload.errors).toEqual({});
  });

  it("derives the sales breakdown from gross sales so totals are internally consistent", () => {
    const range = resolveDateRange("30d", NOW);
    const payload = buildMockDashboardPayload(range);
    const breakdown = payload.charts.salesBreakdown;
    const byLabel = (label: string) =>
      breakdown.find((line) => line.label === label)!.value;

    expect(byLabel("Discounts")).toBeLessThan(0);
    expect(byLabel("Sales reversals")).toBeLessThan(0);
    expect(byLabel("Gross sales")).toBeGreaterThan(byLabel("Net sales"));
  });

  it("gives every summary card a sparkline, including orders fulfilled and returning customer rate", () => {
    const range = resolveDateRange("7d", NOW);
    const payload = buildMockDashboardPayload(range);

    expect(payload.summaryCards.ordersFulfilled.sparkline).toBeDefined();
    expect(payload.summaryCards.ordersFulfilled.sparkline!.length).toBe(7);
    expect(payload.summaryCards.returningCustomerRate.sparkline).toBeDefined();
    expect(payload.summaryCards.returningCustomerRate.sparkline!.length).toBe(
      7,
    );
  });

  it("gives salesByProduct, sessionsByLocation, and totalSalesBySocialReferrer a previousValue for comparison", () => {
    const range = resolveDateRange("7d", NOW);
    const payload = buildMockDashboardPayload(range);

    for (const item of payload.charts.salesByProduct) {
      expect(item.previousValue).toBeGreaterThan(0);
    }
    for (const item of payload.charts.sessionsByLocation) {
      expect(item.previousValue).toBeGreaterThan(0);
    }
    for (const item of payload.charts.totalSalesBySocialReferrer) {
      expect(item.previousValue).toBeDefined();
    }
  });

  it("gives every conversionFunnel step a previousSessions for comparison", () => {
    const range = resolveDateRange("7d", NOW);
    const payload = buildMockDashboardPayload(range);

    for (const step of payload.charts.conversionFunnel) {
      expect(step.previousSessions).toBeGreaterThan(0);
    }
  });

  it("sorts sessionsByDevice with Mobile as the largest share", () => {
    const range = resolveDateRange("today", NOW);
    const payload = buildMockDashboardPayload(range);
    const [first] = payload.charts.sessionsByDevice;

    expect(first.name).toBe("Mobile");
    expect(first.value).toBeGreaterThan(
      payload.charts.sessionsByDevice[1].value,
    );
  });

  it("gives every sessionsByDevice entry a previousValue for comparison", () => {
    const range = resolveDateRange("7d", NOW);
    const payload = buildMockDashboardPayload(range);

    for (const item of payload.charts.sessionsByDevice) {
      expect(item.previousValue).toBeGreaterThan(0);
    }
  });

  it("generates one bucket per day for a 'mtd' range matching its actual span, not a fixed count", () => {
    const range = resolveDateRange("mtd", NOW);
    const payload = buildMockDashboardPayload(range);

    expect(payload.charts.salesOverTime).toHaveLength(7);
  });

  it("generates exactly 24 distinct hourly labels for a 'today'-shaped range, never duplicating an hour", () => {
    const range = resolveDateRange("today", NOW);
    const payload = buildMockDashboardPayload(range);
    const labels = payload.charts.salesOverTime.map((point) => point.date);

    expect(labels).toHaveLength(24);
    expect(new Set(labels).size).toBe(24);
  });

  it("generates exactly 30 distinct daily labels for a '30d' range, never duplicating a day", () => {
    const range = resolveDateRange("30d", NOW);
    const payload = buildMockDashboardPayload(range);
    const labels = payload.charts.salesOverTime.map((point) => point.date);

    expect(labels).toHaveLength(30);
    expect(new Set(labels).size).toBe(30);
  });

  it("generates weekly buckets for a 'week' interval range", () => {
    const range = resolveDateRange("last-year", NOW);
    const payload = buildMockDashboardPayload(range);

    expect(range.interval).toBe("week");
    // A full year is ~52 weekly buckets; assert it's in a sane weekly-not-daily
    // ballpark rather than an exact count (leap years / week-boundary rounding
    // can shift it by one or two).
    expect(payload.charts.salesOverTime.length).toBeGreaterThan(45);
    expect(payload.charts.salesOverTime.length).toBeLessThan(60);
  });
});
