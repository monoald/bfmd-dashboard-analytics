import { fetchWc } from "./client";
import type { NamedValue, ResolvedDateRange } from "../types";

interface WcRevenueProductRow {
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

  return rows.map((row) => ({
    name: row.extended_info?.name ?? "Unknown product",
    value: Math.round(row.subtotals.net_revenue * 100) / 100,
  }));
}
