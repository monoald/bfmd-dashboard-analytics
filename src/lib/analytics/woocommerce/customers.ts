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
