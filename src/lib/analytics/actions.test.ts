import { describe, expect, it, vi } from "vitest";

vi.mock("./cache", () => ({
  withRangeCache: (fn: unknown) => fn,
  withFixedCache: (fn: unknown) => fn,
}));
vi.mock("./woocommerce/revenue", () => ({ getRevenueStats: vi.fn() }));
vi.mock("./woocommerce/orders", () => ({ getOrdersFulfilled: vi.fn() }));
vi.mock("./woocommerce/customers", () => ({ getReturningCustomerRate: vi.fn() }));
vi.mock("./woocommerce/products", () => ({ getTopProductsByRevenue: vi.fn() }));
vi.mock("./woocommerce/sales-channel", () => ({ getSalesByChannel: vi.fn() }));
vi.mock("./ga4/sessions", () => ({
  getSessionsOverTime: vi.fn(),
  getSessionsByDevice: vi.fn(),
  getSessionsByLocation: vi.fn(),
}));
vi.mock("./ga4/funnel", () => ({
  getConversionFunnel: vi.fn(),
  getConversionRateOverTime: vi.fn(),
  getConversionRateSummary: vi.fn(),
}));
vi.mock("./ga4/referrers", () => ({ getSocialReferrerRevenue: vi.fn() }));

import { getReturningCustomerRate } from "./woocommerce/customers";
import { getConversionFunnel, getConversionRateOverTime, getConversionRateSummary } from "./ga4/funnel";
import { getOrdersFulfilled } from "./woocommerce/orders";
import { getTopProductsByRevenue } from "./woocommerce/products";
import { getSocialReferrerRevenue } from "./ga4/referrers";
import { getSalesByChannel } from "./woocommerce/sales-channel";
import { getSessionsByDevice, getSessionsByLocation, getSessionsOverTime } from "./ga4/sessions";
import { getRevenueStats } from "./woocommerce/revenue";
import { getDashboardData } from "./actions";

const revenueStatsResult = {
  current: {
    intervals: [],
    totals: { grossSales: 100, netRevenue: 90, discounts: 0, refunds: 0, shipping: 0, taxes: 0, totalSales: 100, ordersCount: 2, averageOrderValue: 45 },
  },
  previous: {
    intervals: [],
    totals: { grossSales: 80, netRevenue: 70, discounts: 0, refunds: 0, shipping: 0, taxes: 0, totalSales: 80, ordersCount: 2, averageOrderValue: 35 },
  },
};

function mockHappyPath() {
  vi.mocked(getRevenueStats).mockResolvedValue(revenueStatsResult);
  vi.mocked(getOrdersFulfilled).mockResolvedValue({ current: 5, previous: 4 });
  vi.mocked(getReturningCustomerRate).mockResolvedValue({ current: 50, previous: 40 });
  vi.mocked(getTopProductsByRevenue).mockResolvedValue([]);
  vi.mocked(getSalesByChannel).mockResolvedValue([]);
  vi.mocked(getSessionsOverTime).mockResolvedValue([]);
  vi.mocked(getSessionsByDevice).mockResolvedValue([]);
  vi.mocked(getSessionsByLocation).mockResolvedValue([]);
  vi.mocked(getConversionFunnel).mockResolvedValue([]);
  vi.mocked(getConversionRateOverTime).mockResolvedValue([]);
  vi.mocked(getConversionRateSummary).mockResolvedValue({ value: 10, changePercentage: 5, trend: "up" });
  vi.mocked(getSocialReferrerRevenue).mockResolvedValue([]);
}

describe("getDashboardData", () => {
  it("assembles a full DashboardPayload when every fetcher succeeds", async () => {
    mockHappyPath();

    const payload = await getDashboardData("7d");

    expect(payload.summaryCards.grossSales.value).toBe(100);
    expect(payload.errors).toEqual({});
  });

  it("isolates a single fetcher rejection to its card without throwing", async () => {
    mockHappyPath();
    vi.mocked(getSessionsOverTime).mockRejectedValue(new Error("GA4 quota exceeded"));

    const payload = await getDashboardData("7d");

    expect(payload.errors.sessionsOverTime).toBe("GA4 quota exceeded");
    expect(payload.summaryCards.grossSales.value).toBe(100);
  });
});
