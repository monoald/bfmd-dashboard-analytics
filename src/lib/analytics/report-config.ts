export type ReportShape =
  "line-comparison" | "line-simple" | "donut" | "list" | "ranked" | "funnel";

export type ReportSlug =
  | "gross-sales"
  | "returning-customer-rate"
  | "orders-fulfilled"
  | "orders"
  | "total-sales-over-time"
  | "average-order-value-over-time"
  | "sessions-over-time"
  | "conversion-rate-over-time"
  | "total-sales-breakdown"
  | "total-sales-by-sales-channel"
  | "total-sales-by-product"
  | "sessions-by-device-type"
  | "sessions-by-location"
  | "total-sales-by-social-referrer"
  | "conversion-rate-breakdown";

export interface ReportConfig {
  slug: ReportSlug;
  title: string;
  shape: ReportShape;
}

export const REPORT_CONFIGS: ReportConfig[] = [
  {
    slug: "gross-sales",
    title: "Gross sales",
    shape: "line-simple",
  },
  {
    slug: "returning-customer-rate",
    title: "Returning customer rate",
    shape: "line-simple",
  },
  {
    slug: "orders-fulfilled",
    title: "Orders fulfilled",
    shape: "line-simple",
  },
  {
    slug: "orders",
    title: "Orders",
    shape: "line-simple",
  },
  {
    slug: "total-sales-over-time",
    title: "Total sales over time",
    shape: "line-comparison",
  },
  {
    slug: "average-order-value-over-time",
    title: "Average order value over time",
    shape: "line-comparison",
  },
  {
    slug: "sessions-over-time",
    title: "Sessions over time",
    shape: "line-comparison",
  },
  {
    slug: "conversion-rate-over-time",
    title: "Conversion rate over time",
    shape: "line-comparison",
  },
  {
    slug: "total-sales-breakdown",
    title: "Total sales breakdown",
    shape: "list",
  },
  {
    slug: "total-sales-by-sales-channel",
    title: "Total sales by sales channel",
    shape: "donut",
  },
  {
    slug: "total-sales-by-product",
    title: "Total sales by product",
    shape: "ranked",
  },
  {
    slug: "sessions-by-device-type",
    title: "Sessions by device type",
    shape: "donut",
  },
  {
    slug: "sessions-by-location",
    title: "Sessions by location",
    shape: "ranked",
  },
  {
    slug: "total-sales-by-social-referrer",
    title: "Total sales by social referrer",
    shape: "ranked",
  },
  {
    slug: "conversion-rate-breakdown",
    title: "Conversion rate breakdown",
    shape: "funnel",
  },
];

export function getReportConfig(slug: string): ReportConfig | undefined {
  return REPORT_CONFIGS.find((config) => config.slug === slug);
}
