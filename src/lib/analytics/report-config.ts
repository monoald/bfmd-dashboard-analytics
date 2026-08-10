import type { CardKey } from "./types";

export type ReportShape =
  "line-comparison" | "line-simple" | "donut" | "list" | "ranked" | "funnel";

export interface ReportConfig {
  slug: string;
  title: string;
  cardKey: CardKey;
  shape: ReportShape;
}

export const REPORT_CONFIGS: ReportConfig[] = [
  {
    slug: "gross-sales",
    title: "Gross sales",
    cardKey: "grossSales",
    shape: "line-simple",
  },
  {
    slug: "returning-customer-rate",
    title: "Returning customer rate",
    cardKey: "returningCustomerRate",
    shape: "line-simple",
  },
  {
    slug: "orders-fulfilled",
    title: "Orders fulfilled",
    cardKey: "ordersFulfilled",
    shape: "line-simple",
  },
  {
    slug: "orders",
    title: "Orders",
    cardKey: "orders",
    shape: "line-simple",
  },
  {
    slug: "total-sales-over-time",
    title: "Total sales over time",
    cardKey: "salesOverTime",
    shape: "line-comparison",
  },
  {
    slug: "average-order-value-over-time",
    title: "Average order value over time",
    cardKey: "aovOverTime",
    shape: "line-comparison",
  },
  {
    slug: "sessions-over-time",
    title: "Sessions over time",
    cardKey: "sessionsOverTime",
    shape: "line-comparison",
  },
  {
    slug: "conversion-rate-over-time",
    title: "Conversion rate over time",
    cardKey: "conversionRateOverTime",
    shape: "line-comparison",
  },
  {
    slug: "total-sales-breakdown",
    title: "Total sales breakdown",
    cardKey: "salesBreakdown",
    shape: "list",
  },
  {
    slug: "total-sales-by-sales-channel",
    title: "Total sales by sales channel",
    cardKey: "salesByChannel",
    shape: "donut",
  },
  {
    slug: "total-sales-by-product",
    title: "Total sales by product",
    cardKey: "salesByProduct",
    shape: "ranked",
  },
  {
    slug: "sessions-by-device-type",
    title: "Sessions by device type",
    cardKey: "sessionsByDevice",
    shape: "donut",
  },
  {
    slug: "sessions-by-location",
    title: "Sessions by location",
    cardKey: "sessionsByLocation",
    shape: "ranked",
  },
  {
    slug: "total-sales-by-social-referrer",
    title: "Total sales by social referrer",
    cardKey: "totalSalesBySocialReferrer",
    shape: "ranked",
  },
  {
    slug: "conversion-rate-breakdown",
    title: "Conversion rate breakdown",
    cardKey: "conversionFunnel",
    shape: "funnel",
  },
];

export function getReportConfig(slug: string): ReportConfig | undefined {
  return REPORT_CONFIGS.find((config) => config.slug === slug);
}
