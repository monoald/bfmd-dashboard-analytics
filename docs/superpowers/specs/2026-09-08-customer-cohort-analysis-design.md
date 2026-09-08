# Customer Cohort Analysis Design

## Goal

Add "Customer cohort analysis" as a new metric: a monthly retention grid
showing, for each month of first purchase ("cohort"), what percentage of
that cohort's customers placed another order in each subsequent month.

This was explicitly deferred in the original dashboard design
(`2026-08-07-ecommerce-analytics-dashboard-design.md`): *"needs custom
computation from full order history, no direct WC endpoint — separate spec
later."* No cohort code exists anywhere in the codebase today.

## Metric definition

- **Cohort row** = customers grouped by the calendar month of their true
  first-ever order (all-time, not just first order within any displayed
  window).
- **Column** = "Month N" (N = 0, 1, 2, ...), counting time since the
  cohort's first order, not calendar dates. **Month 0 is not the first
  order itself** — it's the same calendar month as the first order, and
  its cell counts customers who placed a *repeat* order within that same
  month (a customer whose only order is their first order contributes to
  the cohort's size but not to Month 0's numerator). Month 1 is the next
  calendar month after the cohort's first-purchase month, and so on.
  (Corrected 2026-09-08 to match Shopify's own cohort model, after
  originally omitting Month 0 on the mistaken assumption it would
  trivially read 100%.)
- **Cell value** = percentage of the cohort's customers who placed
  **at least one qualifying order** in that specific period (Month 0's
  "repeat order in the first month" for index 0, "any order in that
  calendar month" for index N ≥ 1), independent of every other column
  (not cumulative — a customer who ordered in Month 1 but not Month 2
  does not count toward Month 2's cell). This matches the non-monotonic
  pattern in the reference screenshots (e.g. 4.86% → 13.76% → 12.15% →
  9.45% → ...).
- A row has one column for Month 0 plus as many additional columns as
  calendar months have elapsed since that cohort's first-purchase month
  (`retentionByMonth: number[]`, no `null` padding needed) — there is no
  such thing as a "month that hasn't happened yet" to represent, since
  that column doesn't exist in the array at all. Month 0 itself is always
  populated (it's already-completed data by the time a cohort is old
  enough to appear as a row), so every row has at least 2 entries: the
  most-recent visible cohort (last full month) has Month 0 plus 1 more
  column (the current, still-in-progress month), while the oldest visible
  cohort (12 months back) has Month 0 plus up to 12 more.
- **Qualifying order** = an order from `/wc-analytics/reports/orders`
  (WooCommerce's Analytics API order-listing endpoint) with an explicit
  `status_is[]=completed` filter — this endpoint does **not** auto-exclude
  invalid statuses on its own (only the separate `/wc-analytics/reports/revenue/*`
  stats endpoint does that); `status_is[]=completed` is the same filter
  `orders.ts`'s `getOrdersFulfilled` already applies to this same endpoint,
  so cohort analysis defines "qualifying" identically to "Orders Fulfilled"
  rather than guessing a new definition. This still avoids the disabled
  sales-by-channel card's mistake of using the core `/wc/v3/orders`
  endpoint with `status: "any"`.
- **Guest checkouts** (`customer_id: 0`) are excluded entirely — repeat
  purchases can't be attributed to an anonymous customer, so they can
  never form or contribute to a cohort.

## Data window & known limitation

The grid always shows the **last 12 completed cohort months** (rows) —
the 12 calendar months immediately before the current, still-in-progress
month — regardless of the dashboard's date-range picker. Cohort analysis
is inherently about all-time customer behavior, not a comparable
current-vs-previous-period window, so it doesn't fit that picker's model;
changing the date range has no effect on this report. The current
in-progress month is never shown as its own cohort row (Month 0 for that
month would still be forming) — its partial repeat-purchase data does
appear, though, as the newest row's Month 1 column.

To correctly identify a customer's *true* first order (not just their
first order within whatever window is fetched), the data fetch pulls
**24 months** of order history: the 12 visible cohort months, plus a
12-month lookback buffer used only to detect whether a customer active in
month 1 of the visible window actually first ordered earlier than that.

**Known limitation (documented, not fixed):** a customer whose real
first-ever order was more than 24 months ago, who then goes quiet and
returns within the visible 12-month window, will be misclassified as a
new cohort member in the month they return. This is a deliberate, bounded
tradeoff (fixed, predictable API cost) rather than fetching unbounded full
order history. Matches this codebase's existing pattern of documenting
similar approximations (e.g. the returning-customer-rate window-scoping
tension) rather than solving every edge case.

## Data fetching

New file `src/lib/analytics/woocommerce/cohort.ts`:

```ts
export async function getCustomerCohortAnalysis(): Promise<CohortRow[]>
```

- Takes no arguments — it does not depend on the dashboard's date range.
- Fetches all rows from `/wc-analytics/reports/orders` with
  `after` set to the start of the 24-month lookback window, paginated via
  the existing `fetchWcAllPages` (the same primitive that already fixed
  an identical truncation bug for `customers.ts`).
- Extracts `{ customer_id, date_created }` per order, drops rows where
  `customer_id === 0`.
- Groups by `customer_id`, takes each customer's earliest `date_created`
  (truncated to calendar month) as their cohort month.
- Filters to customers whose cohort month falls within the visible
  12-month window (customers who first ordered in the 12-month lookback
  buffer are used only to correctly exclude/attribute later activity —
  they don't produce a visible row themselves unless their cohort month
  is also within the visible 12 months).
- For each visible cohort month and each elapsed relative month N (up to
  however many full/partial calendar months have elapsed since that
  cohort's first month), computes the percentage of that cohort's
  customers with ≥1 qualifying order in that specific calendar month.

The exact field names on `/wc-analytics/reports/orders` (`customer_id`,
`date_created`) are a best-effort assumption pending verification against
the live store — same category of unverified-guess as other WC Analytics
fields already flagged in project history. Flag this for the
live-credentials verification pass before enabling the feature flag.

**Date parsing note:** `date_created` must be parsed the same
regex-based way `format.ts`'s `parseWcIntervalDate` already parses WC
interval date strings — reading the year/month digits directly out of
the string rather than `new Date(dateStr)` — to avoid reinterpreting an
already-site-timezone string in whatever timezone the server process
happens to run in (the exact class of bug already fixed once in
`date-range.ts`, per project memory). A small `wcDateToIsoMonth` helper
will be added to `format.ts` reusing that same parsing logic.

## Types (`src/lib/analytics/types.ts`)

```ts
export interface CohortRow {
  cohortMonth: string;         // ISO month, e.g. "2026-01"
  cohortSize: number;          // customers whose first-ever order was this month
  retentionByMonth: number[];  // index 0 = "Month 0" (repeat orders in the cohort's own first month); length = 1 + months elapsed since cohortMonth
}
```

Add `"customerCohortAnalysis"` to `CardKey`, and
`customerCohortAnalysis: CohortRow[]` to `DashboardPayload["charts"]`
(a plain array, consistent with every other `charts` field — no wrapper
object needed for a single-field shape).

## Report config (`src/lib/analytics/report-config.ts`)

- New flag, same pattern and file location as `SHOW_SALES_BY_CHANNEL`:

  ```ts
  // New, never verified against live order data (full order-history
  // aggregation across a 24-month window). Disabled pending verification
  // against the live store once credentials/testing allow it — same
  // gating pattern as SHOW_SALES_BY_CHANNEL.
  export const SHOW_CUSTOMER_COHORT_ANALYSIS = false;
  ```

- New `ReportShape` member: `"cohort-grid"` (none of the existing six —
  `line-comparison | line-simple | donut | list | ranked | funnel` — fit
  a retention heatmap).
- New `ReportSlug` member: `"customer-cohort-analysis"`.
- New `REPORT_CONFIGS` entry:
  `{ slug: "customer-cohort-analysis", title: "Customer cohort analysis", shape: "cohort-grid" }`.

## Wiring (`src/lib/analytics/actions.ts`)

- New cache binding, using the generic `withCache` (not `withRangeCache`/
  `withFixedCache`, since both of those are typed around a `range`
  argument and this fetcher takes none):

  ```ts
  const cachedCustomerCohortAnalysis = withCache(
    getCustomerCohortAnalysis,
    ["wc-customer-cohort-analysis"],
    21600, // 6h — full order-history aggregation is expensive and this
           // data doesn't meaningfully change minute to minute
  );
  ```

- **Deliberate deviation from the `salesByChannel` precedent:** that
  fetch runs unconditionally even while its flag is off (the flag only
  gates UI visibility). Customer cohort analysis's fetch is **skipped
  entirely while `SHOW_CUSTOMER_COHORT_ANALYSIS` is false** — this
  computation is materially more expensive (24 months of paginated order
  history vs. one bounded-range request), so there's no reason to pay for
  it while the feature is dark. When skipped, `raw.customerCohortAnalysis`
  is set to `[]` rather than being fetched.

## Normalization (`src/lib/analytics/normalize.ts`)

`RawPipelineResults` gains `customerCohortAnalysis: CohortRow[] | Error`.
`buildDashboardPayload` unwraps it into `charts.customerCohortAnalysis`
the same way every other chart field is unwrapped, with an empty `[]`
fallback on error.

## Mock data (`src/lib/analytics/mock-data.ts`)

`buildMockDashboardPayload` gains synthetic cohort data shaped like the
reference screenshots (12 rows, declining cohort sizes further back,
non-monotonic per-cohort retention curves, later cohorts having fewer
populated columns) so the no-credentials path and UI development don't
need a live store.

## UI

- New component `src/components/analytics/CustomerCohortTable.tsx`:
  the full heatmap grid — cohort month rows, "Month N" columns, cell
  background intensity scaled to value within the visible data range,
  hover tooltip showing "Month N · `<cohort>` cohort" + a short
  description + the value, matching the interaction shown in the
  reference screenshots. Cells with a `null` value render blank (no
  tooltip, no color).
- Dashboard home page (`src/app/(with-sidebar)/page.tsx`): a condensed
  preview variant of the same component (fewer rows/columns, no
  tooltips) inside a card linking to `/reports/customer-cohort-analysis`,
  gated behind `SHOW_CUSTOMER_COHORT_ANALYSIS` exactly like the
  sales-by-channel card is gated today.
- Report detail page (`src/app/reports/[slug]/page.tsx`): new
  `renderReport` case for the `cohort-grid` shape rendering the full
  `CustomerCohortTable`, also gated — reaching the slug directly while
  the flag is off shows the same "temporarily disabled" `CardError`
  message the sales-by-channel report page shows today.

## New/modified files

- `src/lib/analytics/woocommerce/cohort.ts` (new)
- `src/lib/analytics/types.ts` (modify: `CohortRow`, `CustomerCohortAnalysis`, `CardKey`, `DashboardPayload`)
- `src/lib/analytics/report-config.ts` (modify: flag, shape, slug, config entry)
- `src/lib/analytics/actions.ts` (modify: cache binding, flag-gated fetch, `RawPipelineResults` field)
- `src/lib/analytics/normalize.ts` (modify: unwrap into `charts.customerCohortAnalysis`)
- `src/lib/analytics/mock-data.ts` (modify: synthetic cohort rows)
- `src/components/analytics/CustomerCohortTable.tsx` (new, + test) with a preview variant
- `src/app/(with-sidebar)/page.tsx` (modify: flag-gated home page card)
- `src/app/reports/[slug]/page.tsx` (modify: new `cohort-grid` case, flag-gated)

## Out of scope

- Any change to the dashboard's date-range picker or its interaction
  with this report (this report ignores it entirely).
- Solving the >24-month misclassification edge case (documented
  limitation, not fixed).
- Real WC field-name verification against the live store — flagged for
  the same live-credentials verification pass every other new WC
  computation in this project has gone through (see project memory:
  `pending_credentials_verification.md`). `SHOW_CUSTOMER_COHORT_ANALYSIS`
  stays `false` until that verification happens.
- Any change to existing reports/cards.
