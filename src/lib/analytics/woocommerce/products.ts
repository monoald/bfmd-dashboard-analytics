import { fetchWc } from "./client";
import type { NamedValue, ResolvedDateRange } from "../types";

interface WcRevenueProductRow {
  product_id: number;
  extended_info?: { name: string };
  net_revenue: number;
}

export async function getTopProductsByRevenue(
  range: ResolvedDateRange,
): Promise<NamedValue[]> {
  const rows = await fetchWc<WcRevenueProductRow[]>(
    "/wc-analytics/reports/products",
    {
      after: range.current.start.toISOString(),
      before: range.current.end.toISOString(),
      orderby: "net_revenue",
      order: "desc",
      per_page: "10",
      extended_info: "true",
    },
  );

  if (rows.length === 0) return [];

  const productIds = rows.map((row) => row.product_id);
  // Verified against a live store: the WC Analytics API filters by product ID
  // via a comma-separated `products` param (distinct from the core REST
  // API's array-style filters), and `net_revenue` is a flat field on each
  // row, not nested under `subtotals` (unlike the revenue/stats endpoint).
  const previousRows = await fetchWc<WcRevenueProductRow[]>(
    "/wc-analytics/reports/products",
    {
      after: range.previous.start.toISOString(),
      before: range.previous.end.toISOString(),
      products: productIds.join(","),
      per_page: String(productIds.length),
    },
  );

  const previousRevenueByProductId = new Map(
    previousRows.map((row) => [row.product_id, row.net_revenue]),
  );

  return rows.map((row) => ({
    name: row.extended_info?.name ?? "Unknown product",
    value: Math.round(row.net_revenue * 100) / 100,
    previousValue:
      Math.round((previousRevenueByProductId.get(row.product_id) ?? 0) * 100) /
      100,
  }));
}
