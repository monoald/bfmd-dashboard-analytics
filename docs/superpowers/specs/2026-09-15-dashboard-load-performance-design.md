# Dashboard Load Performance Design

## Goal

Reduce how slow the dashboard feels on a cold load — reported as
"feels like it takes forever," especially after not opening the app for
several days. The app runs local-dev-only (`npm run dev`), so a cold load
combines two effects: Next.js dev-mode on-demand route compilation, and a
fully-expired data cache (every `unstable_cache` revalidate window in this
codebase — 5 min to 6 h — is far shorter than "days," so a cold fetch
against live WooCommerce/GA4 APIs is unavoidable on return). This spec
addresses the data-fetching side: making the cold fetch itself faster, and
making the page stop waiting on its single slowest metric before showing
anything.

Two causes were confirmed by reading the current code:

1. `fetchWcAllPages` (`src/lib/analytics/woocommerce/client.ts`) fetches
   pages **sequentially**, one full round trip at a time. It's used by
   `getCustomerCohortAnalysis` (24 months of order history, explicitly
   flagged in its own comment as expensive) and by
   `customers.ts`'s `computeCustomerSplit` (returning-customer-rate
   calculations). A busy store's 24-month order history can span dozens of
   pages; at one sequential round trip each, this alone can dominate total
   load time.
2. `getDashboardData` (`src/lib/analytics/actions.ts`) bundles all ~11
   dashboard metrics, including cohort analysis, into one `Promise.all`
   that the page (dashboard and report pages alike) awaits in full before
   rendering any card — see `src/app/(with-sidebar)/page.tsx`'s
   `DashboardContent` and `src/app/reports/[slug]/page.tsx`'s
   `ReportContent`, both added in the loading-states work this spec
   follows. One slow metric holds the whole page hostage even though most
   other cards would be ready much sooner.

Cohort analysis is the clearest target for both fixes: it's already the
most expensive single fetch (24-month paginated scan), and it's already
architecturally separate — `getCustomerCohortAnalysis(now: Date)` takes no
range argument and is cached independently (6 h) from everything else,
because (per its own code comment) it always scans a fixed
24-month-trailing-from-now window **regardless of the dashboard's selected
date range**.

Not in scope: switching from `npm run dev` to a production build. That's a
real, free lever (dev-mode compiles routes on demand; a production build
doesn't) but it's a workflow choice for the user to make, not a code
change — noted here for the record, not planned as an implementation step.

## 1. Bounded-concurrency page fetching

`fetchWcAllPages` changes from a strictly sequential loop to: fetch page 1
first (this yields both its rows and the `X-WP-TotalPages` count), then
fetch the remaining pages in parallel, capped at a concurrency limit,
using a small dependency-free worker-pool helper — no new npm package.

```ts
const DEFAULT_PAGE_CONCURRENCY = 5;

async function mapWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await fn(items[currentIndex]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

export async function fetchWcAllPages<T>(
  path: string,
  params: Record<string, string> = {},
  pageSize = 100,
): Promise<T[]> {
  const firstPage = await wcRequest(path, {
    ...params,
    per_page: String(pageSize),
    page: "1",
  });
  const firstRows = (await firstPage.json()) as T[];
  const totalPages = Number(firstPage.headers.get("X-WP-TotalPages") ?? "1");

  if (totalPages <= 1 || firstRows.length === 0) return firstRows;

  const remainingPages = await mapWithConcurrencyLimit(
    Array.from({ length: totalPages - 1 }, (_, i) => i + 2),
    DEFAULT_PAGE_CONCURRENCY,
    async (page) => {
      const response = await wcRequest(path, {
        ...params,
        per_page: String(pageSize),
        page: String(page),
      });
      return (await response.json()) as T[];
    },
  );

  const allPages = [firstRows, ...remainingPages];
  const firstEmptyIndex = allPages.findIndex((rows) => rows.length === 0);
  const kept = firstEmptyIndex === -1 ? allPages : allPages.slice(0, firstEmptyIndex);
  return kept.flat();
}
```

**Why the concurrency cap, not a plain `Promise.all` across every page:**
this hits a single WordPress/PHP-FPM backend, which commonly caps
concurrent PHP workers. Firing 20+ simultaneous requests risks
queuing/timeouts on the WC side and could net out slower than sequential,
not faster — a bounded worker pool (5 concurrent, tunable) gets most of
the parallelism benefit without that risk.

**Why truncate at the first empty page after the fact:** the current
sequential implementation deliberately stops as soon as a page comes back
empty, even if `X-WP-TotalPages` claims more remain — there's a dedicated
existing test for this defensive behavior (a real WC quirk was hit live).
Once page-fetching is parallelized we can't stop early mid-flight, so we
reproduce the same *result* by discarding every page from the first empty
one onward once all pages are back. Trade-off: in that rare case, a few
now-discarded pages get fetched (and their requests spent) that the old
code would have skipped — acceptable, since that path is the rare
defensive one, not the common case being optimized.

**Test impact:** `client.test.ts`'s three `fetchWcAllPages` tests need
updating — results/ordering/truncation-on-empty-page assertions stay
correct, but call-count assertions change since pages are now fetched
eagerly rather than stopping immediately on an empty page. Add a new test
asserting concurrency never exceeds `DEFAULT_PAGE_CONCURRENCY`.

## 2. Isolate cohort analysis into its own streamed section

Cohort analysis moves out of `getDashboardData`'s shared `Promise.all`
entirely, into its own standalone action, fetched and rendered
independently via its own `<Suspense>` boundary — so the rest of the
dashboard can render the moment its (now-faster) data is ready, without
waiting on cohort analysis at all.

### `actions.ts`

```ts
export async function getCustomerCohortAnalysisCard(): Promise<CohortRow[] | Error> {
  await requireSession();
  if (!hasRealCredentials()) return buildMockCohortRows(new Date());
  if (!SHOW_CUSTOMER_COHORT_ANALYSIS) return [];
  return settle(cachedCustomerCohortAnalysis());
}
```

`getDashboardData` drops `customerCohortAnalysisPromise` and the
`customerCohortAnalysis` field from `raw`/`RawPipelineResults` entirely.
The `cachedCustomerCohortAnalysis` binding (`withCache`, 6 h) is unchanged.

### Types (`types.ts`) and normalization (`normalize.ts`)

`DashboardPayload["charts"]` drops `customerCohortAnalysis`;
`CardKey`/`errors` drops the `"customerCohortAnalysis"` member.
`RawPipelineResults` drops the field. `CohortRow` itself is unchanged —
still needed as the card's own return type.

### Mock data (`mock-data.ts`)

`buildMockCohortRows` is exported (currently a private helper used only
inside `buildMockDashboardPayload`) so `getCustomerCohortAnalysisCard` can
call it directly in the no-credentials path. `buildMockDashboardPayload`
stops including cohort rows in its returned payload.

### UI: new `CohortCard` component

New `src/components/analytics/CohortCard.tsx`, an async Server Component:

```ts
export async function CohortCard({ variant }: { variant: "preview" | "full" }) {
  const result = await getCustomerCohortAnalysisCard();
  if (result instanceof Error) {
    return <CardError title="Customer cohort analysis" message={CARD_ERROR_MESSAGE} />;
  }
  return <CustomerCohortTable rows={result} variant={variant} />;
}
```

This mirrors the existing `T | Error` + `CardError` convention used
everywhere else in this codebase (no new error-handling pattern, no
React error boundary introduced).

- **Dashboard** (`(with-sidebar)/page.tsx`): the existing inline
  `SHOW_CUSTOMER_COHORT_ANALYSIS && (data.errors.customerCohortAnalysis ? <CardError/> : <CustomerCohortTable variant="preview"/>)`
  block is replaced with:
  ```tsx
  {SHOW_CUSTOMER_COHORT_ANALYSIS && (
    <Suspense fallback={<TableSkeleton rows={4} columns={4} />}>
      <CohortCard variant="preview" />
    </Suspense>
  )}
  ```
  Rendered as a sibling of the main `RangeTransitionSwap`-wrapped content,
  **not** inside it and **not** keyed by `rangeQuery` — cohort analysis
  doesn't depend on the date-range filter, so changing the filter must not
  re-trigger or re-skeleton this card.
- **Report page** (`reports/[slug]/page.tsx`): the `customer-cohort-analysis`
  slug is special-cased before the generic range-dependent
  `RangeTransitionSwap`/`ReportContent` flow, rendering
  `<Suspense fallback={<ReportSkeleton shape="cohort-grid" />}><CohortCard variant="full" /></Suspense>`
  directly instead. The `renderReport` switch's
  `"customer-cohort-analysis"` case is removed (no longer reachable through
  that path). The `SHOW_CUSTOMER_COHORT_ANALYSIS` gate (showing the
  "temporarily disabled" `CardError` when off) moves to this same
  special-cased branch.

### Testing

- `normalize.test.ts`, `mock-data.test.ts`, `actions.test.ts`: update
  fixtures/assertions to drop cohort from the shared payload shape; add
  coverage for the new standalone `getCustomerCohortAnalysisCard`
  (mock-data path, real-credentials path via mocked `cachedCustomerCohortAnalysis`,
  and the `SHOW_CUSTOMER_COHORT_ANALYSIS === false` short-circuit).
- New `CohortCard.test.tsx`: loading is implicit (Suspense, not this
  component's concern); test the error and success render branches.

## New/modified files

- `src/lib/analytics/woocommerce/client.ts` (modify: bounded-concurrency
  `fetchWcAllPages`, new private `mapWithConcurrencyLimit` helper)
- `src/lib/analytics/woocommerce/client.test.ts` (modify: updated
  assertions, new concurrency-cap test)
- `src/lib/analytics/actions.ts` (modify: new
  `getCustomerCohortAnalysisCard`, drop cohort from `getDashboardData`)
- `src/lib/analytics/actions.test.ts` (modify)
- `src/lib/analytics/types.ts` (modify: drop cohort from
  `DashboardPayload`/`CardKey`)
- `src/lib/analytics/normalize.ts` (modify: drop cohort from
  `RawPipelineResults`/`buildDashboardPayload`)
- `src/lib/analytics/normalize.test.ts` (modify)
- `src/lib/analytics/mock-data.ts` (modify: export `buildMockCohortRows`,
  drop cohort from `buildMockDashboardPayload`)
- `src/lib/analytics/mock-data.test.ts` (modify)
- `src/components/analytics/CohortCard.tsx` (new, + test)
- `src/app/(with-sidebar)/page.tsx` (modify: cohort card becomes its own
  Suspense boundary, outside `RangeTransitionSwap`)
- `src/app/reports/[slug]/page.tsx` (modify: `customer-cohort-analysis`
  slug special-cased outside the generic range-dependent flow; removed
  from `renderReport`'s switch)

## Out of scope

- Switching the dev workflow to a production build (`next build && next start`) —
  a real, free improvement for perceived speed, but a user workflow choice
  outside this codebase change.
- Splitting any other card out of the shared `Promise.all` — after the
  pagination fix, everything except cohort analysis uses single-page WC
  requests or the already-parallel GA4 bundle, and is expected to be fast
  enough that further per-card splitting isn't worth its added
  restructuring cost. Revisit if a specific other card is later found slow.
- Increasing WC's page size beyond 100 (WooCommerce's own REST API cap).
- Any change to cohort analysis's own metric definition, data window, or
  known >24-month misclassification limitation (see
  `2026-09-08-customer-cohort-analysis-design.md`) — this spec only
  changes *when*/*how* its existing result gets fetched and rendered, not
  what it computes.
- Server-side response caching/CDN strategies, since this app runs
  local-dev-only with no deployment target today.
