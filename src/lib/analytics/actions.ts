"use server";

import { requireSession } from "@/lib/auth/require-session";
import { withCache, withFixedCache, withRangeCache } from "./cache";
import { resolveCustomRange, resolveDateRange } from "./date-range";
import { buildDashboardPayload, type RawPipelineResults } from "./normalize";
import { getRevenueStats } from "./woocommerce/revenue";
import { getOrdersFulfilled } from "./woocommerce/orders";
import {
  getReturningCustomerRate,
  getCurrentCustomerSplit,
  getNewAndReturningCustomerCounts,
  getReturningCustomerRateBreakdown,
} from "./woocommerce/customers";
import { getTopProductsByRevenue } from "./woocommerce/products";
import { getSalesByChannel } from "./woocommerce/sales-channel";
import { getCustomerCohortAnalysis } from "./woocommerce/cohort";
import { SHOW_CUSTOMER_COHORT_ANALYSIS } from "./report-config";
import {
  getSessionsByDevice,
  getSessionsByLocation,
  getSessionsOverTime,
  getSessionsOverTimeBreakdown,
} from "./ga4/sessions";
import {
  getConversionFunnel,
  getConversionRateOverTime,
  getConversionRateOverTimeBreakdown,
  getConversionRateSummary,
} from "./ga4/funnel";
import { getSocialReferrerRevenue } from "./ga4/referrers";
import { getLiveVisitorCount } from "./ga4/realtime";
import {
  buildLiveViewPayload,
  type RawLiveViewResults,
} from "./live-normalize";
import {
  buildMockDashboardPayload,
  buildMockLiveViewPayload,
} from "./mock-data";
import type {
  CohortRow,
  DashboardPayload,
  DateRangeKey,
  LiveViewPayload,
} from "./types";

const cachedRevenueStats = withRangeCache(getRevenueStats, "wc-revenue-stats");
const cachedOrdersFulfilled = withRangeCache(
  getOrdersFulfilled,
  "wc-orders-fulfilled",
);
const cachedReturningCustomerRate = withRangeCache(
  getReturningCustomerRate,
  "wc-returning-customers",
);
const cachedNewAndReturningCustomerCounts = withRangeCache(
  getNewAndReturningCustomerCounts,
  "wc-new-and-returning-customer-counts",
);
const cachedReturningCustomerRateBreakdown = withRangeCache(
  getReturningCustomerRateBreakdown,
  "wc-returning-customer-rate-breakdown"
);
const cachedTopProducts = withRangeCache(
  getTopProductsByRevenue,
  "wc-top-products",
);
const cachedSalesByChannel = withFixedCache(
  getSalesByChannel,
  "wc-sales-by-channel",
  14400,
);
const cachedSessionsOverTime = withRangeCache(
  getSessionsOverTime,
  "ga4-sessions-over-time",
);
const cachedSessionsOverTimeBreakdown = withRangeCache(
  getSessionsOverTimeBreakdown,
  "ga4-sessions-over-time-breakdown",
);
const cachedSessionsByDevice = withRangeCache(
  getSessionsByDevice,
  "ga4-sessions-by-device",
);
const cachedSessionsByLocation = withRangeCache(
  getSessionsByLocation,
  "ga4-sessions-by-location",
);
const cachedConversionFunnel = withRangeCache(
  getConversionFunnel,
  "ga4-conversion-funnel",
);
const cachedConversionRateOverTime = withRangeCache(
  getConversionRateOverTime,
  "ga4-conversion-rate-over-time",
);
const cachedConversionRateOverTimeBreakdown = withRangeCache(
  getConversionRateOverTimeBreakdown,
  "ga4-conversion-rate-over-time-breakdown",
);
const cachedConversionRateSummary = withRangeCache(
  getConversionRateSummary,
  "ga4-conversion-rate-summary",
);
const cachedSocialReferrerRevenue = withRangeCache(
  getSocialReferrerRevenue,
  "ga4-social-referrer-revenue",
);
const cachedCustomerCohortAnalysis = withCache(
  getCustomerCohortAnalysis,
  ["wc-customer-cohort-analysis"],
  21600, // 6h — full order-history aggregation is expensive and this
         // data doesn't meaningfully change minute to minute
);

const LIVE_VIEW_REVALIDATE_SECONDS = 45;
const liveCachedRevenueStats = withCache(
  getRevenueStats,
  ["live-revenue-stats"],
  LIVE_VIEW_REVALIDATE_SECONDS,
);
const liveCachedSessionsOverTime = withCache(
  getSessionsOverTime,
  ["live-sessions-over-time"],
  LIVE_VIEW_REVALIDATE_SECONDS,
);
const liveCachedConversionFunnel = withCache(
  getConversionFunnel,
  ["live-conversion-funnel"],
  LIVE_VIEW_REVALIDATE_SECONDS,
);
const liveCachedSessionsByLocation = withCache(
  getSessionsByLocation,
  ["live-sessions-by-location"],
  LIVE_VIEW_REVALIDATE_SECONDS,
);
const liveCachedCustomerSplit = withCache(
  getCurrentCustomerSplit,
  ["live-customer-split"],
  LIVE_VIEW_REVALIDATE_SECONDS,
);
const liveCachedTopProducts = withCache(
  getTopProductsByRevenue,
  ["live-top-products"],
  LIVE_VIEW_REVALIDATE_SECONDS,
);

async function settle<T>(promise: Promise<T>): Promise<T | Error> {
  try {
    return await promise;
  } catch (error) {
    console.error("Analytics fetcher failed:", error);
    return new Error(
      "Unable to load data for this card. Please try again later.",
    );
  }
}

function hasRealCredentials(): boolean {
  return Boolean(
    process.env.WC_STORE_URL &&
    process.env.WC_CONSUMER_KEY &&
    process.env.WC_CONSUMER_SECRET &&
    process.env.GA4_PROPERTY_ID &&
    process.env.GA4_CLIENT_EMAIL &&
    process.env.GA4_PRIVATE_KEY,
  );
}

export async function getDashboardData(
  rangeKey: DateRangeKey,
  customRange?: { start: Date; end: Date },
): Promise<DashboardPayload> {
  await requireSession();

  const range =
    rangeKey === "custom"
      ? customRange
        ? resolveCustomRange(customRange.start, customRange.end)
        : resolveDateRange("today", new Date())
      : resolveDateRange(rangeKey, new Date());

  if (!hasRealCredentials()) {
    return buildMockDashboardPayload(range);
  }

  const customerCohortAnalysisPromise: Promise<CohortRow[] | Error> =
    SHOW_CUSTOMER_COHORT_ANALYSIS
      ? settle(cachedCustomerCohortAnalysis())
      : Promise.resolve<CohortRow[]>([]);

  const [
    revenueStats,
    ordersFulfilled,
    returningCustomerRate,
    newAndReturningCustomerCounts,
    returningCustomerRateBreakdown,
    salesByProduct,
    salesByChannel,
    sessionsOverTime,
    sessionsOverTimeBreakdown,
    sessionsByDevice,
    sessionsByLocation,
    conversionFunnel,
    conversionRateOverTime,
    conversionRateOverTimeBreakdown,
    conversionRateSummary,
    totalSalesBySocialReferrer,
    customerCohortAnalysis,
  ] = await Promise.all([
    settle(cachedRevenueStats(range)),
    settle(cachedOrdersFulfilled(range)),
    settle(cachedReturningCustomerRate(range)),
    settle(cachedNewAndReturningCustomerCounts(range)),
    settle(cachedReturningCustomerRateBreakdown(range)),
    settle(cachedTopProducts(range)),
    settle(cachedSalesByChannel(range)),
    settle(cachedSessionsOverTime(range)),
    settle(cachedSessionsOverTimeBreakdown(range)),
    settle(cachedSessionsByDevice(range)),
    settle(cachedSessionsByLocation(range)),
    settle(cachedConversionFunnel(range)),
    settle(cachedConversionRateOverTime(range)),
    settle(cachedConversionRateOverTimeBreakdown(range)),
    settle(cachedConversionRateSummary(range)),
    settle(cachedSocialReferrerRevenue(range)),
    customerCohortAnalysisPromise,
  ]);

  const raw: RawPipelineResults = {
    revenueStats,
    ordersFulfilled,
    returningCustomerRate,
    newAndReturningCustomerCounts,
    returningCustomerRateBreakdown,
    salesByProduct,
    salesByChannel,
    sessionsOverTime,
    sessionsOverTimeBreakdown,
    sessionsByDevice,
    sessionsByLocation,
    conversionFunnel,
    conversionRateOverTime,
    conversionRateOverTimeBreakdown,
    conversionRateSummary,
    totalSalesBySocialReferrer,
    customerCohortAnalysis,
  };

  return buildDashboardPayload(raw, range.interval);
}

export async function getLiveViewData(): Promise<LiveViewPayload> {
  await requireSession();

  const range = resolveDateRange("today", new Date());

  if (!hasRealCredentials()) {
    return buildMockLiveViewPayload(range);
  }

  const [
    visitorsRightNow,
    revenueStats,
    sessionsOverTime,
    conversionFunnel,
    sessionsByLocation,
    newAndReturningCustomers,
    salesByProduct,
  ] = await Promise.all([
    getLiveVisitorCount().catch((error) => {
      console.error("Live visitor count fetch failed:", error);
      return 0;
    }),
    settle(liveCachedRevenueStats(range)),
    settle(liveCachedSessionsOverTime(range)),
    settle(liveCachedConversionFunnel(range)),
    settle(liveCachedSessionsByLocation(range)),
    settle(liveCachedCustomerSplit(range.current)),
    settle(liveCachedTopProducts(range)),
  ]);

  const raw: RawLiveViewResults = {
    revenueStats,
    sessionsOverTime,
    conversionFunnel,
    sessionsByLocation,
    newAndReturningCustomers,
    salesByProduct,
  };

  return buildLiveViewPayload(raw, visitorsRightNow);
}

export async function fetchLiveVisitorCount(): Promise<number> {
  await requireSession();
  if (!hasRealCredentials()) return 8;
  return getLiveVisitorCount();
}
