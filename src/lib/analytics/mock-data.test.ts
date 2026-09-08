import { describe, expect, it } from "vitest";
import {
  buildMockDashboardPayload,
  buildMockLiveViewPayload,
} from "./mock-data";
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

  it("generates exactly 24 distinct hourly labels for a 'today'-shaped range on a non-DST-transition day", () => {
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

describe("buildMockDashboardPayload customer cohort analysis", () => {
  it("returns 12 cohort rows with elapsed-month lengths decreasing toward the most recent", () => {
    const range = resolveDateRange("7d", NOW);
    const payload = buildMockDashboardPayload(range);

    expect(payload.charts.customerCohortAnalysis).toHaveLength(12);
    expect(
      payload.charts.customerCohortAnalysis.map(
        (row) => row.retentionByMonth.length,
      ),
    ).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it("gives every cohort row a positive cohort size and every retention value a plausible percentage", () => {
    const payload = buildMockDashboardPayload(resolveDateRange("7d", NOW));

    for (const row of payload.charts.customerCohortAnalysis) {
      expect(row.cohortSize).toBeGreaterThan(0);
      for (const value of row.retentionByMonth) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(100);
      }
    }
  });
});

describe("buildMockLiveViewPayload", () => {
  it("produces a fully-populated LiveViewPayload with no errors", () => {
    const range = resolveDateRange("today", NOW);
    const payload = buildMockLiveViewPayload(range);

    expect(payload.errors).toEqual({});
    expect(payload.visitorsRightNow).toBeGreaterThan(0);
    expect(payload.summaryCards.totalSales.sparkline).toHaveLength(24);
    expect(payload.summaryCards.sessions.sparkline).toHaveLength(24);
    expect(payload.summaryCards.orders.sparkline).toHaveLength(24);
    expect(payload.customerBehavior).toHaveLength(3);
    expect(payload.customerBehavior.map((step) => step.step)).toEqual([
      "Active carts",
      "Checking out",
      "Purchased",
    ]);
    expect(payload.sessionsByLocation.length).toBeGreaterThan(0);
    expect(payload.newVsReturning.new).toBeGreaterThanOrEqual(0);
    expect(payload.newVsReturning.returning).toBeGreaterThanOrEqual(0);
    expect(payload.salesByProduct.length).toBeGreaterThan(0);
  });
});
