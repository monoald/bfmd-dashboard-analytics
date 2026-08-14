# Live View Design

## Goal

Add a "Live View" page to the analytics dashboard, modeled on the
Shopify-style live-view reference screenshot: a real-time visitor counter
plus a set of "since midnight, still filling in" panels (sales, orders,
funnel, location, customers, top products) that update automatically
without a manual refresh.

## Scope confirmed with the user

- The animated 3D globe with pulsing visitor dots from the reference
  screenshot is **deferred**. v1 uses the existing `RankedList`
  bar-list style (already used for Sessions by Location on the main
  dashboard) in its place.
- "Active carts / Checking out / Purchased" are **cumulative counts since
  midnight** (how many sessions reached each funnel step today so far),
  not an attempt to show currently-in-progress cart/checkout state. GA4
  has no queryable "carts open right now" metric — that's Shopify's own
  checkout infrastructure in the reference screenshot, which WooCommerce
  + GA4 can't replicate the same way.
- Refresh cadence: **Visitors right now** polls every ~15s; every other
  panel refreshes every ~60s.
- New route at `/admin/analytics/live`, reached via a new link placed
  next to the date-range chips on the main dashboard
  (`DashboardDateFilter`).
- The "yesterday" comparison is the **complete** previous day (not a
  same-clock-time slice) — today's numbers are expected to trail
  yesterday's completed total for most of the day and converge near
  midnight. This is intentional, matching how the reference screenshot's
  own trend badges read.
- This page always shows "today" — no date-range picker, no browsing
  past days here (that's what the main dashboard is for).

## Architecture

The page is a Server Component at `src/app/admin/analytics/live/page.tsx`,
following the exact same pattern as the existing `/admin/analytics` page:
resolve a range, fetch everything server-side, render. Two small Client
Components layer live refresh on top without turning the page itself into
a client-rendered app:

- `LiveVisitorsTile` — holds just the live visitor count in local state,
  seeded from the server-rendered initial value, refetching every ~15s via
  a server action.
- `LiveViewAutoRefresh` — a no-UI component that calls Next's
  `router.refresh()` every ~60s, which re-runs the whole server component.
  This reuses the same data-fetching and caching (`withRangeCache`) the
  main dashboard already relies on for "today" data — no new caching
  layer, no new route handlers for the non-live panels.

This was chosen over two alternatives: a fully client-rendered page
(throws away this app's established Server Component pattern, needs a
loading skeleton), and a generic "auto-refreshing region" abstraction
wrapping arbitrary content at configurable intervals (more reusable in
principle, but this app has only one use case for it so far — the
generality would be speculative).

## Date range: no new resolver needed

The existing `resolveDateRange("today", new Date())` already produces
exactly what this page needs, unchanged:

- `previous` already resolves to the complete previous calendar day
  (midnight to midnight) — matching the confirmed "yesterday = complete
  day" comparison basis.
- `current` already resolves to midnight-today through **end of day
  today** (23:59:59.999), not "up to now." Leaving this as end-of-day is
  what makes the hourly sparkline charts visually "fill in" over the
  course of the day: bucket generation (fixed as part of the GA4
  week-bucketing correctness work) walks the full current-period span and
  allocates a slot for every hour in it, including hours that haven't
  happened yet. Those future hours simply have no real data to report
  yet and land at 0 — which reads as "not filled in yet." Using `now` as
  the cutoff instead would stop the walk at the current hour and the
  chart would never visually show its own future emptiness.

No new `DateRangeKey` value, no new period-resolution function. This page
constructs its `ResolvedDateRange` via the plain existing "today" preset.

## Panels and data sources

All eight panels use `range = resolveDateRange("today", new Date())`.

| Panel | Data source | Status |
|---|---|---|
| Visitors right now | GA4 Realtime API, `activeUsers` metric | New |
| Total sales | `getRevenueStats(range).totals.totalSales` | Existing — uses WooCommerce's `total_sales` field specifically, not `gross_sales` (they differ by discounts/refunds/shipping/tax; this panel's literal label is "Total sales") |
| Sessions | Total session count for today | Existing building block, currently inlined as the "Sessions" step of `fetchFunnelCounts` in `funnel.ts` — exposed as its own small function rather than duplicating the query |
| Orders | `getRevenueStats(range).totals.ordersCount` | Existing, same field the main dashboard already uses |
| Customer behavior (Active carts / Checking out / Purchased) | `getConversionFunnel(range)`, using its "Added to cart" / "Reached checkout" / "Completed checkout" steps (its "Sessions" step is skipped here since Sessions is already its own standalone tile) | Existing fetcher, relabeled for this page's copy |
| Sessions by location | `getSessionsByLocation(range)` | Existing fetcher + existing `RankedList` component |
| New vs returning customers | Same lifetime-based logic as `getReturningCustomerRate` (`fetchActiveCustomerIds` + `fetchCustomersWithPriorOrders`), exposing raw counts (`new`, `returning`) instead of a percentage | Existing logic, extracted into a shared helper and reused by both this and the existing percentage-returning function |
| Total sales by product | `getTopProductsByRevenue(range)` | Existing fetcher + existing `RankedList` component |

Sparklines: each headline number (Total sales, Sessions, Orders) gets a
small trend line using the existing `Sparkline` component, fed by the
same hourly (`interval: "hour"`) series these fetchers already produce
for today, current period only (24 slots, trailing off to 0 for hours
that haven't happened yet, per the date-range section above).

## Live visitor count (new GA4 integration)

- `runGa4RealtimeReport` — a new low-level function in `ga4/client.ts`,
  parallel to the existing `runGa4Report`, using the GA4 Data API SDK's
  separate `runRealtimeReport` method. Queries the `activeUsers` metric
  with no dimensions for a plain total.
- `getLiveVisitorCount(): Promise<number>` — a new domain function in a
  new `ga4/realtime.ts`, built on top of `runGa4RealtimeReport`, following
  the same low-level/domain-function split already used for
  `sessions.ts`/`funnel.ts`/`referrers.ts` over `runGa4Report`.
- GA4's "realtime" `activeUsers` reflects users active in roughly the
  last 30 minutes, refreshed near-continuously — not literally
  instantaneous. This is the standard, achievable meaning of "live
  visitors" for this kind of dashboard (this is also how the reference
  screenshot's own live view works under the hood).

Wiring to the client poll:

- `getLiveVisitorCount()` is called directly during the page's initial
  server render, so `LiveVisitorsTile` shows a real number on first paint
  — no flash of "0" while waiting for the first client-side poll.
- A thin `"use server"` wrapper, colocated in `actions.ts` next to
  `getDashboardData`, is what `LiveVisitorsTile`'s ~15s polling loop
  actually calls from the client.

## Error handling

A new `LiveViewPayload` type, matching `DashboardPayload`'s existing
shape convention (`{ summaryCards, charts, errors }`), scoped to this
page's 8 panels. A new `buildLiveViewPayload` function mirrors
`normalize.ts`'s existing per-fetcher error-isolation pattern (`unwrap`
per key) — one panel failing doesn't take down the rest of the page, and
each failed panel renders the existing `CardError` component in its
place, exactly as the main dashboard already does.

The live-visitor tile is the one exception: if a single ~15s poll fails
(a transient GA4 hiccup), it just keeps showing its last known count and
quietly retries next tick, rather than surfacing an error for a value
that self-corrects within 15 seconds.

## Testing

- New pure/fetcher logic (`runGa4RealtimeReport`, `getLiveVisitorCount`,
  the returning-customers-as-counts extraction, `buildLiveViewPayload`) —
  unit tested the same way everything else in `src/lib/analytics`
  already is, mocking the GA4/WC clients.
- `LiveVisitorsTile`, `LiveViewAutoRefresh`, and the page itself —
  Playwright-verified, not unit tested, matching this codebase's existing
  precedent for interactive client components (`ThemeToggle`,
  `DashboardDateFilter`, `CustomDateRangePicker` all follow this same
  pattern).

## Where this plugs in

- New: `src/app/admin/analytics/live/page.tsx`
- New: `src/components/analytics/LiveVisitorsTile.tsx`
- New: `src/components/analytics/LiveViewAutoRefresh.tsx`
- New: `src/lib/analytics/ga4/realtime.ts`
- Modify: `src/lib/analytics/ga4/client.ts` (add `runGa4RealtimeReport`)
- Modify: `src/lib/analytics/ga4/funnel.ts` (expose the "total sessions"
  building block as its own function)
- Modify: `src/lib/analytics/woocommerce/customers.ts` (extract the
  shared active/prior-orders helper, add a counts-returning variant)
- Modify: `src/lib/analytics/actions.ts` (add the `"use server"` wrapper
  for the live visitor poll)
- New: `src/lib/analytics/live-normalize.ts` — houses
  `LiveViewPayload`/`buildLiveViewPayload`, kept separate from the main
  dashboard's `normalize.ts` since the panel set and shapes differ
- Modify: `src/components/analytics/DashboardDateFilter.tsx` (add the
  "Live View" link)

## Out of scope

- The animated 3D globe / 2D map.
- Approximating "currently open carts" as a live in-progress state.
- Any broader navigation/menu system beyond the one link from the main
  dashboard.
- A date-range picker on this page — it always shows today.
