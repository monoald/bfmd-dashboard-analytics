# Report Detail Pages Design

## Goal

Every card on `/admin/analytics` becomes clickable and navigates to a
dedicated report page for that metric, styled after Shopify's own
individual-report pages, scoped down to what our data and this iteration
actually need.

## Architecture

There are 15 distinct card types (`conversionRate` is a supporting data
point for two cards' headlines, not a standalone card, so it doesn't get
its own report page). One dynamic route handles all 15, driven by a
config lookup rather than 15 separate page files:

- `src/app/admin/analytics/reports/[slug]/page.tsx` — Server Component.
  Reads `slug` from the route and `range` from `?range=`, calls the same
  `getDashboardData(rangeKey)` used by the main dashboard, looks up the
  slug in `REPORT_CONFIG`, and renders the matching shape template with
  the right slice of `DashboardPayload`.
- `src/lib/analytics/report-config.ts` — a `Record<ReportSlug, ReportConfig>`
  mapping each slug to: page title, `CardKey` (for error lookups), and a
  `shape` discriminant (`"line-comparison" | "line-simple" | "donut" |
  "list" | "ranked" | "funnel"`).

Slugs are kebab-case, one per existing `CardKey`:

| Slug | CardKey | Shape |
|---|---|---|
| `gross-sales` | `grossSales` | line-simple |
| `returning-customer-rate` | `returningCustomerRate` | line-simple |
| `orders-fulfilled` | `ordersFulfilled` | line-simple |
| `orders` | `orders` | line-simple |
| `total-sales-over-time` | `salesOverTime` | line-comparison |
| `average-order-value-over-time` | `aovOverTime` | line-comparison |
| `sessions-over-time` | `sessionsOverTime` | line-comparison |
| `conversion-rate-over-time` | `conversionRateOverTime` | line-comparison |
| `total-sales-breakdown` | `salesBreakdown` | list |
| `total-sales-by-sales-channel` | `salesByChannel` | donut |
| `total-sales-by-product` | `salesByProduct` | ranked |
| `sessions-by-device-type` | `sessionsByDevice` | donut |
| `sessions-by-location` | `sessionsByLocation` | ranked |
| `total-sales-by-social-referrer` | `totalSalesBySocialReferrer` | ranked |
| `conversion-rate-breakdown` | `conversionFunnel` | funnel |

`total-sales-by-sales-channel` is included in the config for completeness
but unreachable from the UI while `SHOW_SALES_BY_CHANNEL` is false — same
on-hold treatment as today, just extended to the new route.

## Page header (all shapes)

Reuses existing pieces, no new chrome:

- Back link (BF mark, links to `/admin/analytics` preserving `?range=`)
  + report title as `<h1>`.
- Existing `DashboardDateFilter` and `ThemeToggle`, same as the main
  dashboard header.
- No Shopify-style breadcrumb icon, "Last refreshed" timestamp,
  refresh/info/more icon buttons, currency selector, or Controls panel —
  explicitly out of scope for this round.

## The six shapes

### 1. `line-comparison`

Cards: Total sales / AOV / Sessions / Conversion rate over time.

- Existing `TimeSeriesChart` at `variant="hero"`, with its existing
  headline (reusing the same `computeChange`-derived headline values
  already computed in `page.tsx` today).
- New `TimeSeriesReportTable` component underneath: one row per bucket
  (`date`, current, previous, `computeChange` badge), plus a totals
  footer row (sum of current, sum of previous, overall change).

### 2. `line-simple`

Cards: Gross Sales, Returning Customer Rate, Orders Fulfilled, Orders.

- `TimeSeriesChart` gets a new optional prop `showComparison?: boolean`
  (default `true`). When `false`: no dashed previous-period `Area`, no
  previous-period row in `ChartTooltip`, and the "vs. previous period"
  caption is skipped even in hero variant.
- The KPI tiles only have `sparkline: number[]` (no dates, no previous
  values) — synthesize a `TimeSeriesData[]` with an empty-string `date`
  per point and `previousPeriod: 0` (never read, since `showComparison`
  is `false`), pass `showComparison={false}`.
- No table (no per-bucket labels to show).

### 3. `donut`

Cards: Sessions by device type, Total sales by sales channel.

- Existing `DonutBreakdown`, same size as on the dashboard.

### 4. `list`

Card: Total sales breakdown.

- Existing `RankedList` with `variant="breakdown"`, same as today.

### 5. `ranked`

Cards: Total sales by product, Sessions by location, Total sales by
social referrer.

- Existing `RankedList` (default variant), same as today.

### 6. `funnel`

Card: Conversion rate breakdown.

- Existing `FunnelChart`, same as today.

For shapes 3–6 the page is just the header plus that one card at its
existing size, left-aligned below the header — no extra filler content,
no size scaling.

## Linking from the dashboard

Every card body on `/admin/analytics/page.tsx` (all 15, including the 4
KPI tiles) gets wrapped in a `<Link href="/admin/analytics/reports/<slug>?range=<current>">`.
`CardError` states are NOT wrapped in a link — a card that's currently
erroring has nothing useful to drill into.

## Error handling on the report page

Same pattern as the dashboard: if `data.errors[cardKey]` is set, render
`CardError` full-page instead of the shape template. For the two
conversion-rate report pages, this must also check `errors.conversionRate`
(same fix already applied on the dashboard for the silent-error bug).

## New/modified files

- `src/app/admin/analytics/reports/[slug]/page.tsx` (new)
- `src/lib/analytics/report-config.ts` (new)
- `src/components/analytics/TimeSeriesReportTable.tsx` (new, + test)
- `src/components/analytics/TimeSeriesChart.tsx` (modify: add `showComparison`)
- `src/app/admin/analytics/page.tsx` (modify: wrap cards in `Link`)

## Out of scope for this round

- Controls panel (Metrics/Dimensions/Visualization/Filters), Cohorts tab.
- Per-hour breakdown tables for donut/list/ranked/funnel report types.
- Real WC/GA4 fetcher changes — this feature is presentation-layer only,
  works identically against mock data and (once available) real data.
- Making the 4 KPI-tile report pages' charts richer than their existing
  sparkline data supports.
