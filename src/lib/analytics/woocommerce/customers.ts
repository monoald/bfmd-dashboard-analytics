import { fetchWcAllPages } from "./client";
import type { PeriodBounds, ResolvedDateRange } from "../types";

interface WcCustomerRow {
  id: number;
  orders_count: number;
}

// "Returning" is window-scoped: a customer counts as returning if they
// placed 2+ orders within the queried period itself, regardless of any
// order history before the period. (Reversed 2026-09-03 from a lifetime
// definition adopted 2026-08-11 — see project memory — after live-data
// testing showed same-day repeat buyers were expected to count as
// returning, which the lifetime definition didn't capture for brand-new
// customers who ordered twice on their first day.) Verified against a live
// store: the customers report's after/before params filter by activity
// within the period, and each row's orders_count is scoped to that same
// window — matching how WooCommerce's own "Returning customers" report is
// computed, not by account registration date.
async function computeCustomerSplit(
  period: PeriodBounds,
): Promise<{ new: number; returning: number }> {
  // Paginated: a busy store can easily have more than 100 customers active
  // in a period (seen live: 315 in a 30-day window), and a single
  // per_page: "100" call would silently drop the rest.
  const rows = await fetchWcAllPages<WcCustomerRow>(
    "/wc-analytics/reports/customers",
    {
      after: period.start.toISOString(),
      before: period.end.toISOString(),
    },
  );
  const returning = rows.filter((row) => row.orders_count > 1).length;
  return { new: rows.length - returning, returning };
}

async function computeReturningRate(period: PeriodBounds): Promise<number> {
  const { new: newCount, returning } = await computeCustomerSplit(period);
  const total = newCount + returning;
  return total === 0 ? 0 : Math.round((returning / total) * 1000) / 10;
}

export async function getReturningCustomerRate(
  range: ResolvedDateRange,
): Promise<{ current: number; previous: number }> {
  const [current, previous] = await Promise.all([
    computeReturningRate(range.current),
    computeReturningRate(range.previous),
  ]);
  return { current, previous };
}

export async function getNewAndReturningCustomerCounts(
  range: ResolvedDateRange,
): Promise<{
  current: { new: number; returning: number };
  previous: { new: number; returning: number };
}> {
  const [current, previous] = await Promise.all([
    computeCustomerSplit(range.current),
    computeCustomerSplit(range.previous),
  ]);
  return { current, previous };
}

export async function getCurrentCustomerSplit(
  period: PeriodBounds,
): Promise<{ new: number; returning: number }> {
  return computeCustomerSplit(period);
}

export interface CustomerActivityInterval {
  date: string; // ISO instant marking the bucket's start (UTC)
  customers: number;
  returningCustomers: number;
}

interface WcOrderActivityRow {
  customer_id: number;
  date_created_gmt: string;
}

// Generates ascending bucket start boundaries covering `period`, in UTC.
// Mirrors mock-data.ts's bucketDates (same DST/timezone tradeoffs apply —
// see that function's comment): for "hour" the period is assumed to span
// exactly one calendar day (true whenever pickInterval chose "hour" —
// date-range.ts's `pickInterval`), so this generates that day's 24 UTC
// hour-starts directly rather than stepping from period.start. These
// bucket labels are UTC and may read a few hours offset from this store's
// site-configured timezone (WooCommerce's own revenue/stats endpoint
// groups server-side in site time) — a cosmetic, documented gap like
// others tracked in project memory, not a count/financial correctness
// issue.
function bucketBoundaries(
  period: PeriodBounds,
  interval: "hour" | "day" | "week",
): Date[] {
  if (interval === "hour") {
    const { start } = period;
    return Array.from(
      { length: 24 },
      (_, hour) =>
        new Date(
          Date.UTC(
            start.getUTCFullYear(),
            start.getUTCMonth(),
            start.getUTCDate(),
            hour,
          ),
        ),
    );
  }

  const step = interval === "week" ? 7 : 1;
  const dates: Date[] = [];
  let cursor = new Date(period.start.getTime());
  while (cursor.getTime() <= period.end.getTime()) {
    dates.push(cursor);
    cursor = new Date(
      Date.UTC(
        cursor.getUTCFullYear(),
        cursor.getUTCMonth(),
        cursor.getUTCDate() + step,
        cursor.getUTCHours(),
        cursor.getUTCMinutes(),
        cursor.getUTCSeconds(),
      ),
    );
  }
  return dates;
}

const BUCKET_MS: Record<"hour" | "day" | "week", number> = {
  hour: 3_600_000,
  day: 86_400_000,
  week: 7 * 86_400_000,
};

// Per-bucket "returning" is classified using the *whole period's* order
// count per customer (same window-scoped rule as computeCustomerSplit —
// see its comment), not that single bucket's own count: a customer with
// two orders an hour apart would otherwise read as "new" in both hourly
// buckets, since neither bucket alone has 2 orders from them, even though
// they're genuinely returning for the period. This keeps each bucket's
// definition of "returning" consistent with the Returning Customer Rate
// card above it.
//
// Customer counts aren't additive across buckets the way dollar/order
// metrics are — the same customer can appear in several bucket rows (once
// per bucket they ordered in) — so these rows intentionally do not sum to
// the period-level card; that card's real numbers come from a separate
// whole-period fetch (getNewAndReturningCustomerCounts), not from summing
// this breakdown.
async function computeCustomerActivityByBucket(
  period: PeriodBounds,
  interval: "hour" | "day" | "week",
): Promise<CustomerActivityInterval[]> {
  const rows = await fetchWcAllPages<WcOrderActivityRow>(
    "/wc-analytics/reports/orders",
    {
      after: period.start.toISOString(),
      before: period.end.toISOString(),
    },
  );

  const ordersPerCustomer = new Map<number, number>();
  for (const row of rows) {
    ordersPerCustomer.set(
      row.customer_id,
      (ordersPerCustomer.get(row.customer_id) ?? 0) + 1,
    );
  }

  const bucketMs = BUCKET_MS[interval];
  const buckets = bucketBoundaries(period, interval).map((start) => ({
    start,
    end: new Date(start.getTime() + bucketMs),
    customers: new Set<number>(),
  }));

  for (const row of rows) {
    const orderTime = new Date(
      `${row.date_created_gmt.replace(" ", "T")}Z`,
    ).getTime();
    const bucket = buckets.find(
      (b) => orderTime >= b.start.getTime() && orderTime < b.end.getTime(),
    );
    bucket?.customers.add(row.customer_id);
  }

  // Most-recent-bucket-first, matching the display convention every other
  // WC-sourced breakdown table already uses.
  return [...buckets].reverse().map((b) => ({
    date: b.start.toISOString(),
    customers: b.customers.size,
    returningCustomers: [...b.customers].filter(
      (id) => (ordersPerCustomer.get(id) ?? 0) > 1,
    ).length,
  }));
}

export async function getReturningCustomerRateBreakdown(
  range: ResolvedDateRange,
): Promise<{
  current: CustomerActivityInterval[];
  previous: CustomerActivityInterval[];
}> {
  const [current, previous] = await Promise.all([
    computeCustomerActivityByBucket(range.current, range.interval),
    computeCustomerActivityByBucket(range.previous, range.interval),
  ]);
  return { current, previous };
}
