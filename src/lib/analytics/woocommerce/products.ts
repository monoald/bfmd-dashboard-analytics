import { fetchWc } from "./client";
import type { NamedValue, ResolvedDateRange } from "../types";

interface WcRevenueProductRow {
  product_id: number;
  extended_info?: { name: string };
  subtotals: { net_revenue: number };
}

export async function getTopProductsByRevenue(
  range: ResolvedDateRange,
): Promise<NamedValue[]> {
  const rows = await fetchWc<WcRevenueProductRow[]>(
    "/wc-analytics/reports/revenue/products",
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
  // The WC Analytics API filters by product ID via a comma-separated `products`
  // param (distinct from the core REST API's array-style filters) — verify
  // against a live store once real credentials are available.
  const previousRows = await fetchWc<WcRevenueProductRow[]>(
    "/wc-analytics/reports/revenue/products",
    {
      after: range.previous.start.toISOString(),
      before: range.previous.end.toISOString(),
      products: productIds.join(","),
      per_page: String(productIds.length),
    },
  );

  const previousRevenueByProductId = new Map(
    previousRows.map((row) => [row.product_id, row.subtotals.net_revenue]),
  );

  return rows.map((row) => ({
    name: row.extended_info?.name ?? "Unknown product",
    value: Math.round(row.subtotals.net_revenue * 100) / 100,
    previousValue:
      Math.round((previousRevenueByProductId.get(row.product_id) ?? 0) * 100) /
      100,
  }));
}
