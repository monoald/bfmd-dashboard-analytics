# Dashboard Load Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dashboard's cold load (after the data cache has fully
expired, e.g. after several days away) faster and feel faster, by
parallelizing WooCommerce's sequential page-fetching and by letting
customer cohort analysis — the single most expensive metric — load
independently instead of blocking the rest of the page.

**Architecture:** (1) `fetchWcAllPages` changes from a sequential
page-by-page loop to fetch-page-1-then-fetch-the-rest-in-a-bounded-worker-pool.
(2) Customer cohort analysis is extracted from `getDashboardData`'s shared
`Promise.all` into its own standalone action (`getCustomerCohortAnalysisCard`)
and its own React component (`CohortCard`), each wrapped in its own
`<Suspense>` boundary on the dashboard and report pages — independent of
the date-range Suspense/transition machinery, since cohort analysis
doesn't depend on the selected range at all.

**Tech Stack:** Next.js App Router (Server Components, `unstable_cache`),
React `Suspense`, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-15-dashboard-load-performance-design.md`

## Global Constraints

- No new npm dependencies — the bounded-concurrency page fetcher is a
  small hand-rolled helper, not a library.
- Concurrency cap for parallel page fetches: `DEFAULT_PAGE_CONCURRENCY = 5`.
- Preserve the existing `T | Error` + `settle()` error-handling convention
  everywhere — no React error boundaries, no new error-handling pattern.
- Cohort analysis's own metric definition, data window, and known
  >24-month misclassification limitation are unchanged — this plan only
  changes when/how its existing result is fetched and rendered.
- Switching the dev workflow to a production build is explicitly out of
  scope (see spec) — no task here touches that.

---

## Task 1: Bounded-concurrency `fetchWcAllPages`

**Files:**
- Modify: `src/lib/analytics/woocommerce/client.ts:71-97`
- Test: `src/lib/analytics/woocommerce/client.test.ts:83-153`

**Interfaces:**
- Produces: `fetchWcAllPages<T>(path: string, params?: Record<string, string>, pageSize?: number): Promise<T[]>` — same signature as before, callers (`cohort.ts`, `customers.ts`) need no changes.
- Produces: `DEFAULT_PAGE_CONCURRENCY: number` — exported constant, `= 5`.

- [ ] **Step 1: Write the failing tests for the new/changed behavior**

Replace the entire `describe("fetchWcAllPages", ...)` block (lines 83-153
of `src/lib/analytics/woocommerce/client.test.ts`) with:

```ts
  describe("fetchWcAllPages", () => {
    it("stops after one page when X-WP-TotalPages is 1", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ id: 1 }, { id: 2 }],
        headers: new Headers({ "X-WP-TotalPages": "1" }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const rows = await fetchWcAllPages("/wc-analytics/reports/customers");

      expect(rows).toEqual([{ id: 1 }, { id: 2 }]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("fetches every page and concatenates the results, not just the first 100 rows", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ id: 1 }, { id: 2 }],
          headers: new Headers({ "X-WP-TotalPages": "3" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ id: 3 }, { id: 4 }],
          headers: new Headers({ "X-WP-TotalPages": "3" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ id: 5 }],
          headers: new Headers({ "X-WP-TotalPages": "3" }),
        });
      vi.stubGlobal("fetch", fetchMock);

      const rows = await fetchWcAllPages("/wc-analytics/reports/customers");

      expect(rows).toEqual([
        { id: 1 },
        { id: 2 },
        { id: 3 },
        { id: 4 },
        { id: 5 },
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock.mock.calls[0][0]).toContain("page=1");
      expect(fetchMock.mock.calls[1][0]).toContain("page=2");
      expect(fetchMock.mock.calls[2][0]).toContain("page=3");
    });

    // Page 1 is always fetched first and read for X-WP-TotalPages before any
    // other page is requested — this is what lets an empty page 1 (below)
    // return an empty result without ever consulting the header.
    it("returns no rows and fetches only once when page 1 is empty", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
        headers: new Headers({ "X-WP-TotalPages": "5" }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const rows = await fetchWcAllPages("/wc-analytics/reports/customers");

      expect(rows).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    // The old sequential implementation stopped the instant it saw an empty
    // page, even if X-WP-TotalPages claimed more remained (a real WC quirk).
    // The new implementation can't stop mid-flight once pages 2+ are fetched
    // in parallel, so it fetches them all and then truncates the combined
    // result at the first empty page, discarding anything after it — same
    // final result, at the cost of a few now-wasted requests in this rare
    // case.
    it("truncates at the first empty page even if later pages return rows and X-WP-TotalPages says more remain", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ id: 1 }],
          headers: new Headers({ "X-WP-TotalPages": "5" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
          headers: new Headers({ "X-WP-TotalPages": "5" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ id: 3 }],
          headers: new Headers({ "X-WP-TotalPages": "5" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ id: 4 }],
          headers: new Headers({ "X-WP-TotalPages": "5" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ id: 5 }],
          headers: new Headers({ "X-WP-TotalPages": "5" }),
        });
      vi.stubGlobal("fetch", fetchMock);

      const rows = await fetchWcAllPages("/wc-analytics/reports/customers");

      expect(rows).toEqual([{ id: 1 }]);
      expect(fetchMock).toHaveBeenCalledTimes(5);
    });

    it("never issues more than DEFAULT_PAGE_CONCURRENCY page requests at once", async () => {
      const TOTAL_PAGES = 12;
      let inFlight = 0;
      let maxInFlight = 0;

      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 0));
        inFlight -= 1;
        const page = new URL(url).searchParams.get("page");
        return {
          ok: true,
          json: async () => [{ id: `page-${page}` }],
          headers: new Headers({ "X-WP-TotalPages": String(TOTAL_PAGES) }),
        };
      });
      vi.stubGlobal("fetch", fetchMock);

      const rows = await fetchWcAllPages("/wc-analytics/reports/customers");

      expect(rows).toHaveLength(TOTAL_PAGES);
      expect(fetchMock).toHaveBeenCalledTimes(TOTAL_PAGES);
      expect(maxInFlight).toBeGreaterThan(1);
      expect(maxInFlight).toBeLessThanOrEqual(DEFAULT_PAGE_CONCURRENCY);
    });
  });
```

Also update the top of the file to import the new constant — change:

```ts
import {
  fetchWc,
  fetchWcAllPages,
  fetchWcCount,
  WooCommerceApiError,
} from "./client";
```

to:

```ts
import {
  DEFAULT_PAGE_CONCURRENCY,
  fetchWc,
  fetchWcAllPages,
  fetchWcCount,
  WooCommerceApiError,
} from "./client";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/analytics/woocommerce/client.test.ts`
Expected: FAIL — `DEFAULT_PAGE_CONCURRENCY` is not exported yet, and the
"never issues more than..." / "truncates at the first empty page..." tests
fail against the old sequential implementation (old code only makes 1-2
fetch calls where the new tests expect 5 or 12).

- [ ] **Step 3: Replace `fetchWcAllPages` with the bounded-concurrency implementation**

Replace lines 71-97 of `src/lib/analytics/woocommerce/client.ts` (the
comment + function, currently starting `// Fetches every page of a
listing endpoint...` and ending at the function's closing `}`) with:

```ts
export const DEFAULT_PAGE_CONCURRENCY = 5;

// Runs `fn` over every item in `items`, at most `limit` calls in flight at
// once, preserving output order regardless of completion order.
async function mapWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await fn(items[currentIndex]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

// Fetches every page of a listing endpoint rather than assuming the result
// fits in one page. A single per_page: "100" request silently truncates
// once a store has more matching rows than that in the queried window (seen
// live: 315 active customers in a 30-day window on a store with heavy QA
// seed data), dropping real customers from both the numerator and
// denominator of the returning-rate calculation with no visible error.
//
// Page 1 is fetched first (sequentially) to learn X-WP-TotalPages; the
// remaining pages are then fetched in parallel, capped at
// DEFAULT_PAGE_CONCURRENCY so a single WordPress/PHP-FPM backend isn't hit
// with dozens of simultaneous requests (that risks queuing/timeouts on a
// backend with a limited worker pool, which could net out slower than
// sequential fetching, not faster).
//
// If any page comes back empty, every page from that one onward is
// discarded, even if pages after it returned rows — the old sequential
// implementation stopped the instant it saw an empty page, regardless of
// what X-WP-TotalPages claimed (a real WC quirk); this reproduces the same
// final result now that pages can't be stopped mid-flight once dispatched.
export async function fetchWcAllPages<T>(
  path: string,
  params: Record<string, string> = {},
  pageSize = 100,
): Promise<T[]> {
  const firstPageResponse = await wcRequest(path, {
    ...params,
    per_page: String(pageSize),
    page: "1",
  });
  const firstPageRows = (await firstPageResponse.json()) as T[];
  const totalPages = Number(
    firstPageResponse.headers.get("X-WP-TotalPages") ?? "1",
  );

  if (totalPages <= 1 || firstPageRows.length === 0) {
    return firstPageRows;
  }

  const remainingPageNumbers = Array.from(
    { length: totalPages - 1 },
    (_, i) => i + 2,
  );
  const remainingPages = await mapWithConcurrencyLimit(
    remainingPageNumbers,
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

  const allPages = [firstPageRows, ...remainingPages];
  const firstEmptyIndex = allPages.findIndex((rows) => rows.length === 0);
  const keptPages =
    firstEmptyIndex === -1 ? allPages : allPages.slice(0, firstEmptyIndex);
  return keptPages.flat();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/analytics/woocommerce/client.test.ts`
Expected: PASS (all tests in the file, including the 3 pre-existing ones
that don't test this function).

- [ ] **Step 5: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint src/lib/analytics/woocommerce/client.ts src/lib/analytics/woocommerce/client.test.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/analytics/woocommerce/client.ts src/lib/analytics/woocommerce/client.test.ts
git commit -m "$(cat <<'EOF'
Fetch WooCommerce list pages with bounded concurrency

Page 1 is still fetched first to learn the total page count, but the
rest now fetch in parallel (capped at 5 at once) instead of one at a
time, so cohort analysis's 24-month order scan and the
returning-customer-rate calculations don't pay for a full sequential
round trip per page.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Standalone `getCustomerCohortAnalysisCard` action

**Files:**
- Modify: `src/lib/analytics/mock-data.ts:119`
- Modify: `src/lib/analytics/actions.ts` (add import, add new function after `hasRealCredentials`)
- Test: `src/lib/analytics/actions.test.ts` (add import, add new `describe` block)

**Interfaces:**
- Consumes: `buildMockCohortRows(referenceDate: Date): CohortRow[]` (from `./mock-data`, being exported in this task)
- Consumes: `settle`, `hasRealCredentials`, `cachedCustomerCohortAnalysis`, `SHOW_CUSTOMER_COHORT_ANALYSIS` — all already defined/imported in `actions.ts`
- Produces: `getCustomerCohortAnalysisCard(): Promise<CohortRow[] | Error>` — used by Task 3's `CohortCard`

- [ ] **Step 1: Export `buildMockCohortRows`**

In `src/lib/analytics/mock-data.ts:119`, change:

```ts
function buildMockCohortRows(referenceDate: Date): CohortRow[] {
```

to:

```ts
export function buildMockCohortRows(referenceDate: Date): CohortRow[] {
```

(No other line in this file changes — `buildMockDashboardPayload` still
calls it the same way at line 774; that call site is removed in Task 6,
not here.)

- [ ] **Step 2: Write the failing tests for the new action**

In `src/lib/analytics/actions.test.ts`, change the import block at lines
89-93 from:

```ts
import {
  getDashboardData,
  getLiveViewData,
  fetchLiveVisitorCount,
} from "./actions";
```

to:

```ts
import {
  getDashboardData,
  getCustomerCohortAnalysisCard,
  getLiveViewData,
  fetchLiveVisitorCount,
} from "./actions";
```

Then insert this new `describe` block immediately after the closing `});`
of `describe("getDashboardData", ...)` (i.e., right after line 390, before
`describe("getLiveViewData", ...)`):

```ts
describe("getCustomerCohortAnalysisCard", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    cohortFlag.enabled = false;
  });

  it("returns 12 mock cohort rows without calling the real fetcher when credentials are missing", async () => {
    vi.unstubAllEnvs();

    const result = await getCustomerCohortAnalysisCard();

    expect(getCustomerCohortAnalysis).not.toHaveBeenCalled();
    expect(Array.isArray(result) && result.length === 12).toBe(true);
  });

  it("does not fetch when the feature flag is disabled, returning an empty array", async () => {
    cohortFlag.enabled = false;
    stubRealCredentials();

    const result = await getCustomerCohortAnalysisCard();

    expect(getCustomerCohortAnalysis).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it("fetches and returns rows once the feature flag is enabled", async () => {
    cohortFlag.enabled = true;
    stubRealCredentials();
    const rows = [
      { cohortMonth: "2026-06", cohortSize: 2, retentionByMonth: [50] },
    ];
    vi.mocked(getCustomerCohortAnalysis).mockResolvedValue(rows);

    const result = await getCustomerCohortAnalysisCard();

    expect(getCustomerCohortAnalysis).toHaveBeenCalledTimes(1);
    expect(getCustomerCohortAnalysis).toHaveBeenCalledWith();
    expect(result).toEqual(rows);
  });

  it("settles a fetch failure into an Error rather than throwing", async () => {
    cohortFlag.enabled = true;
    stubRealCredentials();
    vi.mocked(getCustomerCohortAnalysis).mockRejectedValue(
      new Error("WooCommerce API error 500"),
    );

    const result = await getCustomerCohortAnalysisCard();

    expect(result).toBeInstanceOf(Error);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/lib/analytics/actions.test.ts`
Expected: FAIL — `getCustomerCohortAnalysisCard` is not exported from
`./actions` yet (import error / undefined function).

- [ ] **Step 4: Add the new action**

In `src/lib/analytics/actions.ts`, update the mock-data import (originally):

```ts
import {
  buildMockDashboardPayload,
  buildMockLiveViewPayload,
} from "./mock-data";
```

to:

```ts
import {
  buildMockCohortRows,
  buildMockDashboardPayload,
  buildMockLiveViewPayload,
} from "./mock-data";
```

Then insert this new function right after the closing `}` of
`hasRealCredentials()` (originally ending at line 295) and before
`export async function getDashboardData(`:

```ts
// Standalone from getDashboardData: cohort analysis doesn't depend on the
// dashboard's selected date range (see getCustomerCohortAnalysis's own
// comment), and is by far the most expensive metric to compute (a 24-month
// paginated order-history scan) — bundling it into the same Promise.all as
// everything else meant one slow fetch blocked every other card from
// rendering. Callers render this behind their own <Suspense> boundary,
// independent of the range-dependent content.
export async function getCustomerCohortAnalysisCard(): Promise<
  CohortRow[] | Error
> {
  await requireSession();

  if (!hasRealCredentials()) {
    return buildMockCohortRows(new Date());
  }
  if (!SHOW_CUSTOMER_COHORT_ANALYSIS) {
    return [];
  }
  return settle(cachedCustomerCohortAnalysis());
}

```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/analytics/actions.test.ts`
Expected: PASS (all tests in the file, including the pre-existing
`getDashboardData` cohort tests at lines 364-389, which are untouched by
this task — `getDashboardData` still fetches cohort analysis itself until
Task 6).

- [ ] **Step 6: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint src/lib/analytics/mock-data.ts src/lib/analytics/actions.ts src/lib/analytics/actions.test.ts`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/analytics/mock-data.ts src/lib/analytics/actions.ts src/lib/analytics/actions.test.ts
git commit -m "$(cat <<'EOF'
Add standalone getCustomerCohortAnalysisCard action

Additive only — getDashboardData still fetches cohort analysis itself
for now. This new action will let the dashboard/report pages fetch and
stream cohort analysis independently of the rest of the page, added in
a later commit once the rendering side (CohortCard) exists to use it.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `CohortCard` component

**Files:**
- Create: `src/components/analytics/CohortCard.tsx`
- Test: `src/components/analytics/CohortCard.test.tsx`

**Interfaces:**
- Consumes: `getCustomerCohortAnalysisCard(): Promise<CohortRow[] | Error>` (Task 2, from `@/lib/analytics/actions`)
- Consumes: `CardError` (`@/components/analytics/CardError`, props `{ title: string; message: string }`)
- Consumes: `CustomerCohortTable` (`@/components/analytics/CustomerCohortTable`, props `{ rows: CohortRow[]; variant?: "full" | "preview" }`)
- Produces: `CohortCard({ variant, rangeQuery }: { variant: "preview" | "full"; rangeQuery?: string }): Promise<ReactNode>` — used by Task 4 (dashboard page) and Task 5 (report page)

- [ ] **Step 1: Write the failing test**

Create `src/components/analytics/CohortCard.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const getCustomerCohortAnalysisCardMock = vi.fn();
vi.mock("@/lib/analytics/actions", () => ({
  getCustomerCohortAnalysisCard: () => getCustomerCohortAnalysisCardMock(),
}));

import { CohortCard } from "./CohortCard";

describe("CohortCard", () => {
  it("renders an error card when the fetch settles to an Error", async () => {
    getCustomerCohortAnalysisCardMock.mockResolvedValue(
      new Error("Unable to load data for this card. Please try again later."),
    );

    render(await CohortCard({ variant: "full" }));

    expect(screen.getByText("Customer cohort analysis")).toBeInTheDocument();
    expect(
      screen.getByText(/Unable to load data for this card/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders the table unlinked for variant 'full'", async () => {
    getCustomerCohortAnalysisCardMock.mockResolvedValue([
      { cohortMonth: "2026-06", cohortSize: 2, retentionByMonth: [50] },
    ]);

    render(await CohortCard({ variant: "full" }));

    expect(screen.getByText("Customer cohort analysis")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("wraps the table in a link to the full report, preserving the range query, for variant 'preview'", async () => {
    getCustomerCohortAnalysisCardMock.mockResolvedValue([
      { cohortMonth: "2026-06", cohortSize: 2, retentionByMonth: [50] },
    ]);

    render(await CohortCard({ variant: "preview", rangeQuery: "range=7d" }));

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "/reports/customer-cohort-analysis?range=7d",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/analytics/CohortCard.test.tsx`
Expected: FAIL with a module-not-found error — `./CohortCard` doesn't exist yet.

- [ ] **Step 3: Write the component**

Create `src/components/analytics/CohortCard.tsx`:

```tsx
import Link from "next/link";
import { getCustomerCohortAnalysisCard } from "@/lib/analytics/actions";
import { CardError } from "./CardError";
import { CustomerCohortTable } from "./CustomerCohortTable";

export interface CohortCardProps {
  variant: "preview" | "full";
  // Only used (and required) for variant "preview", to link to the full
  // report while preserving the current date-range query string. Cohort
  // analysis itself doesn't depend on the range, but the link target does.
  rangeQuery?: string;
}

export async function CohortCard({ variant, rangeQuery }: CohortCardProps) {
  const result = await getCustomerCohortAnalysisCard();

  if (result instanceof Error) {
    return (
      <CardError title="Customer cohort analysis" message={result.message} />
    );
  }

  const table = <CustomerCohortTable rows={result} variant={variant} />;

  if (variant === "preview") {
    return (
      <Link
        href={`/reports/customer-cohort-analysis?${rangeQuery}`}
        className="block"
      >
        {table}
      </Link>
    );
  }

  return table;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/analytics/CohortCard.test.tsx`
Expected: PASS

- [ ] **Step 5: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint src/components/analytics/CohortCard.tsx src/components/analytics/CohortCard.test.tsx`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/analytics/CohortCard.tsx src/components/analytics/CohortCard.test.tsx
git commit -m "$(cat <<'EOF'
Add CohortCard component

Wraps getCustomerCohortAnalysisCard with the same T-or-Error ->
CardError-or-content rendering convention used everywhere else in this
codebase. Not wired into any page yet.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Wire `CohortCard` into the dashboard page

**Files:**
- Modify: `src/app/(with-sidebar)/page.tsx`
- Modify: `src/components/analytics/skeletons/DashboardSkeleton.tsx`

**Interfaces:**
- Consumes: `CohortCard` (Task 3), `TableSkeleton` (`@/components/analytics/skeletons/TableSkeleton`, props `{ rows?: number; columns?: number }`)

- [ ] **Step 1: Remove the cohort skeleton from `DashboardSkeleton`**

In `src/components/analytics/skeletons/DashboardSkeleton.tsx`, remove the
last line inside the returned fragment:

```tsx
      {SHOW_CUSTOMER_COHORT_ANALYSIS && <TableSkeleton rows={4} columns={4} />}
```

and remove `SHOW_CUSTOMER_COHORT_ANALYSIS` from the import at the top
(keep `SHOW_SALES_BY_CHANNEL`, which is still used):

```tsx
import {
  SHOW_CUSTOMER_COHORT_ANALYSIS,
  SHOW_SALES_BY_CHANNEL,
} from "@/lib/analytics/report-config";
```

becomes:

```tsx
import { SHOW_SALES_BY_CHANNEL } from "@/lib/analytics/report-config";
```

`TableSkeleton` also becomes unused in this file once that line is
removed — remove its import too:

```tsx
import { TableSkeleton } from "./TableSkeleton";
```

(This component now only renders the four grids of cards that
`DashboardContent` itself renders; cohort analysis gets its own skeleton
directly in the page, in Step 3 below.)

- [ ] **Step 2: Run the existing skeleton/dashboard tests to confirm nothing else broke**

Run: `npx vitest run`
Expected: PASS (there is no dedicated `DashboardSkeleton.test.tsx`; this
just confirms no other test imports/relies on the removed cohort branch).

- [ ] **Step 3: Replace the inline cohort block in the dashboard page**

In `src/app/(with-sidebar)/page.tsx`:

Remove the `CustomerCohortTable` import (no longer used directly by this
file — `CohortCard` uses it internally now):

```tsx
import { CustomerCohortTable } from "@/components/analytics/CustomerCohortTable";
```

Add imports for `CohortCard` and `TableSkeleton`:

```tsx
import { CohortCard } from "@/components/analytics/CohortCard";
```

and add `TableSkeleton` to the skeleton import:

```tsx
import { DashboardSkeleton } from "@/components/analytics/skeletons/DashboardSkeleton";
```

becomes:

```tsx
import { DashboardSkeleton } from "@/components/analytics/skeletons/DashboardSkeleton";
import { TableSkeleton } from "@/components/analytics/skeletons/TableSkeleton";
```

Add `Suspense` is already imported (`import { Suspense } from "react";`
at line 2) — no change needed there.

Replace the closing block of `DashboardContent`'s returned JSX — currently:

```tsx
      {SHOW_CUSTOMER_COHORT_ANALYSIS &&
        (data.errors.customerCohortAnalysis ? (
          <CardError
            title="Customer cohort analysis"
            message={data.errors.customerCohortAnalysis}
          />
        ) : (
          <Link
            href={`/reports/customer-cohort-analysis?${rangeQuery}`}
            className="block"
          >
            <CustomerCohortTable
              rows={data.charts.customerCohortAnalysis}
              variant="preview"
            />
          </Link>
        ))}
    </>
  );
}
```

with (cohort analysis is dropped from `DashboardContent` entirely — it no
longer reads `data.charts.customerCohortAnalysis` /
`data.errors.customerCohortAnalysis` at all):

```tsx
    </>
  );
}
```

Then move the cohort card outside `DashboardContent`, rendering it as a
sibling of the `RangeTransitionSwap` block in `AnalyticsPage` itself
(independent of the range-dependent Suspense/transition machinery, since
cohort analysis doesn't depend on the range). Change:

```tsx
          <RangeTransitionSwap fallback={<DashboardSkeleton />}>
            <Suspense fallback={<DashboardSkeleton />}>
              <DashboardContent
                key={rangeQuery}
                rangeKey={rangeKey}
                customRange={customRange ?? undefined}
                rangeQuery={rangeQuery}
              />
            </Suspense>
          </RangeTransitionSwap>
        </div>
      </div>
    </RangeTransitionProvider>
  );
}
```

to:

```tsx
          <RangeTransitionSwap fallback={<DashboardSkeleton />}>
            <Suspense fallback={<DashboardSkeleton />}>
              <DashboardContent
                key={rangeQuery}
                rangeKey={rangeKey}
                customRange={customRange ?? undefined}
                rangeQuery={rangeQuery}
              />
            </Suspense>
          </RangeTransitionSwap>

          {SHOW_CUSTOMER_COHORT_ANALYSIS && (
            <Suspense fallback={<TableSkeleton rows={4} columns={4} />}>
              <CohortCard variant="preview" rangeQuery={rangeQuery} />
            </Suspense>
          )}
        </div>
      </div>
    </RangeTransitionProvider>
  );
}
```

(`SHOW_CUSTOMER_COHORT_ANALYSIS` is already imported in this file's
existing `from "@/lib/analytics/report-config"` import — no import change
needed for it.)

- [ ] **Step 4: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint "src/app/(with-sidebar)/page.tsx" src/components/analytics/skeletons/DashboardSkeleton.tsx`
Expected: no errors. (Type errors here are expected to surface only once
Task 6 removes `customerCohortAnalysis` from `DashboardPayload` — until
then, `data.charts`/`data.errors` still has the field, just unused by
this file now, so this step should already be clean.)

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Manually verify in the browser**

Run: `npm run dev`, log in, and load `/`. Confirm:
- The cohort preview card still appears in the same place as before, and
  still links to `/reports/customer-cohort-analysis` with the current
  range query string preserved.
- Changing the date-range filter does **not** re-fetch or re-skeleton the
  cohort card (it should stay untouched while the rest of the dashboard
  reloads).

- [ ] **Step 7: Commit**

```bash
git add "src/app/(with-sidebar)/page.tsx" src/components/analytics/skeletons/DashboardSkeleton.tsx
git commit -m "$(cat <<'EOF'
Stream the dashboard's cohort card independently of the rest of the page

Moves the "Customer cohort analysis" preview card out of
DashboardContent's shared Promise.all/Suspense boundary into its own
CohortCard + Suspense pair, sitting outside the date-range transition
machinery entirely since cohort analysis doesn't depend on the
selected range. The rest of the dashboard no longer waits on it.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Wire `CohortCard` into the report page

**Files:**
- Modify: `src/app/reports/[slug]/page.tsx`

**Interfaces:**
- Consumes: `CohortCard` (Task 3)

- [ ] **Step 1: Stub out the now-unreachable switch case**

In `src/app/reports/[slug]/page.tsx`, `renderReport`'s `case
"customer-cohort-analysis"` (currently lines 343-361) reads
`data.charts.customerCohortAnalysis` / `data.errors.customerCohortAnalysis`,
which Task 6 removes from `DashboardPayload`. This slug will be handled
directly in `ReportPage` (Step 2 below) before `renderReport` is ever
called with it, but the case must stay in the switch to satisfy the
exhaustiveness check (`const _exhaustive: never = config.slug;` in the
`default` branch) against `ReportSlug`, which still includes this slug.
Replace lines 343-361:

```tsx
    case "customer-cohort-analysis": {
      if (!SHOW_CUSTOMER_COHORT_ANALYSIS) {
        return (
          <CardError
            title={config.title}
            message="This report is temporarily disabled while its data is being verified."
          />
        );
      }
      if (data.errors.customerCohortAnalysis) {
        return (
          <CardError
            title={config.title}
            message={data.errors.customerCohortAnalysis}
          />
        );
      }
      return <CustomerCohortTable rows={data.charts.customerCohortAnalysis} />;
    }
```

with:

```tsx
    // Handled directly in ReportPage, before ReportContent/renderReport are
    // invoked — cohort analysis doesn't depend on the dashboard's date
    // range, so it bypasses this range-dependent
    // getDashboardData/renderReport path entirely (see the ReportPage
    // component below). This case exists only to keep the switch
    // exhaustive over ReportSlug.
    case "customer-cohort-analysis": {
      return null;
    }
```

Remove the now-unused `CustomerCohortTable` import:

```tsx
import { CustomerCohortTable } from "@/components/analytics/CustomerCohortTable";
```

- [ ] **Step 2: Special-case the slug in `ReportPage`, before the generic range-dependent flow**

Add the `CohortCard` import, next to the `ReportSkeleton` import:

```tsx
import { ReportSkeleton } from "@/components/analytics/skeletons/ReportSkeleton";
```

becomes:

```tsx
import { CohortCard } from "@/components/analytics/CohortCard";
import { ReportSkeleton } from "@/components/analytics/skeletons/ReportSkeleton";
```

Then change the content block inside `ReportPage` — currently:

```tsx
          <div
            className={`grid ${config.shape === "donut" ? "max-w-xl" : "w-full"}`}
          >
            {/* RangeTransitionSwap covers the range-change case (see the
              matching comment in the dashboard page); Suspense still
              covers the first-load case. */}
            <RangeTransitionSwap
              fallback={<ReportSkeleton shape={config.shape} />}
            >
              <Suspense fallback={<ReportSkeleton shape={config.shape} />}>
                <ReportContent
                  key={rangeQuery}
                  config={config}
                  rangeKey={rangeKey}
                  customRange={customRange ?? undefined}
                />
              </Suspense>
            </RangeTransitionSwap>
          </div>
```

to:

```tsx
          <div
            className={`grid ${config.shape === "donut" ? "max-w-xl" : "w-full"}`}
          >
            {config.slug === "customer-cohort-analysis" ? (
              SHOW_CUSTOMER_COHORT_ANALYSIS ? (
                <Suspense fallback={<ReportSkeleton shape={config.shape} />}>
                  <CohortCard variant="full" />
                </Suspense>
              ) : (
                <CardError
                  title={config.title}
                  message="This report is temporarily disabled while its data is being verified."
                />
              )
            ) : (
              // RangeTransitionSwap covers the range-change case (see the
              // matching comment in the dashboard page); Suspense still
              // covers the first-load case.
              <RangeTransitionSwap
                fallback={<ReportSkeleton shape={config.shape} />}
              >
                <Suspense fallback={<ReportSkeleton shape={config.shape} />}>
                  <ReportContent
                    key={rangeQuery}
                    config={config}
                    rangeKey={rangeKey}
                    customRange={customRange ?? undefined}
                  />
                </Suspense>
              </RangeTransitionSwap>
            )}
          </div>
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint "src/app/reports/[slug]/page.tsx"`
Expected: no errors.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Manually verify in the browser**

Run: `npm run dev`, log in, and:
- Visit `/reports/customer-cohort-analysis` directly — confirm the full
  cohort table renders (or, if you flip `SHOW_CUSTOMER_COHORT_ANALYSIS` to
  `false` in `src/lib/analytics/report-config.ts` temporarily, confirm the
  "temporarily disabled" message shows instead).
- Visit any other report page (e.g. `/reports/gross-sales`) and confirm it
  still renders exactly as before.

- [ ] **Step 6: Commit**

```bash
git add "src/app/reports/[slug]/page.tsx"
git commit -m "$(cat <<'EOF'
Stream the cohort report page independently of the range-dependent flow

The customer-cohort-analysis report page now renders CohortCard
directly, bypassing the generic RangeTransitionSwap/ReportContent path
used by every other report — that path is range-dependent, and cohort
analysis isn't. renderReport's switch keeps a stub case for this slug
solely to stay exhaustive over ReportSlug.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Remove cohort analysis from the shared dashboard payload

**Files:**
- Modify: `src/lib/analytics/types.ts:248-267,269-317`
- Modify: `src/lib/analytics/normalize.ts:1-21,98-126,600-631`
- Modify: `src/lib/analytics/mock-data.ts:774`
- Modify: `src/lib/analytics/actions.ts` (`getDashboardData`)
- Test: `src/lib/analytics/normalize.test.ts:254,627-650`
- Test: `src/lib/analytics/mock-data.test.ts:148-172`
- Test: `src/lib/analytics/actions.test.ts:172,364-389`

**Interfaces:**
- Produces: `DashboardPayload` and `RawPipelineResults` without a
  `customerCohortAnalysis` field/error key — every other consumer of
  these types (all the other report cards) is unaffected.

- [ ] **Step 1: Remove cohort from the test fixtures/assertions first**

In `src/lib/analytics/normalize.test.ts`:
- Remove line 254, `customerCohortAnalysis: [],`, from the `baseRaw()` fixture.
- Delete the two tests at lines 627-650 (`"isolates a customerCohortAnalysis failure..."` and `"passes through customerCohortAnalysis rows unchanged on success"`) — this coverage now belongs to Task 2's `getCustomerCohortAnalysisCard` tests instead, since cohort analysis is no longer part of `buildDashboardPayload`'s normalization at all.

In `src/lib/analytics/mock-data.test.ts`, replace the whole
`describe("buildMockDashboardPayload customer cohort analysis", ...)`
block (lines 148-172) with a test of the now-standalone
`buildMockCohortRows` function directly:

```ts
describe("buildMockCohortRows", () => {
  it("returns 12 cohort rows with Month-0-plus-elapsed-month lengths decreasing toward the most recent", () => {
    const rows = buildMockCohortRows(NOW);

    expect(rows).toHaveLength(12);
    expect(rows.map((row) => row.retentionByMonth.length)).toEqual([
      13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2,
    ]);
  });

  it("gives every cohort row a positive cohort size and every retention value a plausible percentage", () => {
    const rows = buildMockCohortRows(NOW);

    for (const row of rows) {
      expect(row.cohortSize).toBeGreaterThan(0);
      for (const value of row.retentionByMonth) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(100);
      }
    }
  });
});
```

and update this file's import (line 2-5) from:

```ts
import {
  buildMockDashboardPayload,
  buildMockLiveViewPayload,
} from "./mock-data";
```

to:

```ts
import {
  buildMockCohortRows,
  buildMockDashboardPayload,
  buildMockLiveViewPayload,
} from "./mock-data";
```

In `src/lib/analytics/actions.test.ts`:
- Remove line 172, `vi.mocked(getCustomerCohortAnalysis).mockResolvedValue([]);`, from `mockHappyPath()`.
- Delete the two tests at lines 364-389 (`"does not fetch customer cohort analysis while its feature flag is disabled..."` and `"fetches and populates customer cohort analysis once its feature flag is enabled"`) from `describe("getDashboardData", ...)` — this behavior now belongs entirely to `getCustomerCohortAnalysisCard`, whose own tests (added in Task 2) already cover it.

- [ ] **Step 2: Run the test suite to confirm these edits alone fail correctly**

Run: `npx vitest run`
Expected: FAIL — the remaining production code (`types.ts`, `normalize.ts`,
`mock-data.ts`, `actions.ts`) still references `customerCohortAnalysis`,
so e.g. `buildMockCohortRows(NOW)` works fine (already exported since
Task 2) but other now-orphaned assertions may still reference the field
via `payload.charts`/`payload.errors` in ways that no longer exist once
Step 3 lands — at this exact midpoint some tests may pass and some
existing ones may break due to shape mismatches; that's expected and
resolved by Step 3.

- [ ] **Step 3: Remove `customerCohortAnalysis` from the shared types**

In `src/lib/analytics/types.ts`:
- Remove `| "customerCohortAnalysis";` from the `CardKey` union (line 267), i.e. change the union's last two lines from:

  ```ts
    | "salesByProduct"
    | "customerCohortAnalysis";
  ```

  to:

  ```ts
    | "salesByProduct";
  ```

- Remove line 314, `customerCohortAnalysis: CohortRow[];`, from `DashboardPayload["charts"]`.

(`CohortRow` itself stays defined and exported — `CohortCard`/`getCustomerCohortAnalysisCard` still use it.)

- [ ] **Step 4: Remove `customerCohortAnalysis` from normalization**

In `src/lib/analytics/normalize.ts`:
- Remove `CohortRow,` from the type-only import block (line 5).
- Remove line 125, `customerCohortAnalysis: CohortRow[] | Error;`, from `RawPipelineResults`.
- Remove the `customerCohortAnalysis` unwrap call from the object literal built in `buildDashboardPayload` — currently (lines 617-627):

  ```ts
      salesByProduct: unwrap("salesByProduct", raw.salesByProduct, []),
      salesByProductBreakdown: unwrap(
        "salesByProduct",
        raw.salesByProductBreakdown,
        [],
      ),
      customerCohortAnalysis: unwrap(
        "customerCohortAnalysis",
        raw.customerCohortAnalysis,
        [],
      ),
    },
  ```

  becomes:

  ```ts
      salesByProduct: unwrap("salesByProduct", raw.salesByProduct, []),
      salesByProductBreakdown: unwrap(
        "salesByProduct",
        raw.salesByProductBreakdown,
        [],
      ),
    },
  ```

- [ ] **Step 5: Remove cohort from the mock dashboard payload**

In `src/lib/analytics/mock-data.ts`, remove line 774,
`customerCohortAnalysis: buildMockCohortRows(range.current.end),`, from
`buildMockDashboardPayload`'s returned object.

- [ ] **Step 6: Remove cohort from `getDashboardData`**

In `src/lib/analytics/actions.ts`, replace the body of `getDashboardData`
(currently — the part from the mock-credentials early return onward):

```ts
  if (!hasRealCredentials()) {
    return buildMockDashboardPayload(range);
  }

  const customerCohortAnalysisPromise: Promise<CohortRow[] | Error> =
    SHOW_CUSTOMER_COHORT_ANALYSIS
      ? settle(cachedCustomerCohortAnalysis())
      : Promise.resolve<CohortRow[]>([]);

  const [
    revenueStats,
    ordersFulfilled,
    itemsSoldOverTime,
    returningCustomerRate,
    newAndReturningCustomerCounts,
    returningCustomerRateBreakdown,
    salesByProduct,
    salesByProductBreakdown,
    salesByChannel,
    ga4Bundle,
    customerCohortAnalysis,
  ] = await Promise.all([
    settle(cachedRevenueStats(range)),
    settle(cachedOrdersFulfilled(range)),
    settle(cachedItemsSoldOverTime(range)),
    settle(cachedReturningCustomerRate(range)),
    settle(cachedNewAndReturningCustomerCounts(range)),
    settle(cachedReturningCustomerRateBreakdown(range)),
    settle(cachedTopProducts(range)),
    settle(cachedSalesByProductBreakdown(range)),
    settle(cachedSalesByChannel(range)),
    getGa4TodayBundle(range),
    customerCohortAnalysisPromise,
  ]);

  const raw: RawPipelineResults = {
    revenueStats,
    ordersFulfilled,
    itemsSoldOverTime,
    returningCustomerRate,
    newAndReturningCustomerCounts,
    returningCustomerRateBreakdown,
    salesByProduct,
    salesByProductBreakdown,
    salesByChannel,
    ...ga4Bundle,
    customerCohortAnalysis,
  };

  return buildDashboardPayload(raw, range.interval);
}
```

with:

```ts
  if (!hasRealCredentials()) {
    return buildMockDashboardPayload(range);
  }

  const [
    revenueStats,
    ordersFulfilled,
    itemsSoldOverTime,
    returningCustomerRate,
    newAndReturningCustomerCounts,
    returningCustomerRateBreakdown,
    salesByProduct,
    salesByProductBreakdown,
    salesByChannel,
    ga4Bundle,
  ] = await Promise.all([
    settle(cachedRevenueStats(range)),
    settle(cachedOrdersFulfilled(range)),
    settle(cachedItemsSoldOverTime(range)),
    settle(cachedReturningCustomerRate(range)),
    settle(cachedNewAndReturningCustomerCounts(range)),
    settle(cachedReturningCustomerRateBreakdown(range)),
    settle(cachedTopProducts(range)),
    settle(cachedSalesByProductBreakdown(range)),
    settle(cachedSalesByChannel(range)),
    getGa4TodayBundle(range),
  ]);

  const raw: RawPipelineResults = {
    revenueStats,
    ordersFulfilled,
    itemsSoldOverTime,
    returningCustomerRate,
    newAndReturningCustomerCounts,
    returningCustomerRateBreakdown,
    salesByProduct,
    salesByProductBreakdown,
    salesByChannel,
    ...ga4Bundle,
  };

  return buildDashboardPayload(raw, range.interval);
}
```

- [ ] **Step 7: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, all files.

- [ ] **Step 8: Type-check and lint the whole project**

Run: `npx tsc --noEmit && npx eslint .`
Expected: no errors. (This is the step that would catch any remaining
stray reference to `customerCohortAnalysis` on `DashboardPayload` /
`RawPipelineResults` / `CardKey` anywhere in the codebase.)

- [ ] **Step 9: Manually verify in the browser**

Run: `npm run dev`, log in, and reload `/` and
`/reports/customer-cohort-analysis`. Confirm both still render correctly
(this should look identical to Task 4/5's manual checks — this task only
removes now-dead plumbing, it doesn't change behavior).

- [ ] **Step 10: Commit**

```bash
git add src/lib/analytics/types.ts src/lib/analytics/normalize.ts src/lib/analytics/normalize.test.ts src/lib/analytics/mock-data.ts src/lib/analytics/mock-data.test.ts src/lib/analytics/actions.ts src/lib/analytics/actions.test.ts
git commit -m "$(cat <<'EOF'
Remove customer cohort analysis from the shared dashboard payload

Now that both pages fetch and render it independently via CohortCard,
drop customerCohortAnalysis from DashboardPayload/RawPipelineResults/
CardKey entirely — getDashboardData no longer fetches it at all,
closing out the migration started in the last few commits.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
