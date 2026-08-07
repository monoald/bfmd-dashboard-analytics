# Headless E-commerce Analytics Dashboard — Design

Status: Approved (Pass 1 scope)
Date: 2026-08-07

## Goal

Replicate Shopify's Analytics Overview (Sessions dashboard + Sales dashboard,
combined) as a single internal dashboard page backed by WooCommerce (revenue
source of truth) and Google Analytics 4 (traffic/attribution source of truth).
The ShopifyQL-style Freeform/Cohorts query-builder panel is explicitly not
being replicated — this app ships a fixed set of pre-built report cards, not
an ad-hoc query tool.

## Scope

### Pass 1 (this spec)

One Server Component page, `/app/admin/analytics/page.tsx`, no auth gate.

**Summary row** (each a `SummaryMetricCard`: value, % change vs. previous
period, trend arrow, sparkline):
- Gross sales
- Returning customer rate
- Orders fulfilled
- Orders
- Conversion rate

**Chart/list sections**, in this order:
1. Sessions over time (dual-line: solid = current period, dotted = previous)
2. Conversion rate over time (dual-line)
3. Conversion rate breakdown (funnel: Sessions → Added to cart → Reached
   checkout → Completed checkout)
4. Sessions by device type (donut: mobile/desktop/tablet/other)
5. Sessions by location (ranked list: country/region/city)
6. Total sales by social referrer (ranked list — youtube/facebook/instagram/
   etc., revenue sourced from GA4, see "Revenue attribution" below)
7. Total sales over time (dual-line)
8. Total sales breakdown (ranked list: gross, discounts, sales reversals,
   net sales, shipping, taxes, total)
9. Total sales by sales channel (donut)
10. AOV over time (dual-line)
11. Total sales by product (ranked list, top N by revenue)

### Explicitly deferred (not this pass)

- Customer cohort analysis (monthly retention grid) — needs custom
  computation from full order history, no direct WC endpoint. Separate spec
  later.
- Performance by referring channel (custom affiliate links, e.g.
  `affiliate-arielle-scarcella`) — data source unknown (likely a WooCommerce
  affiliate plugin not yet identified). Needs investigation before it can be
  designed.
- Standalone full-page drill-down reports (e.g. "Sessions by social
  referrer" as its own page, "Sessions by landing page", "Total sales by
  referrer" as a general non-social breakdown) — pass 2, reusing this pass's
  data layer.
- Total sales by POS location — no POS in this WooCommerce setup.
- Freeform/Cohorts query-builder controls panel (ShopifyQL equivalent).

## Environment & Authentication

```
# WooCommerce (Read-Only Keys)
WC_CONSUMER_KEY=ck_your_key_here
WC_CONSUMER_SECRET=cs_your_secret_here
WC_STORE_URL=https://your-wordpress-backend.com

# Google Analytics 4 API (Service Account)
GA4_PROPERTY_ID=123456789
GA4_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GA4_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

- Real credentials will be provided and used directly (no mock-data layer).
- `.env.local` holds real values (gitignored); `.env.example` is committed
  with placeholders.
- GA4 access via the `@google-analytics/data` SDK (`BetaAnalyticsDataClient`).
- WooCommerce access via native `fetch`, for compatibility with Next.js
  fetch-based caching.

## Data Layer

`lib/analytics/` houses two isolated pipelines behind a shared normalization
layer. Components never see raw WC/GA4 response shapes — only the types
below.

### Deviation from the original spec: WooCommerce Analytics REST API

The original spec referenced the legacy `/wc/v3/reports/*` endpoints. Those
are too thin for this dashboard — no interval-bucketed revenue, no
revenue-by-product. WooCommerce ships a richer **Analytics REST API**
(`/wc-analytics/reports/*`, part of WooCommerce Admin, bundled since WC
4.0+) that supports `interval`, `after`/`before`, and per-entity breakdowns
natively, and is what powers WooCommerce's own analytics dashboard. Pipeline
A uses this instead.

### Card → source mapping

| Card | Source | Endpoint / query |
|---|---|---|
| Gross sales, Total sales over time/breakdown, AOV over time, Orders | WC | `/wc-analytics/reports/revenue/stats` (interval-bucketed: gross/net revenue, orders_count, avg_order_value, refunds, shipping, taxes) |
| Orders fulfilled | WC | `/wc-analytics/reports/orders`, filtered `status=completed` |
| Total sales by product | WC | `/wc-analytics/reports/revenue/products` |
| Returning customer rate | WC | `/wc-analytics/reports/customers` |
| Total sales by sales channel | WC | Raw `/wc/v3/orders`, aggregated by `created_via` (Analytics API doesn't expose this field — heavier query, cached hardest) |
| Sessions over time / by device / by location | GA4 | `runReport`: dimensions `date` / `deviceCategory` / `region`+`city`, metric `sessions` |
| Conversion rate over time/breakdown, and the summary row's Conversion rate card | GA4 | `runReport` per funnel step, dimension `eventName` filtered to `add_to_cart` / `begin_checkout` / `purchase`, metric `sessions`. Summary card = completed-checkout step ÷ sessions, from the same funnel query. |
| Total sales by social referrer | GA4 | `runReport`: dimension `sessionSourceMedium` (filtered `medium=social`), metric `purchaseRevenue` |

### Revenue attribution rule

WooCommerce is the source of truth for every revenue figure **except**
referrer/channel-attributed revenue cards (currently just "Total sales by
social referrer"), which source their dollar figure from GA4's
`purchaseRevenue` — because WooCommerce has no session/referrer data to
attribute revenue to. These two revenue numbers (WC total vs. GA4
attributed) are not expected to reconcile exactly; that's a known,
accepted tradeoff, not a bug.

### `created_via` caveat (sales-by-channel card)

WooCommerce doesn't have Shopify's multi-channel concept (POS/Buy
Button/etc.) out of the box. This card buckets by the order's `created_via`
meta (`checkout`, `admin`, `rest-api`, `subscription`). For a single-channel
store this card will correctly show "Online Store: 100%" — that's expected,
not a bug.

### Normalized types

```typescript
interface TimeSeriesData {
  date: string; // e.g., "12 AM", "Aug 7"
  currentPeriod: number;
  previousPeriod: number;
}

interface DashboardPayload {
  summaryCards: {
    grossSales: { value: number; changePercentage: number; trend: "up" | "down" };
    conversionRate: { value: number; changePercentage: number; trend: "up" | "down" };
    ordersFulfilled: { value: number; changePercentage: number; trend: "up" | "down" };
    orders: { value: number; changePercentage: number; trend: "up" | "down" };
    returningCustomerRate: { value: number; changePercentage: number; trend: "up" | "down" };
  };
  charts: {
    sessionsOverTime: TimeSeriesData[];
    conversionRateOverTime: TimeSeriesData[];
    conversionFunnel: { step: string; sessions: number; percentage: number }[];
    sessionsByDevice: { name: string; value: number }[];
    sessionsByLocation: { name: string; value: number }[];
    totalSalesBySocialReferrer: { name: string; value: number }[];
    salesOverTime: TimeSeriesData[];
    salesBreakdown: { label: string; value: number }[];
    salesByChannel: { name: string; value: number }[];
    aovOverTime: TimeSeriesData[];
    salesByProduct: { name: string; value: number }[];
  };
}
```

### Previous-period definition

"Previous period" = the immediately preceding period of equal length,
computed once in `normalize.ts` so every card uses identical date math
(e.g. "Last 7 Days" → previous 7 days immediately prior; "Today" →
yesterday).

## Component Architecture

- `/app/admin/analytics/page.tsx` — Server Component. Reads `searchParams`
  for the date-range filter (`?range=today|7d|30d`), calls a single Server
  Action, passes the resulting `DashboardPayload` down. One fetch per page
  load, not one per card, so the whole page reflects a single consistent
  "as of" timestamp.
- `components/analytics/DashboardDateFilter.tsx` (Client) — updates
  `?range=` URL search param; no local-only state, page stays
  shareable/bookmarkable.
- Reusable card components, each used by multiple sections (no one-off
  component per card):
  - `SummaryMetricCard` — title, value, % change, trend arrow, `Sparkline`.
  - `TimeSeriesChart` — Recharts dual-line (solid current / dotted
    previous); reused for sessions, conversion rate, sales, and AOV over
    time.
  - `FunnelChart` — conversion rate breakdown.
  - `DonutBreakdown` — sessions by device, sales by channel.
  - `RankedList` — sessions by location, total sales by social referrer,
    sales breakdown, sales by product.
- shadcn/ui for layout primitives (`Card`, `Table`), Recharts for all
  charts, `next/font` for Inter.

### Styling

- Tailwind CSS.
- Background: `#F6F6F7`.
- Cards: `bg-white rounded-xl shadow-sm border border-gray-200`.
- Values: `text-2xl font-semibold`.
- Font: Inter (via `next/font`).

## Caching & Error Handling

- Every WC-Analytics and GA4 fetcher wrapped in `unstable_cache`, cache key
  includes the resolved date range.
- Revalidate: 300s for "Today", 3600s for "Last 7/30 Days".
- The `created_via` sales-by-channel aggregation (heaviest query — raw
  order pagination) gets its own longer TTL regardless of range, since it's
  the most expensive call.
- Pipelines are isolated: if WC or GA4 fails, only the affected cards show
  an inline error state. A GA4 outage doesn't take down WooCommerce-sourced
  cards, and vice versa.

## Out of scope for this spec (tracked separately)

- Customer cohort analysis
- Performance by referring channel (affiliate attribution)
- Standalone per-report drill-down pages
- Auth/access control on `/admin/analytics`
- POS-related reporting
