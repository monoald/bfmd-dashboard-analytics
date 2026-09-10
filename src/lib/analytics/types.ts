export type DateRangeKey =
  | "today"
  | "7d"
  | "30d"
  | "yesterday"
  | "mtd"
  | "last-month"
  | "ytd"
  | "last-year"
  | "90d"
  | "custom";

export interface PeriodBounds {
  start: Date;
  end: Date;
}

export interface ResolvedDateRange {
  key: DateRangeKey;
  interval: "hour" | "day" | "week";
  current: PeriodBounds;
  previous: PeriodBounds;
}

export interface ChangeMetric {
  value: number;
  changePercentage: number;
  trend: "up" | "down";
  sparkline?: number[];
}

export interface TimeSeriesData {
  date: string;
  currentPeriod: number;
  previousPeriod: number;
}

export interface NamedValue {
  name: string;
  value: number;
  // Optional: when present, the ranked-list UI renders a period-over-period
  // comparison bar + % change instead of a single bar. Only populated by
  // fetchers that fetch both periods (see products.ts, sessions.ts's
  // getSessionsByLocation, referrers.ts).
  previousValue?: number;
}

// One row of the "Sessions over time" report's detail table: GA4's series
// is already in chronological (ascending) order — unlike WooCommerce's
// revenue/stats intervals, which come back most-recent-first — so unlike
// RevenueBreakdownRow/SalesOverTimeBreakdownRow this needs only one date
// label per row, not separate current/previous ones.
export interface SessionsOverTimeBreakdownRow {
  date: string;
  onlineStoreVisitors: { current: number; previous: number };
  sessions: { current: number; previous: number };
}

// One row of the "Conversion rate over time" report's detail table:
// GA4's series is chronological (see SessionsOverTimeBreakdownRow), so only
// one date label per row. `conversionRate` is computed per-bucket directly
// from that bucket's raw completedCheckout/sessions counts, never by
// averaging already-computed rate percentages across buckets (the class of
// bug documented on weightedRate in normalize.ts).
export interface ConversionRateOverTimeBreakdownRow {
  date: string;
  sessions: { current: number; previous: number };
  addedToCart: { current: number; previous: number };
  reachedCheckout: { current: number; previous: number };
  completedCheckout: { current: number; previous: number };
  conversionRate: { current: number; previous: number };
}

export interface FunnelStep {
  step: string;
  sessions: number;
  percentage: number;
  // Optional: when present, the funnel UI renders a period-over-period
  // trend for this step's session count (see ga4/funnel.ts).
  previousSessions?: number;
}

export interface SalesBreakdownLine {
  label: string;
  value: number;
}

// One row of the "Average order value over time" report's detail table:
// several related metrics for the same interval, each as a current/previous
// pair, plus pre-formatted date labels (see formatWcIntervalLabel) so the
// table component doesn't need to know about WooCommerce's raw date_start
// format or the period's interval granularity.
export interface RevenueBreakdownRow {
  currentDateLabel: string;
  previousDateLabel: string;
  grossSales: { current: number; previous: number };
  discounts: { current: number; previous: number };
  orders: { current: number; previous: number };
  averageOrderValue: { current: number; previous: number };
}

// One row of the "Total sales over time" report's detail table: the full
// Shopify-style sales breakdown (Orders through Total sales) for a single
// interval, each as a current/previous pair. `duties` and `additionalFees`
// are always {current: 0, previous: 0} — WooCommerce's revenue/stats
// endpoint has no equivalent field for either (both are Shopify-specific
// order charges); kept as columns for layout parity with Shopify's report.
export interface SalesOverTimeBreakdownRow {
  currentDateLabel: string;
  previousDateLabel: string;
  orders: { current: number; previous: number };
  grossSales: { current: number; previous: number };
  discounts: { current: number; previous: number };
  salesReversals: { current: number; previous: number };
  netSales: { current: number; previous: number };
  shippingCharges: { current: number; previous: number };
  duties: { current: number; previous: number };
  additionalFees: { current: number; previous: number };
  taxes: { current: number; previous: number };
  totalSales: { current: number; previous: number };
}

// One row of the "Orders" report's detail table. `orders` and
// `averageOrderValue` are derived from the same revenueStats source already
// used elsewhere (TotalSalesOverTimeTable, RevenueBreakdownTable), not a
// second endpoint, so they can't disagree with those. `itemsPerOrder` is the
// one new number (from getItemsSoldOverTime's orders/stats fetch).
// `reversedQuantity` is always {current: 0, previous: 0} — WooCommerce's
// Analytics API has no item-quantity-refunded field (only a dollar refund
// total, already used for salesReversals above); kept as a column for
// layout parity with Shopify's report, same treatment as
// SalesOverTimeBreakdownRow's duties/additionalFees.
export interface OrdersOverTimeBreakdownRow {
  currentDateLabel: string;
  previousDateLabel: string;
  orders: { current: number; previous: number };
  itemsPerOrder: { current: number; previous: number };
  averageOrderValue: { current: number; previous: number };
  reversedQuantity: { current: number; previous: number };
}

// One row of the "Returning Customer Rate" report's detail table. Unlike
// every other breakdown row above, `customers`/`returningCustomers` are not
// additive across rows — the same customer can be attributed to more than
// one bucket (see getReturningCustomerRateBreakdown in customers.ts) — so
// summing this table's rows does not reproduce the returningCustomerRate
// summary card; that card's own numbers come from a separate whole-period
// fetch. `returningCustomerRate` is computed per-bucket directly from that
// bucket's own counts (weighted-rate style, never averaged — same rule as
// ConversionRateOverTimeBreakdownRow.conversionRate).
export interface ReturningCustomerRateBreakdownRow {
  currentDateLabel: string;
  previousDateLabel: string;
  returningCustomers: { current: number; previous: number };
  customers: { current: number; previous: number };
  returningCustomerRate: { current: number; previous: number };
}

// One row of the "Customer cohort analysis" report: customers grouped by
// the calendar month of their first-ever order (cohort membership never
// changes after that). retentionByMonth[0] is "Month 0" — customers who
// placed a *repeat* order within that same first month, not the first
// order itself, which is what defines the cohort. retentionByMonth[1] is
// "Month 1" (the next calendar month after cohortMonth), and so on.
// Length is 1 (Month 0) plus however many calendar months have elapsed
// since cohortMonth, not a fixed 13 — the most recent cohort row has
// exactly 2 entries (Month 0 plus the current, still-in-progress month),
// the oldest visible row has up to 13.
export interface CohortRow {
  cohortMonth: string; // ISO month, e.g. "2026-01"
  cohortSize: number;
  retentionByMonth: number[];
}

export type CardKey =
  | "grossSales"
  | "conversionRate"
  | "ordersFulfilled"
  | "orders"
  | "returningCustomerRate"
  | "sessionsOverTime"
  | "sessionsOverTimeBreakdown"
  | "conversionRateOverTime"
  | "conversionRateOverTimeBreakdown"
  | "conversionFunnel"
  | "sessionsByDevice"
  | "sessionsByLocation"
  | "totalSalesBySocialReferrer"
  | "salesOverTime"
  | "salesBreakdown"
  | "salesByChannel"
  | "aovOverTime"
  | "salesByProduct"
  | "customerCohortAnalysis";

export interface DashboardPayload {
  summaryCards: {
    grossSales: ChangeMetric;
    conversionRate: ChangeMetric;
    ordersFulfilled: ChangeMetric;
    orders: ChangeMetric;
    returningCustomerRate: ChangeMetric;
    averageOrderValue: ChangeMetric;
  };
  charts: {
    sessionsOverTime: TimeSeriesData[];
    sessionsOverTimeBreakdown: SessionsOverTimeBreakdownRow[];
    conversionRateOverTime: TimeSeriesData[];
    conversionRateOverTimeBreakdown: ConversionRateOverTimeBreakdownRow[];
    conversionFunnel: FunnelStep[];
    sessionsByDevice: NamedValue[];
    sessionsByLocation: NamedValue[];
    totalSalesBySocialReferrer: NamedValue[];
    salesOverTime: TimeSeriesData[];
    salesBreakdown: SalesBreakdownLine[];
    salesByChannel: NamedValue[];
    aovOverTime: TimeSeriesData[];
    revenueBreakdownOverTime: RevenueBreakdownRow[];
    salesOverTimeBreakdown: SalesOverTimeBreakdownRow[];
    ordersOverTimeBreakdown: OrdersOverTimeBreakdownRow[];
    returningCustomerRateBreakdown: ReturningCustomerRateBreakdownRow[];
    // Separate whole-period totals for the "Returning Customer Rate" report
    // table's summary row — NOT derived by summing
    // returningCustomerRateBreakdown (see that type's comment for why
    // customer counts can't be summed across buckets).
    returningCustomerRateSummary: {
      returningCustomers: { current: number; previous: number };
      customers: { current: number; previous: number };
      returningCustomerRate: { current: number; previous: number };
    };
    salesByProduct: NamedValue[];
    customerCohortAnalysis: CohortRow[];
  };
  errors: Partial<Record<CardKey, string>>;
}

export type LiveCardKey =
  | "totalSales"
  | "sessions"
  | "orders"
  | "customerBehavior"
  | "sessionsByLocation"
  | "newVsReturning"
  | "salesByProduct";

export interface LiveViewPayload {
  visitorsRightNow: number;
  summaryCards: {
    totalSales: ChangeMetric;
    sessions: ChangeMetric;
    orders: ChangeMetric;
  };
  customerBehavior: FunnelStep[];
  sessionsByLocation: NamedValue[];
  newVsReturning: { new: number; returning: number };
  salesByProduct: NamedValue[];
  errors: Partial<Record<LiveCardKey, string>>;
}
