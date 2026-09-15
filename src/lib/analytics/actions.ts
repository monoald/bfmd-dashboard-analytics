"use server";

import { requireSession } from "@/lib/auth/require-session";
import { withCache, withFixedCache, withRangeCache } from "./cache";
import { resolveCustomRange, resolveDateRange } from "./date-range";
import { buildDashboardPayload, type RawPipelineResults } from "./normalize";
import { getRevenueStats } from "./woocommerce/revenue";
import { getItemsSoldOverTime, getOrdersFulfilled } from "./woocommerce/orders";
import {
  getReturningCustomerRate,
  getCurrentCustomerSplit,
  getNewAndReturningCustomerCounts,
  getReturningCustomerRateBreakdown,
} from "./woocommerce/customers";
import {
  getSalesByProductBreakdown,
  getTopProductsByRevenue,
} from "./woocommerce/products";
import { getSalesByChannel } from "./woocommerce/sales-channel";
import { getCustomerCohortAnalysis } from "./woocommerce/cohort";
import { SHOW_CUSTOMER_COHORT_ANALYSIS } from "./report-config";
import {
  getSessionsByDevice,
  getSessionsByDeviceBreakdown,
  getSessionsByLocation,
  getSessionsByLocationBreakdown,
  getSessionsOverTime,
  getSessionsOverTimeBreakdown,
  getSessionsSummary,
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
  buildMockCohortRows,
  buildMockDashboardPayload,
  buildMockLiveViewPayload,
} from "./mock-data";
import type {
  ChangeMetric,
  CohortRow,
  ConversionRateOverTimeBreakdownRow,
  DashboardPayload,
  DateRangeKey,
  FunnelStep,
  LiveViewPayload,
  NamedValue,
  ResolvedDateRange,
  SessionsByDeviceBreakdownRow,
  SessionsByLocationBreakdownRow,
  SessionsOverTimeBreakdownRow,
  SessionsSummary,
  TimeSeriesData,
} from "./types";

const cachedRevenueStats = withRangeCache(getRevenueStats, "wc-revenue-stats");
const cachedOrdersFulfilled = withRangeCache(
  getOrdersFulfilled,
  "wc-orders-fulfilled",
);
const cachedItemsSoldOverTime = withRangeCache(
  getItemsSoldOverTime,
  "wc-items-sold-over-time",
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
const cachedSalesByProductBreakdown = withRangeCache(
  getSalesByProductBreakdown,
  "wc-sales-by-product-breakdown",
);
const cachedSalesByChannel = withFixedCache(
  getSalesByChannel,
  "wc-sales-by-channel",
  14400,
);
// These 10 cards all read GA4's live, still-accumulating "sessions" data for
// "today" ranges. Caching each one individually (as separate withRangeCache
// entries) let them drift apart: each entry repopulates on its own 5-minute
// clock, so at any moment some cards could be serving a slightly staler
// snapshot than others, showing different totals for what should be the same
// underlying session count (see pending-credentials-verification memory,
// 2026-09-10 entry). Bundling them behind one cache entry means they always
// repopulate together, from one GA4 fetch wave, so they can't disagree.
interface Ga4TodayBundle {
  sessionsOverTime: TimeSeriesData[] | Error;
  sessionsOverTimeBreakdown: SessionsOverTimeBreakdownRow[] | Error;
  sessionsSummary: SessionsSummary | Error;
  sessionsByDevice: NamedValue[] | Error;
  sessionsByDeviceBreakdown: SessionsByDeviceBreakdownRow[] | Error;
  sessionsByLocation: NamedValue[] | Error;
  sessionsByLocationBreakdown: SessionsByLocationBreakdownRow[] | Error;
  conversionFunnel: FunnelStep[] | Error;
  conversionRateOverTime: TimeSeriesData[] | Error;
  conversionRateOverTimeBreakdown: ConversionRateOverTimeBreakdownRow[] | Error;
  conversionRateSummary: ChangeMetric | Error;
  totalSalesBySocialReferrer: NamedValue[] | Error;
}

// unstable_cache persists its return value across requests (and, in
// production, across server instances), so it must stay JSON-serializable —
// an Error instance wouldn't survive that round trip. Settle each field to a
// plain ok/error marker here, then convert markers back to real Error
// objects in getDashboardData, after the cache boundary.
type Settled<T> = { ok: true; value: T } | { ok: false };

async function toSettled<T>(promise: Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    console.error("Analytics fetcher failed:", error);
    return { ok: false };
  }
}

async function fetchGa4TodayBundle(
  range: ResolvedDateRange,
): Promise<{
  sessionsOverTime: Settled<TimeSeriesData[]>;
  sessionsOverTimeBreakdown: Settled<SessionsOverTimeBreakdownRow[]>;
  sessionsSummary: Settled<SessionsSummary>;
  sessionsByDevice: Settled<NamedValue[]>;
  sessionsByDeviceBreakdown: Settled<SessionsByDeviceBreakdownRow[]>;
  sessionsByLocation: Settled<NamedValue[]>;
  sessionsByLocationBreakdown: Settled<SessionsByLocationBreakdownRow[]>;
  conversionFunnel: Settled<FunnelStep[]>;
  conversionRateOverTime: Settled<TimeSeriesData[]>;
  conversionRateOverTimeBreakdown: Settled<ConversionRateOverTimeBreakdownRow[]>;
  conversionRateSummary: Settled<ChangeMetric>;
  totalSalesBySocialReferrer: Settled<NamedValue[]>;
}> {
  const [
    sessionsOverTime,
    sessionsOverTimeBreakdown,
    sessionsSummary,
    sessionsByDevice,
    sessionsByDeviceBreakdown,
    sessionsByLocation,
    sessionsByLocationBreakdown,
    conversionFunnel,
    conversionRateOverTime,
    conversionRateOverTimeBreakdown,
    conversionRateSummary,
    totalSalesBySocialReferrer,
  ] = await Promise.all([
    toSettled(getSessionsOverTime(range)),
    toSettled(getSessionsOverTimeBreakdown(range)),
    toSettled(getSessionsSummary(range)),
    toSettled(getSessionsByDevice(range)),
    toSettled(getSessionsByDeviceBreakdown(range)),
    toSettled(getSessionsByLocation(range)),
    toSettled(getSessionsByLocationBreakdown(range)),
    toSettled(getConversionFunnel(range)),
    toSettled(getConversionRateOverTime(range)),
    toSettled(getConversionRateOverTimeBreakdown(range)),
    toSettled(getConversionRateSummary(range)),
    toSettled(getSocialReferrerRevenue(range)),
  ]);

  return {
    sessionsOverTime,
    sessionsOverTimeBreakdown,
    sessionsSummary,
    sessionsByDevice,
    sessionsByDeviceBreakdown,
    sessionsByLocation,
    sessionsByLocationBreakdown,
    conversionFunnel,
    conversionRateOverTime,
    conversionRateOverTimeBreakdown,
    conversionRateSummary,
    totalSalesBySocialReferrer,
  };
}

const cachedGa4TodayBundle = withRangeCache(
  fetchGa4TodayBundle,
  "ga4-today-bundle",
);

const CARD_ERROR_MESSAGE = "Unable to load data for this card. Please try again later.";

function fromSettled<T>(settled: Settled<T>): T | Error {
  return settled.ok ? settled.value : new Error(CARD_ERROR_MESSAGE);
}

async function getGa4TodayBundle(
  range: ResolvedDateRange,
): Promise<Ga4TodayBundle> {
  const bundle = await cachedGa4TodayBundle(range);
  return {
    sessionsOverTime: fromSettled(bundle.sessionsOverTime),
    sessionsOverTimeBreakdown: fromSettled(bundle.sessionsOverTimeBreakdown),
    sessionsSummary: fromSettled(bundle.sessionsSummary),
    sessionsByDevice: fromSettled(bundle.sessionsByDevice),
    sessionsByDeviceBreakdown: fromSettled(bundle.sessionsByDeviceBreakdown),
    sessionsByLocation: fromSettled(bundle.sessionsByLocation),
    sessionsByLocationBreakdown: fromSettled(
      bundle.sessionsByLocationBreakdown,
    ),
    conversionFunnel: fromSettled(bundle.conversionFunnel),
    conversionRateOverTime: fromSettled(bundle.conversionRateOverTime),
    conversionRateOverTimeBreakdown: fromSettled(
      bundle.conversionRateOverTimeBreakdown,
    ),
    conversionRateSummary: fromSettled(bundle.conversionRateSummary),
    totalSalesBySocialReferrer: fromSettled(bundle.totalSalesBySocialReferrer),
  };
}
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
const liveCachedSessionsSummary = withCache(
  getSessionsSummary,
  ["live-sessions-summary"],
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

// Standalone from getDashboardData: cohort analysis doesn't depend on the
// dashboard's selected date range (see getCustomerCohortAnalysis's own
// comment), and is by far the most expensive metric to compute (a 24-month
// paginated order-history scan) — bundling it into the same Promise.all as
// everything else meant one slow fetch blocked every other card from
// rendering. Callers render this behind their own <Suspense> boundary,
// independent of the range-dependent content.
export async function getCustomerCohortAnalysisCard(): Promise<
  CohortRow[] | Error
> {
  await requireSession();

  if (!hasRealCredentials()) {
    return buildMockCohortRows(new Date());
  }
  if (!SHOW_CUSTOMER_COHORT_ANALYSIS) {
    return [];
  }
  return settle(cachedCustomerCohortAnalysis());
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
    itemsSoldOverTime,
    returningCustomerRate,
    newAndReturningCustomerCounts,
    returningCustomerRateBreakdown,
    salesByProduct,
    salesByProductBreakdown,
    salesByChannel,
    ga4Bundle,
    customerCohortAnalysis,
  ] = await Promise.all([
    settle(cachedRevenueStats(range)),
    settle(cachedOrdersFulfilled(range)),
    settle(cachedItemsSoldOverTime(range)),
    settle(cachedReturningCustomerRate(range)),
    settle(cachedNewAndReturningCustomerCounts(range)),
    settle(cachedReturningCustomerRateBreakdown(range)),
    settle(cachedTopProducts(range)),
    settle(cachedSalesByProductBreakdown(range)),
    settle(cachedSalesByChannel(range)),
    getGa4TodayBundle(range),
    customerCohortAnalysisPromise,
  ]);

  const raw: RawPipelineResults = {
    revenueStats,
    ordersFulfilled,
    itemsSoldOverTime,
    returningCustomerRate,
    newAndReturningCustomerCounts,
    returningCustomerRateBreakdown,
    salesByProduct,
    salesByProductBreakdown,
    salesByChannel,
    ...ga4Bundle,
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
    sessionsSummary,
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
    settle(liveCachedSessionsSummary(range)),
    settle(liveCachedConversionFunnel(range)),
    settle(liveCachedSessionsByLocation(range)),
    settle(liveCachedCustomerSplit(range.current)),
    settle(liveCachedTopProducts(range)),
  ]);

  const raw: RawLiveViewResults = {
    revenueStats,
    sessionsOverTime,
    sessionsSummary,
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
