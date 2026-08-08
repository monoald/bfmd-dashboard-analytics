import { describe, expect, it } from "vitest";
import { buildMockDashboardPayload } from "./mock-data";

describe("buildMockDashboardPayload", () => {
  it("returns 24 hourly buckets for 'today'", () => {
    const payload = buildMockDashboardPayload("today");

    expect(payload.charts.sessionsOverTime).toHaveLength(24);
    expect(payload.charts.sessionsOverTime[0].date).toMatch(
      /^\d{1,2} (AM|PM)$/,
    );
  });

  it("returns 7 daily buckets for '7d' and 30 for '30d'", () => {
    expect(buildMockDashboardPayload("7d").charts.salesOverTime).toHaveLength(
      7,
    );
    expect(buildMockDashboardPayload("30d").charts.salesOverTime).toHaveLength(
      30,
    );
  });

  it("produces non-zero, varied summary card values with no errors", () => {
    const payload = buildMockDashboardPayload("7d");

    expect(payload.summaryCards.grossSales.value).toBeGreaterThan(0);
    expect(payload.summaryCards.orders.value).toBeGreaterThan(0);
    expect(payload.summaryCards.conversionRate.value).toBeGreaterThan(0);
    expect(payload.errors).toEqual({});
  });

  it("derives the sales breakdown from gross sales so totals are internally consistent", () => {
    const payload = buildMockDashboardPayload("30d");
    const breakdown = payload.charts.salesBreakdown;
    const byLabel = (label: string) =>
      breakdown.find((line) => line.label === label)!.value;

    expect(byLabel("Discounts")).toBeLessThan(0);
    expect(byLabel("Sales reversals")).toBeLessThan(0);
    expect(byLabel("Gross sales")).toBeGreaterThan(byLabel("Net sales"));
  });

  it("gives every summary card a sparkline, including orders fulfilled and returning customer rate", () => {
    const payload = buildMockDashboardPayload("7d");

    expect(payload.summaryCards.ordersFulfilled.sparkline).toBeDefined();
    expect(payload.summaryCards.ordersFulfilled.sparkline!.length).toBe(7);
    expect(payload.summaryCards.returningCustomerRate.sparkline).toBeDefined();
    expect(payload.summaryCards.returningCustomerRate.sparkline!.length).toBe(
      7,
    );
  });

  it("gives salesByProduct, sessionsByLocation, and totalSalesBySocialReferrer a previousValue for comparison", () => {
    const payload = buildMockDashboardPayload("7d");

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
    const payload = buildMockDashboardPayload("7d");

    for (const step of payload.charts.conversionFunnel) {
      expect(step.previousSessions).toBeGreaterThan(0);
    }
  });

  it("sorts sessionsByDevice with Mobile as the largest share", () => {
    const payload = buildMockDashboardPayload("today");
    const [first] = payload.charts.sessionsByDevice;

    expect(first.name).toBe("Mobile");
    expect(first.value).toBeGreaterThan(
      payload.charts.sessionsByDevice[1].value,
    );
  });
});
