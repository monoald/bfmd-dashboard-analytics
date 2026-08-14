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

export type CardKey =
  | "grossSales"
  | "conversionRate"
  | "ordersFulfilled"
  | "orders"
  | "returningCustomerRate"
  | "sessionsOverTime"
  | "conversionRateOverTime"
  | "conversionFunnel"
  | "sessionsByDevice"
  | "sessionsByLocation"
  | "totalSalesBySocialReferrer"
  | "salesOverTime"
  | "salesBreakdown"
  | "salesByChannel"
  | "aovOverTime"
  | "salesByProduct";

export interface DashboardPayload {
  summaryCards: {
    grossSales: ChangeMetric;
    conversionRate: ChangeMetric;
    ordersFulfilled: ChangeMetric;
    orders: ChangeMetric;
    returningCustomerRate: ChangeMetric;
  };
  charts: {
    sessionsOverTime: TimeSeriesData[];
    conversionRateOverTime: TimeSeriesData[];
    conversionFunnel: FunnelStep[];
    sessionsByDevice: NamedValue[];
    sessionsByLocation: NamedValue[];
    totalSalesBySocialReferrer: NamedValue[];
    salesOverTime: TimeSeriesData[];
    salesBreakdown: SalesBreakdownLine[];
    salesByChannel: NamedValue[];
    aovOverTime: TimeSeriesData[];
    salesByProduct: NamedValue[];
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
