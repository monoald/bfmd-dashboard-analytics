import { computeChange } from "./normalize";
import type {
  DashboardPayload,
  LiveViewPayload,
  ResolvedDateRange,
  TimeSeriesData,
} from "./types";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function hourLabel(hour: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12} ${period}`;
}

function bucketDates(range: ResolvedDateRange): Date[] {
  const { start, end } = range.current;

  // Note: on a spring-forward DST transition day, the skipped local hour
  // (e.g. 2 AM in zones that jump straight to 3 AM) gets silently
  // normalized forward by the Date constructor, producing a duplicate
  // hour label for that one calendar day per year. This only affects
  // mock/synthetic hourly labels, never real fetched data. Not fixed —
  // narrow enough (2 days/year, cosmetic only) to not warrant the
  // complexity of detecting and special-casing the skipped hour.
  if (range.interval === "hour") {
    const year = start.getUTCFullYear();
    const month = start.getUTCMonth();
    const day = start.getUTCDate();
    return Array.from(
      { length: 24 },
      (_, hour) => new Date(Date.UTC(year, month, day, hour, 0, 0, 0)),
    );
  }

  // Walk via UTC calendar-date arithmetic rather than local getters/setters:
  // `start` may be a plain local-midnight instant (preset ranges) or an
  // EST-pinned one (custom ranges, see resolveCustomRangeParams), and UTC
  // arithmetic correctly advances whole calendar days for either, since it
  // never applies local DST rules that would otherwise reinterpret the
  // fixed hour-of-day baked into `start`.
  const step = range.interval === "week" ? 7 : 1;
  const dates: Date[] = [];
  let cursor = new Date(start.getTime());
  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor);
    cursor = new Date(
      Date.UTC(
        cursor.getUTCFullYear(),
        cursor.getUTCMonth(),
        cursor.getUTCDate() + step,
        cursor.getUTCHours(),
        cursor.getUTCMinutes(),
        cursor.getUTCSeconds(),
        cursor.getUTCMilliseconds(),
      ),
    );
  }
  return dates;
}

function bucketLabels(range: ResolvedDateRange): string[] {
  return bucketDates(range).map((date) =>
    range.interval === "hour"
      ? hourLabel(date.getUTCHours())
      : `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCDate()}`,
  );
}

// Deterministic wavy value generator so mock data looks varied (not flat)
// without being random/flaky between renders.
function wave(
  index: number,
  base: number,
  amplitude: number,
  phase = 0,
): number {
  return Math.max(0, base + amplitude * Math.sin(index / 2.3 + phase));
}

function buildSeries(
  labels: string[],
  base: number,
  amplitude: number,
  previousFactor: number,
): TimeSeriesData[] {
  return labels.map((date, i) => ({
    date,
    currentPeriod: Math.round(wave(i, base, amplitude)),
    previousPeriod: Math.round(
      wave(i, base * previousFactor, amplitude * previousFactor, 0.6),
    ),
  }));
}

function sum(
  series: TimeSeriesData[],
  key: "currentPeriod" | "previousPeriod",
): number {
  return series.reduce((total, point) => total + point[key], 0);
}

export function buildMockDashboardPayload(
  range: ResolvedDateRange,
): DashboardPayload {
  const labels = bucketLabels(range);
  const perBucketBase =
    range.interval === "hour"
      ? { revenue: 2200, sessions: 220, orders: 5.5 }
      : range.interval === "week"
        ? { revenue: 9000 * 7, sessions: 750 * 7, orders: 22 * 7 }
        : { revenue: 9000, sessions: 750, orders: 22 };

  const salesOverTime = buildSeries(
    labels,
    perBucketBase.revenue,
    perBucketBase.revenue * 0.45,
    0.87,
  );
  const sessionsOverTime = buildSeries(
    labels,
    perBucketBase.sessions,
    perBucketBase.sessions * 0.5,
    0.82,
  );
  const ordersSeries = buildSeries(
    labels,
    perBucketBase.orders,
    perBucketBase.orders * 0.4,
    0.85,
  );
  const aovOverTime = buildSeries(labels, 58, 14, 0.94);
  const conversionRateOverTime = buildSeries(labels, 10.2, 3.4, 1.08);
  const returningCustomerRateSeries = buildSeries(labels, 52, 8, 0.9);

  const grossSalesCurrent = sum(salesOverTime, "currentPeriod");
  const grossSalesPrevious = sum(salesOverTime, "previousPeriod");
  const sessionsCurrent = sum(sessionsOverTime, "currentPeriod");
  const sessionsPrevious = sum(sessionsOverTime, "previousPeriod");
  const ordersCurrent = Math.round(sum(ordersSeries, "currentPeriod"));
  const ordersPrevious = Math.round(sum(ordersSeries, "previousPeriod"));
  const ordersFulfilledCurrent = Math.round(ordersCurrent * 0.68);
  const ordersFulfilledPrevious = Math.round(ordersPrevious * 0.62);
  const conversionRateCurrent =
    sum(conversionRateOverTime, "currentPeriod") / labels.length;
  const conversionRatePrevious =
    sum(conversionRateOverTime, "previousPeriod") / labels.length;
  const returningCustomerRateCurrent =
    sum(returningCustomerRateSeries, "currentPeriod") / labels.length;
  const returningCustomerRatePrevious =
    sum(returningCustomerRateSeries, "previousPeriod") / labels.length;

  const discounts = -Math.round(grossSalesCurrent * 0.259);
  const salesReversals = -Math.round(grossSalesCurrent * 0.0167);
  const netSales = Math.round(grossSalesCurrent) + discounts + salesReversals;
  const shipping = Math.round(grossSalesCurrent * 0.015);
  const taxes = Math.round(grossSalesCurrent * 0.0233);
  const totalSales = netSales + shipping + taxes;

  return {
    summaryCards: {
      grossSales: {
        ...computeChange(
          Math.round(grossSalesCurrent),
          Math.round(grossSalesPrevious),
        ),
        sparkline: salesOverTime.map((point) => point.currentPeriod),
      },
      conversionRate: {
        ...computeChange(
          Math.round(conversionRateCurrent * 10) / 10,
          Math.round(conversionRatePrevious * 10) / 10,
        ),
        sparkline: conversionRateOverTime.map((point) => point.currentPeriod),
      },
      ordersFulfilled: {
        ...computeChange(ordersFulfilledCurrent, ordersFulfilledPrevious),
        sparkline: ordersSeries.map((point) =>
          Math.round(point.currentPeriod * 0.68),
        ),
      },
      orders: {
        ...computeChange(ordersCurrent, ordersPrevious),
        sparkline: ordersSeries.map((point) => point.currentPeriod),
      },
      returningCustomerRate: {
        ...computeChange(
          Math.round(returningCustomerRateCurrent * 10) / 10,
          Math.round(returningCustomerRatePrevious * 10) / 10,
        ),
        sparkline: returningCustomerRateSeries.map(
          (point) => point.currentPeriod,
        ),
      },
      averageOrderValue: computeChange(
        Math.round(sum(aovOverTime, "currentPeriod") / labels.length),
        Math.round(sum(aovOverTime, "previousPeriod") / labels.length),
      ),
    },
    charts: {
      sessionsOverTime,
      // "Online store visitors" (GA4's totalUsers) always trails "Sessions"
      // (GA4's sessions) somewhat, since one visitor can open several
      // sessions — 0.85 is an arbitrary but plausible mock ratio.
      sessionsOverTimeBreakdown: labels.map((label, i) => ({
        date: label,
        sessions: {
          current: Math.round(sessionsOverTime[i].currentPeriod),
          previous: Math.round(sessionsOverTime[i].previousPeriod),
        },
        onlineStoreVisitors: {
          current: Math.round(sessionsOverTime[i].currentPeriod * 0.85),
          previous: Math.round(sessionsOverTime[i].previousPeriod * 0.85),
        },
      })),
      conversionRateOverTime,
      // Same per-step ratios used for the conversionFunnel snapshot below,
      // applied per-bucket instead of to the period total.
      conversionRateOverTimeBreakdown: labels.map((label, i) => {
        const sessions = {
          current: Math.round(sessionsOverTime[i].currentPeriod),
          previous: Math.round(sessionsOverTime[i].previousPeriod),
        };
        const addedToCart = {
          current: Math.round(sessions.current * 0.26),
          previous: Math.round(sessions.previous * 0.285),
        };
        const reachedCheckout = {
          current: Math.round(sessions.current * 0.28),
          previous: Math.round(sessions.previous * 0.31),
        };
        const completedCheckout = {
          current: Math.round(sessions.current * 0.1),
          previous: Math.round(sessions.previous * 0.082),
        };
        return {
          date: label,
          sessions,
          addedToCart,
          reachedCheckout,
          completedCheckout,
          conversionRate: {
            current: sessions.current
              ? Math.round((completedCheckout.current / sessions.current) * 1000) / 10
              : 0,
            previous: sessions.previous
              ? Math.round(
                  (completedCheckout.previous / sessions.previous) * 1000,
                ) / 10
              : 0,
          },
        };
      }),
      conversionFunnel: [
        {
          step: "Sessions",
          sessions: Math.round(sessionsCurrent),
          percentage: 100,
          previousSessions: Math.round(sessionsPrevious),
        },
        {
          step: "Added to cart",
          sessions: Math.round(sessionsCurrent * 0.26),
          percentage: 26,
          previousSessions: Math.round(sessionsPrevious * 0.285),
        },
        {
          step: "Reached checkout",
          sessions: Math.round(sessionsCurrent * 0.28),
          percentage: 28,
          previousSessions: Math.round(sessionsPrevious * 0.31),
        },
        {
          step: "Completed checkout",
          sessions: Math.round(sessionsCurrent * 0.1),
          percentage: 10,
          previousSessions: Math.round(sessionsPrevious * 0.082),
        },
      ],
      sessionsByDevice: [
        {
          name: "Mobile",
          value: Math.round(sessionsCurrent * 0.72),
          previousValue: Math.round(sessionsPrevious * 0.79),
        },
        {
          name: "Desktop",
          value: Math.round(sessionsCurrent * 0.26),
          previousValue: Math.round(sessionsPrevious * 0.205),
        },
        {
          name: "Tablet",
          value: Math.round(sessionsCurrent * 0.015),
          previousValue: Math.round(sessionsPrevious * 0.0155),
        },
        {
          name: "Other",
          value: Math.round(sessionsCurrent * 0.005),
          previousValue: Math.round(sessionsPrevious * 0.0195),
        },
      ],
      sessionsByLocation: [
        {
          name: "United States · Florida · Miami",
          value: Math.round(sessionsCurrent * 0.06),
          previousValue: Math.round(sessionsPrevious * 0.058),
        },
        {
          name: "United States · Illinois · Chicago",
          value: Math.round(sessionsCurrent * 0.055),
          previousValue: Math.round(sessionsPrevious * 0.062),
        },
        {
          name: "United States · Georgia · Atlanta",
          value: Math.round(sessionsCurrent * 0.05),
          previousValue: Math.round(sessionsPrevious * 0.045),
        },
        {
          name: "United States · Arizona · Phoenix",
          value: Math.round(sessionsCurrent * 0.045),
          previousValue: Math.round(sessionsPrevious * 0.05),
        },
        {
          name: "United States · Texas · Houston",
          value: Math.round(sessionsCurrent * 0.04),
          previousValue: Math.round(sessionsPrevious * 0.033),
        },
      ],
      totalSalesBySocialReferrer: [
        {
          name: "youtube",
          value: Math.round(grossSalesCurrent * 0.082),
          previousValue: Math.round(grossSalesPrevious * 0.02),
        },
        {
          name: "instagram",
          value: Math.round(grossSalesCurrent * 0.0014),
          previousValue: Math.round(grossSalesPrevious * 0.0016),
        },
        {
          name: "pinterest",
          value: Math.round(grossSalesCurrent * 0.0005 * 100) / 100,
          previousValue: Math.round(grossSalesPrevious * 0.0004 * 100) / 100,
        },
        {
          name: "facebook",
          value: 0,
          previousValue: Math.round(grossSalesPrevious * 0.0002 * 100) / 100,
        },
      ],
      salesOverTime,
      salesBreakdown: [
        { label: "Gross sales", value: Math.round(grossSalesCurrent) },
        { label: "Discounts", value: discounts },
        { label: "Sales reversals", value: salesReversals },
        { label: "Net sales", value: netSales },
        { label: "Shipping charges", value: shipping },
        { label: "Taxes", value: taxes },
        { label: "Total sales", value: totalSales },
      ],
      salesByChannel: [
        { name: "Online Store", value: Math.round(totalSales * 0.79) },
        { name: "Buy Button", value: Math.round(totalSales * 0.11) },
        { name: "Loop Subscriptions", value: Math.round(totalSales * 0.1) },
        { name: "Draft Orders", value: 0 },
      ],
      aovOverTime,
      revenueBreakdownOverTime: labels.map((label, i) => ({
        currentDateLabel: label,
        previousDateLabel: label,
        grossSales: {
          current: Math.round(salesOverTime[i].currentPeriod),
          previous: Math.round(salesOverTime[i].previousPeriod),
        },
        discounts: {
          current: -Math.round(salesOverTime[i].currentPeriod * 0.259),
          previous: -Math.round(salesOverTime[i].previousPeriod * 0.259),
        },
        orders: {
          current: Math.round(ordersSeries[i].currentPeriod),
          previous: Math.round(ordersSeries[i].previousPeriod),
        },
        averageOrderValue: {
          current: Math.round(aovOverTime[i].currentPeriod),
          previous: Math.round(aovOverTime[i].previousPeriod),
        },
      })),
      salesOverTimeBreakdown: labels.map((label, i) => {
        // Same fractions used for the summary card totals above (discounts,
        // salesReversals, shipping, taxes), applied per-bucket instead of to
        // the period total.
        const bucketDiscounts = (period: "currentPeriod" | "previousPeriod") =>
          -Math.round(salesOverTime[i][period] * 0.259);
        const bucketReversals = (period: "currentPeriod" | "previousPeriod") =>
          -Math.round(salesOverTime[i][period] * 0.0167);
        const bucketShipping = (period: "currentPeriod" | "previousPeriod") =>
          Math.round(salesOverTime[i][period] * 0.015);
        const bucketTaxes = (period: "currentPeriod" | "previousPeriod") =>
          Math.round(salesOverTime[i][period] * 0.0233);
        const bucketNetSales = (period: "currentPeriod" | "previousPeriod") =>
          Math.round(salesOverTime[i][period]) +
          bucketDiscounts(period) +
          bucketReversals(period);
        const bucketTotalSales = (period: "currentPeriod" | "previousPeriod") =>
          bucketNetSales(period) + bucketShipping(period) + bucketTaxes(period);

        return {
          currentDateLabel: label,
          previousDateLabel: label,
          orders: {
            current: Math.round(ordersSeries[i].currentPeriod),
            previous: Math.round(ordersSeries[i].previousPeriod),
          },
          grossSales: {
            current: Math.round(salesOverTime[i].currentPeriod),
            previous: Math.round(salesOverTime[i].previousPeriod),
          },
          discounts: {
            current: bucketDiscounts("currentPeriod"),
            previous: bucketDiscounts("previousPeriod"),
          },
          salesReversals: {
            current: bucketReversals("currentPeriod"),
            previous: bucketReversals("previousPeriod"),
          },
          netSales: {
            current: bucketNetSales("currentPeriod"),
            previous: bucketNetSales("previousPeriod"),
          },
          shippingCharges: {
            current: bucketShipping("currentPeriod"),
            previous: bucketShipping("previousPeriod"),
          },
          duties: { current: 0, previous: 0 },
          additionalFees: { current: 0, previous: 0 },
          taxes: {
            current: bucketTaxes("currentPeriod"),
            previous: bucketTaxes("previousPeriod"),
          },
          totalSales: {
            current: bucketTotalSales("currentPeriod"),
            previous: bucketTotalSales("previousPeriod"),
          },
        };
      }),
      salesByProduct: [
        {
          name: "Supercharged Cocoa Flavanols + Flavonoids 1200mg",
          value: Math.round(grossSalesCurrent * 0.316),
          previousValue: Math.round(grossSalesPrevious * 0.29),
        },
        {
          name: "Magnesium Sleep Aid 1695 MG | Melatonin-Free",
          value: Math.round(grossSalesCurrent * 0.069),
          previousValue: Math.round(grossSalesPrevious * 0.075),
        },
        {
          name: "The Nattokinase 4-in-1 Cardio Complex 10,800 FU",
          value: Math.round(grossSalesCurrent * 0.048),
          previousValue: Math.round(grossSalesPrevious * 0.022),
        },
        {
          name: "NMN 1000MG | Enhanced with BioPerine®",
          value: Math.round(grossSalesCurrent * 0.032),
          previousValue: Math.round(grossSalesPrevious * 0.03),
        },
        {
          name: "Turkesterone Tongkat Ali 1000mg",
          value: Math.round(grossSalesCurrent * 0.021),
          previousValue: Math.round(grossSalesPrevious * 0.019),
        },
      ],
    },
    errors: {},
  };
}

export function buildMockLiveViewPayload(
  range: ResolvedDateRange,
): LiveViewPayload {
  const labels = bucketLabels(range);
  const salesOverTime = buildSeries(labels, 2200, 2200 * 0.45, 0.87);
  const sessionsOverTime = buildSeries(labels, 220, 220 * 0.5, 0.82);
  const ordersSeries = buildSeries(labels, 5.5, 5.5 * 0.4, 0.85);

  const totalSalesCurrent = sum(salesOverTime, "currentPeriod");
  const totalSalesPrevious = sum(salesOverTime, "previousPeriod");
  const sessionsCurrent = sum(sessionsOverTime, "currentPeriod");
  const sessionsPrevious = sum(sessionsOverTime, "previousPeriod");
  const ordersCurrent = Math.round(sum(ordersSeries, "currentPeriod"));
  const ordersPrevious = Math.round(sum(ordersSeries, "previousPeriod"));

  return {
    visitorsRightNow: 8,
    summaryCards: {
      totalSales: {
        ...computeChange(
          Math.round(totalSalesCurrent),
          Math.round(totalSalesPrevious),
        ),
        sparkline: salesOverTime.map((point) => point.currentPeriod),
      },
      sessions: {
        ...computeChange(
          Math.round(sessionsCurrent),
          Math.round(sessionsPrevious),
        ),
        sparkline: sessionsOverTime.map((point) => point.currentPeriod),
      },
      orders: {
        ...computeChange(ordersCurrent, ordersPrevious),
        sparkline: ordersSeries.map((point) => point.currentPeriod),
      },
    },
    customerBehavior: [
      {
        step: "Active carts",
        sessions: Math.round(sessionsCurrent * 0.26),
        percentage: 26,
        previousSessions: Math.round(sessionsPrevious * 0.285),
      },
      {
        step: "Checking out",
        sessions: Math.round(sessionsCurrent * 0.28),
        percentage: 28,
        previousSessions: Math.round(sessionsPrevious * 0.31),
      },
      {
        step: "Purchased",
        sessions: Math.round(sessionsCurrent * 0.1),
        percentage: 10,
        previousSessions: Math.round(sessionsPrevious * 0.082),
      },
    ],
    sessionsByLocation: [
      {
        name: "United States · Florida · Miami",
        value: Math.round(sessionsCurrent * 0.06),
      },
      {
        name: "United States · Illinois · Chicago",
        value: Math.round(sessionsCurrent * 0.055),
      },
      {
        name: "United States · Georgia · Atlanta",
        value: Math.round(sessionsCurrent * 0.05),
      },
    ],
    newVsReturning: {
      new: Math.round(sessionsCurrent * 0.42),
      returning: Math.round(sessionsCurrent * 0.31),
    },
    salesByProduct: [
      {
        name: "Supercharged Cocoa Flavanols + Flavonoids 1200mg",
        value: Math.round(totalSalesCurrent * 0.316),
      },
      {
        name: "Magnesium Sleep Aid 1695 MG | Melatonin-Free",
        value: Math.round(totalSalesCurrent * 0.069),
      },
      {
        name: "The Nattokinase 4-in-1 Cardio Complex 10,800 FU",
        value: Math.round(totalSalesCurrent * 0.048),
      },
    ],
    errors: {},
  };
}
