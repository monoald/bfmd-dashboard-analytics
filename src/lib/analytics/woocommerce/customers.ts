import { fetchWc } from "./client";
import type { ResolvedDateRange } from "../types";

interface WcCustomerRow {
  id: number;
  orders_count: number;
}

async function fetchCustomerRows(period: {
  start: Date;
  end: Date;
}): Promise<WcCustomerRow[]> {
  return fetchWc<WcCustomerRow[]>("/wc-analytics/reports/customers", {
    after: period.start.toISOString(),
    before: period.end.toISOString(),
    per_page: "100",
  });
}

function computeReturningRate(rows: WcCustomerRow[]): number {
  if (rows.length === 0) return 0;
  const returning = rows.filter((row) => row.orders_count > 1).length;
  return Math.round((returning / rows.length) * 1000) / 10;
}

export async function getReturningCustomerRate(
  range: ResolvedDateRange,
): Promise<{ current: number; previous: number }> {
  const [currentRows, previousRows] = await Promise.all([
    fetchCustomerRows(range.current),
    fetchCustomerRows(range.previous),
  ]);
  return {
    current: computeReturningRate(currentRows),
    previous: computeReturningRate(previousRows),
  };
}
