import { fetchWc } from "./client";
import type {
  NamedValue,
  ResolvedDateRange,
  SalesByProductBreakdownRow,
} from "../types";

interface WcRevenueProductRow {
  product_id: number;
  extended_info?: { name: string };
  net_revenue: number;
  items_sold?: number;
}

interface WcCoreProductRow {
  id: number;
  type: string;
}

// Single-vendor store: WooCommerce's brands taxonomy is unused here
// (verified live — /wc/v3/products/brands returns zero brands), so every
// product is attributed to the store itself, matching what this store's own
// Shopify report shows ("Black Forest" for every row).
const STORE_VENDOR_NAME = "Black Forest Supplements";

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  simple: "Simple",
  variable: "Variable",
  grouped: "Grouped",
  external: "External",
};

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

// Deliberately a separate fetch from getTopProductsByRevenue above (not a
// shared/refactored call) so the main dashboard's product bar chart doesn't
// pick up this function's extra product-type lookup cost.
export async function getSalesByProductBreakdown(
  range: ResolvedDateRange,
): Promise<SalesByProductBreakdownRow[]> {
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

  const [previousRows, coreProducts] = await Promise.all([
    fetchWc<WcRevenueProductRow[]>("/wc-analytics/reports/products", {
      after: range.previous.start.toISOString(),
      before: range.previous.end.toISOString(),
      products: productIds.join(","),
      per_page: String(productIds.length),
    }),
    // `type` (simple/variable/grouped/external) isn't on the Analytics
    // products report at all (verified live) — only the core REST API has
    // it. `include` takes a comma-separated ID list, so this is one call
    // for all of them rather than one per product.
    fetchWc<WcCoreProductRow[]>("/wc/v3/products", {
      include: productIds.join(","),
      per_page: String(productIds.length),
    }),
  ]);

  const previousByProductId = new Map(
    previousRows.map((row) => [row.product_id, row]),
  );
  const typeByProductId = new Map(
    coreProducts.map((product) => [product.id, product.type]),
  );

  return rows.map((row) => {
    const previous = previousByProductId.get(row.product_id);
    return {
      productId: row.product_id,
      productTitle: row.extended_info?.name ?? "Unknown product",
      productVendor: STORE_VENDOR_NAME,
      productType:
        PRODUCT_TYPE_LABELS[typeByProductId.get(row.product_id) ?? ""] ??
        "Unknown",
      netItemsSold: {
        current: row.items_sold ?? 0,
        previous: previous?.items_sold ?? 0,
      },
      grossSales: null,
      discounts: null,
      salesReversals: null,
      netSales: {
        current: Math.round(row.net_revenue * 100) / 100,
        previous: Math.round((previous?.net_revenue ?? 0) * 100) / 100,
      },
      taxes: null,
      totalSales: null,
    };
  });
}
