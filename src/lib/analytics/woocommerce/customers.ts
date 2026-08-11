import { fetchWc } from "./client";
import type { PeriodBounds, ResolvedDateRange } from "../types";

interface WcCustomerRow {
  id: number;
}

interface WcCustomerOrdersCountRow {
  id: number;
  orders_count: number;
}

// Verified against a live store: this report's after/before params filter
// customers by activity within the period (matching how WooCommerce's own
// "Returning customers" report is computed), not by account registration
// date.
async function fetchActiveCustomerIds(period: PeriodBounds): Promise<number[]> {
  const rows = await fetchWc<WcCustomerRow[]>(
    "/wc-analytics/reports/customers",
    {
      after: period.start.toISOString(),
      before: period.end.toISOString(),
      per_page: "100",
    },
  );
  return rows.map((row) => row.id);
}

// "Returning" is defined as lifetime: this customer had already placed at
// least one order before the period started, however long ago. Verified
// against a live store: the customers report accepts a comma-separated
// `customers` ID filter (same pattern as the products report's `products`
// filter) and an unbounded `after`, so this makes exactly one extra request
// per period regardless of how many active customers it covers, rather than
// one request per customer.
async function fetchCustomersWithPriorOrders(
  customerIds: number[],
  periodStart: Date,
): Promise<Set<number>> {
  if (customerIds.length === 0) return new Set();
  const rows = await fetchWc<WcCustomerOrdersCountRow[]>(
    "/wc-analytics/reports/customers",
    {
      customers: customerIds.join(","),
      after: "2000-01-01T00:00:00",
      before: new Date(periodStart.getTime() - 1).toISOString(),
      per_page: String(customerIds.length),
    },
  );
  return new Set(
    rows.filter((row) => row.orders_count > 0).map((row) => row.id),
  );
}

async function computeReturningRate(period: PeriodBounds): Promise<number> {
  const activeIds = await fetchActiveCustomerIds(period);
  if (activeIds.length === 0) return 0;
  const returningIds = await fetchCustomersWithPriorOrders(
    activeIds,
    period.start,
  );
  return Math.round((returningIds.size / activeIds.length) * 1000) / 10;
}

export async function getReturningCustomerRate(
  range: ResolvedDateRange,
): Promise<{ current: number; previous: number }> {
  // Sequential, not Promise.all: each computeReturningRate call itself
  // issues 2 sequential fetchWc calls (active customers, then their prior
  // order history) — racing current against previous would reorder results
  // when a test's mocked call queue is shared (see funnel.ts's identical
  // note on fetchFunnelCounts).
  const current = await computeReturningRate(range.current);
  const previous = await computeReturningRate(range.previous);
  return { current, previous };
}
