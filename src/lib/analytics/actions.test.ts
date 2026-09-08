import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-session", () => ({
  requireSession: vi.fn().mockResolvedValue({ role: "admin" }),
}));
vi.mock("./cache", () => ({
  withRangeCache: (fn: unknown) => fn,
  withFixedCache: (fn: unknown) => fn,
  withCache: (fn: unknown) => fn,
}));
vi.mock("./woocommerce/revenue", () => ({ getRevenueStats: vi.fn() }));
vi.mock("./woocommerce/orders", () => ({ getOrdersFulfilled: vi.fn() }));
vi.mock("./woocommerce/customers", () => ({
  getReturningCustomerRate: vi.fn(),
  getCurrentCustomerSplit: vi.fn(),
}));
vi.mock("./ga4/realtime", () => ({ getLiveVisitorCount: vi.fn() }));
vi.mock("./woocommerce/products", () => ({ getTopProductsByRevenue: vi.fn() }));
vi.mock("./woocommerce/sales-channel", () => ({ getSalesByChannel: vi.fn() }));
vi.mock("./ga4/sessions", () => ({
  getSessionsOverTime: vi.fn(),
  getSessionsOverTimeBreakdown: vi.fn(),
  getSessionsByDevice: vi.fn(),
  getSessionsByLocation: vi.fn(),
}));
vi.mock("./ga4/funnel", () => ({
  getConversionFunnel: vi.fn(),
  getConversionRateOverTime: vi.fn(),
  getConversionRateOverTimeBreakdown: vi.fn(),
  getConversionRateSummary: vi.fn(),
}));
vi.mock("./ga4/referrers", () => ({ getSocialReferrerRevenue: vi.fn() }));

import {
  getReturningCustomerRate,
  getCurrentCustomerSplit,
} from "./woocommerce/customers";
import { getLiveVisitorCount } from "./ga4/realtime";
import {
  getConversionFunnel,
  getConversionRateOverTime,
  getConversionRateOverTimeBreakdown,
  getConversionRateSummary,
} from "./ga4/funnel";
import { getOrdersFulfilled } from "./woocommerce/orders";
import { getTopProductsByRevenue } from "./woocommerce/products";
import { getSocialReferrerRevenue } from "./ga4/referrers";
import { getSalesByChannel } from "./woocommerce/sales-channel";
import {
  getSessionsByDevice,
  getSessionsByLocation,
  getSessionsOverTime,
  getSessionsOverTimeBreakdown,
} from "./ga4/sessions";
import { getRevenueStats } from "./woocommerce/revenue";
import {
  getDashboardData,
  getLiveViewData,
  fetchLiveVisitorCount,
} from "./actions";
import { resolveCustomRangeParams } from "./date-range";

const revenueStatsResult = {
  current: {
    intervals: [],
    totals: {
      grossSales: 100,
      netRevenue: 90,
      discounts: 0,
      refunds: 0,
      shipping: 0,
      taxes: 0,
      totalSales: 100,
      ordersCount: 2,
      averageOrderValue: 45,
    },
  },
  previous: {
    intervals: [],
    totals: {
      grossSales: 80,
      netRevenue: 70,
      discounts: 0,
      refunds: 0,
      shipping: 0,
      taxes: 0,
      totalSales: 80,
      ordersCount: 2,
      averageOrderValue: 35,
    },
  },
};

function mockHappyPath() {
  vi.mocked(getRevenueStats).mockResolvedValue(revenueStatsResult);
  vi.mocked(getOrdersFulfilled).mockResolvedValue({ current: 5, previous: 4 });
  vi.mocked(getReturningCustomerRate).mockResolvedValue({
    current: 50,
    previous: 40,
  });
  vi.mocked(getCurrentCustomerSplit).mockResolvedValue({
    new: 3,
    returning: 2,
  });
  vi.mocked(getTopProductsByRevenue).mockResolvedValue([]);
  vi.mocked(getSalesByChannel).mockResolvedValue([]);
  vi.mocked(getSessionsOverTime).mockResolvedValue([]);
  vi.mocked(getSessionsOverTimeBreakdown).mockResolvedValue([]);
  vi.mocked(getSessionsByDevice).mockResolvedValue([]);
  vi.mocked(getSessionsByLocation).mockResolvedValue([]);
  vi.mocked(getConversionFunnel).mockResolvedValue([]);
  vi.mocked(getConversionRateOverTime).mockResolvedValue([]);
  vi.mocked(getConversionRateOverTimeBreakdown).mockResolvedValue([]);
  vi.mocked(getConversionRateSummary).mockResolvedValue({
    value: 10,
    changePercentage: 5,
    trend: "up",
  });
  vi.mocked(getSocialReferrerRevenue).mockResolvedValue([]);
  vi.mocked(getLiveVisitorCount).mockResolvedValue(7);
}

function stubRealCredentials() {
  vi.stubEnv("WC_STORE_URL", "https://store.example.com");
  vi.stubEnv("WC_CONSUMER_KEY", "ck_test");
  vi.stubEnv("WC_CONSUMER_SECRET", "cs_test");
  vi.stubEnv("GA4_PROPERTY_ID", "123456789");
  vi.stubEnv("GA4_CLIENT_EMAIL", "svc@example.iam.gserviceaccount.com");
  vi.stubEnv("GA4_PRIVATE_KEY", "line1");
}

describe("getDashboardData", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns mock data without calling any fetcher when credentials are missing", async () => {
    vi.unstubAllEnvs();
    mockHappyPath();

    const payload = await getDashboardData("7d");

    expect(payload.errors).toEqual({});
    expect(payload.charts.salesOverTime).toHaveLength(7);
    expect(getRevenueStats).not.toHaveBeenCalled();
  });

  it("assembles a full DashboardPayload from real fetchers when credentials are present", async () => {
    stubRealCredentials();
    mockHappyPath();

    const payload = await getDashboardData("7d");

    expect(payload.summaryCards.grossSales.value).toBe(100);
    expect(payload.errors).toEqual({});
  });

  it("isolates a single fetcher rejection to its card without throwing", async () => {
    stubRealCredentials();
    mockHappyPath();
    vi.mocked(getSessionsOverTime).mockRejectedValue(
      new Error("GA4 quota exceeded"),
    );

    const payload = await getDashboardData("7d");

    expect(payload.errors.sessionsOverTime).toBe(
      "Unable to load data for this card. Please try again later.",
    );
    expect(payload.summaryCards.grossSales.value).toBe(100);
  });

  it("isolates a sessionsOverTimeBreakdown fetcher rejection to its own card, without affecting the plain sessionsOverTime chart", async () => {
    stubRealCredentials();
    mockHappyPath();
    vi.mocked(getSessionsOverTimeBreakdown).mockRejectedValue(
      new Error("GA4 quota exceeded"),
    );

    const payload = await getDashboardData("7d");

    expect(payload.errors.sessionsOverTimeBreakdown).toBe(
      "Unable to load data for this card. Please try again later.",
    );
    expect(payload.errors.sessionsOverTime).toBeUndefined();
    expect(payload.summaryCards.grossSales.value).toBe(100);
  });

  it("isolates a conversionRateOverTimeBreakdown fetcher rejection to its own card, without affecting the plain conversionRateOverTime chart", async () => {
    stubRealCredentials();
    mockHappyPath();
    vi.mocked(getConversionRateOverTimeBreakdown).mockRejectedValue(
      new Error("GA4 quota exceeded"),
    );

    const payload = await getDashboardData("7d");

    expect(payload.errors.conversionRateOverTimeBreakdown).toBe(
      "Unable to load data for this card. Please try again later.",
    );
    expect(payload.errors.conversionRateOverTime).toBeUndefined();
    expect(payload.summaryCards.grossSales.value).toBe(100);
  });

  it("resolves a custom start/end range and passes it to the mock data builder", async () => {
    vi.unstubAllEnvs();
    mockHappyPath();

    // customRange must come from resolveCustomRangeParams (as every real
    // caller does — see reports/[slug]/page.tsx) since getDashboardData's
    // custom-range handling expects EST-pinned day markers, not arbitrary
    // local-midnight Dates.
    const payload = await getDashboardData(
      "custom",
      resolveCustomRangeParams("2026-07-01", "2026-07-15")!,
    );

    expect(payload.errors).toEqual({});
    // Jul 1 - Jul 15 inclusive is 15 daily buckets
    expect(payload.charts.salesOverTime).toHaveLength(15);
  });

  it("falls back to resolving 'today' if rangeKey is 'custom' but no customRange is provided", async () => {
    vi.unstubAllEnvs();
    mockHappyPath();

    const payload = await getDashboardData("custom");

    expect(payload.errors).toEqual({});
    expect(payload.charts.salesOverTime).toHaveLength(24); // today = 24 hourly buckets
  });

  it("passes a custom range's resolved bounds to the real fetchers when credentials are configured", async () => {
    stubRealCredentials();
    mockHappyPath();

    await getDashboardData(
      "custom",
      resolveCustomRangeParams("2026-07-01", "2026-07-15")!,
    );

    expect(getRevenueStats).toHaveBeenCalledWith(
      expect.objectContaining({ key: "custom", interval: "day" }),
    );
  });
});

describe("getLiveViewData", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns mock data when real credentials are not configured", async () => {
    vi.unstubAllEnvs();
    mockHappyPath();

    const payload = await getLiveViewData();

    expect(payload.errors).toEqual({});
    expect(payload.summaryCards.totalSales.sparkline).toHaveLength(24);
  });

  it("assembles a full LiveViewPayload from real fetchers when credentials are configured", async () => {
    stubRealCredentials();
    mockHappyPath();

    const payload = await getLiveViewData();

    expect(payload.errors).toEqual({});
    expect(payload.visitorsRightNow).toBe(7);
    expect(payload.newVsReturning).toEqual({ new: 3, returning: 2 });
  });

  it("isolates a single fetcher rejection to its card without throwing", async () => {
    stubRealCredentials();
    mockHappyPath();
    vi.mocked(getSessionsByLocation).mockRejectedValue(
      new Error("GA4 quota exceeded"),
    );

    const payload = await getLiveViewData();

    expect(payload.errors.sessionsByLocation).toBe(
      "Unable to load data for this card. Please try again later.",
    );
    expect(payload.summaryCards.totalSales.value).toBe(100);
  });

  it("falls back to a visitor count of 0, without an error, when the realtime fetch fails", async () => {
    stubRealCredentials();
    mockHappyPath();
    vi.mocked(getLiveVisitorCount).mockRejectedValue(new Error("GA4 down"));

    const payload = await getLiveViewData();

    expect(payload.visitorsRightNow).toBe(0);
    expect(payload.errors).toEqual({});
  });
});

describe("fetchLiveVisitorCount", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("delegates to getLiveVisitorCount when real credentials are configured", async () => {
    stubRealCredentials();
    vi.mocked(getLiveVisitorCount).mockResolvedValueOnce(15);

    const result = await fetchLiveVisitorCount();

    expect(result).toBe(15);
  });

  it("returns the mock visitor count without calling getLiveVisitorCount when credentials are missing", async () => {
    vi.unstubAllEnvs();
    const callsBefore = vi.mocked(getLiveVisitorCount).mock.calls.length;

    const result = await fetchLiveVisitorCount();

    expect(result).toBe(8);
    expect(getLiveVisitorCount).toHaveBeenCalledTimes(callsBefore);
  });
});
