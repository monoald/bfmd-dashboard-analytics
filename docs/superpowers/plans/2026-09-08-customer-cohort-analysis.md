# Customer Cohort Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "Customer cohort analysis" report — a monthly retention heatmap grouping customers by month of first purchase — as a flag-gated feature across the fetch/normalize/UI pipeline this dashboard already uses for every other report.

**Architecture:** A new WooCommerce fetcher (`cohort.ts`) aggregates 24 months of paginated order history into 12 cohort rows entirely on its own (no shared normalize-layer transform needed, since the shape it produces is already final); a new `ReportShape` ("cohort-grid") and a new heatmap table component render it; a new flag (`SHOW_CUSTOMER_COHORT_ANALYSIS`, default `false`) gates both the fetch and every UI entry point until the aggregation is verified against the live store, mirroring the existing `SHOW_SALES_BY_CHANNEL` pattern.

**Tech Stack:** Next.js 16 (App Router, Server Components), TypeScript, Vitest + @testing-library/react, Tailwind v4 (CSS custom properties, `color-mix()`).

**Spec:** `docs/superpowers/specs/2026-09-08-customer-cohort-analysis-design.md`

## Global Constraints

- `SHOW_CUSTOMER_COHORT_ANALYSIS` starts `false` and MUST stay `false` in every commit this plan produces — flipping it on happens in a separate, later change once the live store's `/wc-analytics/reports/orders` response shape is verified (see spec's "Out of scope").
- The cohort fetch is skipped entirely (not just hidden in the UI) while the flag is off — do not let it run unconditionally the way `salesByChannel` does today.
- Parse WooCommerce date strings the same regex-based way `format.ts`'s existing `parseWcIntervalDate` does — never `new Date(wcDateString)` — to avoid the timezone-reinterpretation bug already fixed once in this codebase (`date-range.ts`).
- `getCustomerCohortAnalysis` takes an **optional** `now: Date = new Date()` parameter but the cached binding in `actions.ts` must call it with **zero arguments** — passing a fresh `Date` as a cache-key argument would defeat `unstable_cache`'s TTL by changing the key on every call.
- Every new/modified `.ts`/`.tsx` file needs a passing test in the same task, following this codebase's existing Vitest + Testing Library conventions (see each task's "Files" for the exact test file). The two page files (`(with-sidebar)/page.tsx`, `reports/[slug]/page.tsx`) are the sole exception — no page-level tests exist anywhere in this codebase today, so those two tasks close with a manual dev-server check instead, matching existing project convention.

---

## Task 1: Cohort month arithmetic in `format.ts`

**Files:**
- Modify: `src/lib/analytics/format.ts`
- Test: `src/lib/analytics/format.test.ts`

**Interfaces:**
- Produces: `dateToIsoMonth(date: Date): string`, `addIsoMonths(isoMonth: string, delta: number): string`, `isoMonthsBetween(a: string, b: string): number`, `formatIsoMonthLabel(isoMonth: string): string`, `wcDateToIsoMonth(dateStr: string): string | null` — all exported from `format.ts`. Later tasks (`cohort.ts`, `mock-data.ts`, `CustomerCohortTable.tsx`) import these by these exact names.

- [ ] **Step 1: Write the failing tests**

`format.test.ts` already has one `import { ... } from "./format";` block at the top — extend that existing block with the five new names (`addIsoMonths`, `dateToIsoMonth`, `formatIsoMonthLabel`, `isoMonthsBetween`, `wcDateToIsoMonth`) rather than adding a second import statement. Then append these `describe` blocks to the end of the file:

```ts
describe("dateToIsoMonth", () => {
  it("formats a UTC date as YYYY-MM", () => {
    expect(dateToIsoMonth(new Date(Date.UTC(2026, 8, 8)))).toBe("2026-09");
  });

  it("pads single-digit months", () => {
    expect(dateToIsoMonth(new Date(Date.UTC(2026, 0, 15)))).toBe("2026-01");
  });
});

describe("addIsoMonths", () => {
  it("adds a positive delta within the same year", () => {
    expect(addIsoMonths("2026-06", 3)).toBe("2026-09");
  });

  it("subtracts a delta within the same year", () => {
    expect(addIsoMonths("2026-09", -3)).toBe("2026-06");
  });

  it("rolls over into the next year", () => {
    expect(addIsoMonths("2026-09", 4)).toBe("2027-01");
  });

  it("rolls back into the previous year", () => {
    expect(addIsoMonths("2026-01", -1)).toBe("2025-12");
  });

  it("rolls back a full year", () => {
    expect(addIsoMonths("2026-01", -12)).toBe("2025-01");
  });
});

describe("isoMonthsBetween", () => {
  it("counts whole months between two iso months", () => {
    expect(isoMonthsBetween("2026-01", "2026-09")).toBe(8);
  });

  it("returns 0 for the same month", () => {
    expect(isoMonthsBetween("2026-09", "2026-09")).toBe(0);
  });

  it("spans a year boundary", () => {
    expect(isoMonthsBetween("2025-09", "2026-09")).toBe(12);
  });
});

describe("formatIsoMonthLabel", () => {
  it("formats an iso month as 'Mon YYYY'", () => {
    expect(formatIsoMonthLabel("2026-01")).toBe("Jan 2026");
    expect(formatIsoMonthLabel("2025-12")).toBe("Dec 2025");
  });
});

describe("wcDateToIsoMonth", () => {
  it("extracts the iso month from a space-separated WC date string", () => {
    expect(wcDateToIsoMonth("2026-06-15 10:30:00")).toBe("2026-06");
  });

  it("extracts the iso month from a T-separated WC date string", () => {
    expect(wcDateToIsoMonth("2026-06-15T10:30:00")).toBe("2026-06");
  });

  it("returns null for an unparseable string", () => {
    expect(wcDateToIsoMonth("not a date")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/analytics/format.test.ts`
Expected: FAIL — `addIsoMonths`, `dateToIsoMonth`, `isoMonthsBetween`, `formatIsoMonthLabel`, `wcDateToIsoMonth` are not exported yet.

- [ ] **Step 3: Implement**

Add to `src/lib/analytics/format.ts`, after the existing `formatWcIntervalLabel` function (the file already has a private `parseWcIntervalDate` function — reuse it rather than re-parsing):

```ts
export function dateToIsoMonth(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function addIsoMonths(isoMonth: string, delta: number): string {
  const [year, month] = isoMonth.split("-").map(Number);
  const total = year * 12 + (month - 1) + delta;
  const resultYear = Math.floor(total / 12);
  const resultMonth = (total % 12) + 1;
  return `${resultYear}-${String(resultMonth).padStart(2, "0")}`;
}

export function isoMonthsBetween(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return by * 12 + bm - (ay * 12 + am);
}

export function formatIsoMonthLabel(isoMonth: string): string {
  const [year, month] = isoMonth.split("-").map(Number);
  return `${SHORT_DATE_MONTH_NAMES[month - 1]} ${year}`;
}

// Reuses parseWcIntervalDate's regex-based parsing (see its comment above)
// rather than `new Date(dateStr)`, for the same reason: dateStr is already
// in the store's own timezone with no offset, so re-parsing it with `Date`
// would reinterpret it in whatever timezone the server process runs in.
export function wcDateToIsoMonth(dateStr: string): string | null {
  const parsed = parseWcIntervalDate(dateStr);
  if (!parsed) return null;
  return `${parsed.year}-${String(parsed.month + 1).padStart(2, "0")}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/analytics/format.test.ts`
Expected: PASS, all tests including pre-existing ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/format.ts src/lib/analytics/format.test.ts
git commit -m "Add iso-month arithmetic helpers for customer cohort analysis"
```

---

## Task 2: `CohortRow` type + `getCustomerCohortAnalysis` fetcher

**Files:**
- Modify: `src/lib/analytics/types.ts`
- Create: `src/lib/analytics/woocommerce/cohort.ts`
- Test: `src/lib/analytics/woocommerce/cohort.test.ts`

**Interfaces:**
- Consumes: `addIsoMonths`, `dateToIsoMonth`, `isoMonthsBetween`, `wcDateToIsoMonth` from `../format` (Task 1); `fetchWcAllPages<T>(path, params, pageSize?): Promise<T[]>` from `./client`.
- Produces: `export interface CohortRow { cohortMonth: string; cohortSize: number; retentionByMonth: number[] }` (in `types.ts`); `export async function getCustomerCohortAnalysis(now?: Date): Promise<CohortRow[]>` (in `cohort.ts`). Task 4 (`normalize.ts`) and Task 5 (`actions.ts`) import both by these names.

- [ ] **Step 1: Add the type**

In `src/lib/analytics/types.ts`, add near the other row-shape interfaces (e.g. after `SalesOverTimeBreakdownRow`, before `CardKey`):

```ts
// One row of the "Customer cohort analysis" report: customers grouped by
// the calendar month of their first-ever order. retentionByMonth[0] is
// "Month 1" (the first full/partial calendar month after cohortMonth);
// its length equals how many calendar months have elapsed since
// cohortMonth, not a fixed 12 — the most recent cohort row has exactly 1
// entry (the current, still-in-progress month), the oldest visible row
// has up to 12.
export interface CohortRow {
  cohortMonth: string; // ISO month, e.g. "2026-01"
  cohortSize: number;
  retentionByMonth: number[];
}
```

(No test needed for a type-only addition — it's exercised by Step 3's test below.)

- [ ] **Step 2: Write the failing tests**

Create `src/lib/analytics/woocommerce/cohort.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ fetchWcAllPages: vi.fn() }));

import { fetchWcAllPages } from "./client";
import { getCustomerCohortAnalysis } from "./cohort";

afterEach(() => {
  vi.resetAllMocks();
});

// "Now" is fixed mid-September 2026, so the current (partial) month is
// 2026-09, the most recent visible cohort row is 2026-08 (elapsed = 1),
// and the oldest visible cohort row is 2025-09 (elapsed = 12).
const NOW = new Date("2026-09-08T00:00:00Z");

function orderRow(customerId: number, dateCreated: string) {
  return { customer_id: customerId, date_created: dateCreated };
}

describe("getCustomerCohortAnalysis", () => {
  it("queries /wc-analytics/reports/orders for completed orders starting 24 months before now, paginated", async () => {
    vi.mocked(fetchWcAllPages).mockResolvedValue([]);

    await getCustomerCohortAnalysis(NOW);

    expect(fetchWcAllPages).toHaveBeenCalledTimes(1);
    expect(fetchWcAllPages).toHaveBeenCalledWith(
      "/wc-analytics/reports/orders",
      {
        "status_is[]": "completed",
        after: new Date(Date.UTC(2024, 8, 1)).toISOString(),
      },
    );
  });

  it("returns 12 rows, ordered oldest to newest, spanning the 12 months before the current in-progress month", async () => {
    vi.mocked(fetchWcAllPages).mockResolvedValue([]);

    const rows = await getCustomerCohortAnalysis(NOW);

    expect(rows.map((r) => r.cohortMonth)).toEqual([
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
  });

  it("gives the most recent cohort row exactly 1 elapsed-month column and the oldest row 12", async () => {
    vi.mocked(fetchWcAllPages).mockResolvedValue([
      orderRow(10, "2025-09-05 10:00:00"), // oldest visible cohort month
      orderRow(11, "2026-08-05 10:00:00"), // most recent visible cohort month
    ]);

    const rows = await getCustomerCohortAnalysis(NOW);

    expect(rows[0].cohortMonth).toBe("2025-09");
    expect(rows[0].retentionByMonth).toHaveLength(12);
    expect(rows[11].cohortMonth).toBe("2026-08");
    expect(rows[11].retentionByMonth).toHaveLength(1);
  });

  it("gives a cohort with zero customers an empty retentionByMonth array regardless of elapsed months", async () => {
    vi.mocked(fetchWcAllPages).mockResolvedValue([]);

    const rows = await getCustomerCohortAnalysis(NOW);

    expect(rows[0].cohortSize).toBe(0); // 2025-09, 12 months elapsed
    expect(rows[0].retentionByMonth).toEqual([]);
  });

  it("groups a customer's orders under the calendar month of their first order, computing per-month (non-cumulative) retention", async () => {
    vi.mocked(fetchWcAllPages).mockResolvedValue([
      // Customer A: first order June 2026, repeats in July and August.
      orderRow(1, "2026-06-05 10:00:00"),
      orderRow(1, "2026-07-10 10:00:00"),
      orderRow(1, "2026-08-02 10:00:00"),
      // Customer B: first (and only) order June 2026, no repeat.
      orderRow(2, "2026-06-20 10:00:00"),
    ]);

    const rows = await getCustomerCohortAnalysis(NOW);
    const juneCohort = rows.find((r) => r.cohortMonth === "2026-06");

    expect(juneCohort?.cohortSize).toBe(2);
    // Elapsed months from 2026-06 to 2026-09 (current) = 3: Jul, Aug, Sep.
    // Jul: A active (1/2=50%). Aug: A active (1/2=50%). Sep: neither (0%).
    expect(juneCohort?.retentionByMonth).toEqual([50, 50, 0]);
  });

  it("excludes guest checkouts (customer_id 0) from cohort membership", async () => {
    vi.mocked(fetchWcAllPages).mockResolvedValue([
      orderRow(0, "2026-06-05 10:00:00"),
      orderRow(0, "2026-07-05 10:00:00"),
    ]);

    const rows = await getCustomerCohortAnalysis(NOW);
    const juneCohort = rows.find((r) => r.cohortMonth === "2026-06");

    expect(juneCohort?.cohortSize).toBe(0);
  });

  it("assigns a customer's cohort by their earliest order regardless of array order", async () => {
    vi.mocked(fetchWcAllPages).mockResolvedValue([
      orderRow(3, "2026-07-15 10:00:00"),
      orderRow(3, "2026-06-01 10:00:00"), // earlier order, appears second
    ]);

    const rows = await getCustomerCohortAnalysis(NOW);

    expect(rows.find((r) => r.cohortMonth === "2026-06")?.cohortSize).toBe(1);
    expect(rows.find((r) => r.cohortMonth === "2026-07")?.cohortSize).toBe(0);
  });

  it("excludes a customer from a visible cohort row if their true first order was in the 12-month lookback buffer", async () => {
    vi.mocked(fetchWcAllPages).mockResolvedValue([
      // True first order Jan 2025 — inside the fetched 24-month window but
      // before the 12 visible cohort months (2025-09 onward). Then a
      // return order in March 2026, inside the visible window.
      orderRow(4, "2025-01-10 10:00:00"),
      orderRow(4, "2026-03-05 10:00:00"),
    ]);

    const rows = await getCustomerCohortAnalysis(NOW);

    // Must NOT be counted as a new March 2026 cohort member.
    expect(rows.find((r) => r.cohortMonth === "2026-03")?.cohortSize).toBe(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/analytics/woocommerce/cohort.test.ts`
Expected: FAIL — `./cohort` module does not exist yet.

- [ ] **Step 4: Implement**

Create `src/lib/analytics/woocommerce/cohort.ts`:

```ts
import { fetchWcAllPages } from "./client";
import {
  addIsoMonths,
  dateToIsoMonth,
  isoMonthsBetween,
  wcDateToIsoMonth,
} from "../format";
import type { CohortRow } from "../types";

interface WcOrderRow {
  customer_id: number;
  date_created: string;
}

const VISIBLE_COHORT_MONTHS = 12;
const LOOKBACK_BUFFER_MONTHS = 12;

function isoMonthStartUtc(isoMonth: string): Date {
  const [year, month] = isoMonth.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// Cohort row = customers grouped by the calendar month of their true
// first-ever order. Fetches 24 months of order history (12 visible cohort
// months + a 12-month lookback buffer) so a customer who first ordered
// before the visible window, then returns within it, isn't misclassified
// as a brand-new cohort member in the month they return. A customer whose
// real first order predates the full 24-month fetch is still
// misclassified this way — documented, bounded tradeoff, see the design
// spec's "Known limitation".
//
// `now` defaults to the real current time; callers that need caching
// (actions.ts) must call this with zero arguments so the cache key stays
// stable — passing a fresh Date each call would bust the cache every time.
export async function getCustomerCohortAnalysis(
  now: Date = new Date(),
): Promise<CohortRow[]> {
  const currentMonth = dateToIsoMonth(now);
  const fetchStartMonth = addIsoMonths(
    currentMonth,
    -(VISIBLE_COHORT_MONTHS + LOOKBACK_BUFFER_MONTHS),
  );

  const orders = await fetchWcAllPages<WcOrderRow>(
    "/wc-analytics/reports/orders",
    {
      "status_is[]": "completed",
      after: isoMonthStartUtc(fetchStartMonth).toISOString(),
    },
  );

  const activeMonthsByCustomer = new Map<number, Set<string>>();
  for (const order of orders) {
    if (order.customer_id === 0) continue;
    const month = wcDateToIsoMonth(order.date_created);
    if (!month) continue;
    const months =
      activeMonthsByCustomer.get(order.customer_id) ?? new Set<string>();
    months.add(month);
    activeMonthsByCustomer.set(order.customer_id, months);
  }

  const customerIdsByCohortMonth = new Map<string, number[]>();
  for (const [customerId, months] of activeMonthsByCustomer) {
    const cohortMonth = [...months].sort()[0];
    const ids = customerIdsByCohortMonth.get(cohortMonth) ?? [];
    ids.push(customerId);
    customerIdsByCohortMonth.set(cohortMonth, ids);
  }

  const rows: CohortRow[] = [];
  for (let i = VISIBLE_COHORT_MONTHS; i >= 1; i--) {
    const cohortMonth = addIsoMonths(currentMonth, -i);
    const cohortCustomerIds = customerIdsByCohortMonth.get(cohortMonth) ?? [];
    const cohortSize = cohortCustomerIds.length;
    const elapsed = isoMonthsBetween(cohortMonth, currentMonth);

    const retentionByMonth: number[] = [];
    if (cohortSize > 0) {
      for (let n = 1; n <= elapsed; n++) {
        const targetMonth = addIsoMonths(cohortMonth, n);
        const activeCount = cohortCustomerIds.filter((id) =>
          activeMonthsByCustomer.get(id)?.has(targetMonth),
        ).length;
        retentionByMonth.push(round1((activeCount / cohortSize) * 100));
      }
    }

    rows.push({ cohortMonth, cohortSize, retentionByMonth });
  }

  return rows;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/analytics/woocommerce/cohort.test.ts`
Expected: PASS, all 7 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/analytics/types.ts src/lib/analytics/woocommerce/cohort.ts src/lib/analytics/woocommerce/cohort.test.ts
git commit -m "Add CohortRow type and getCustomerCohortAnalysis WC fetcher"
```

---

## Task 3: `report-config.ts` — flag, shape, slug

**Files:**
- Modify: `src/lib/analytics/report-config.ts`
- Test: `src/lib/analytics/report-config.test.ts`

**Interfaces:**
- Produces: `SHOW_CUSTOMER_COHORT_ANALYSIS: boolean` (`false`), `ReportShape` gains `"cohort-grid"`, `ReportSlug` gains `"customer-cohort-analysis"`, `REPORT_CONFIGS` gains one entry. Task 5 (`actions.ts`) imports `SHOW_CUSTOMER_COHORT_ANALYSIS`; Task 8/9 (page wiring) import it too.

- [ ] **Step 1: Update the failing tests**

In `src/lib/analytics/report-config.test.ts`, update the existing counts and add a lookup test:

```ts
it("has exactly 16 entries with unique slugs", () => {
  expect(REPORT_CONFIGS).toHaveLength(16);
  const slugs = REPORT_CONFIGS.map((config) => config.slug);
  expect(new Set(slugs).size).toBe(16);
});

it("covers every shape at least once", () => {
  const shapes = new Set(REPORT_CONFIGS.map((config) => config.shape));
  expect(shapes).toEqual(
    new Set([
      "line-comparison",
      "line-simple",
      "donut",
      "list",
      "ranked",
      "funnel",
      "cohort-grid",
    ]),
  );
});
```

(Replace the `toHaveLength(15)` and the shapes-`Set` literal in the existing tests with the above.) Also add, in the `getReportConfig` describe block:

```ts
it("finds the customer cohort analysis config", () => {
  expect(getReportConfig("customer-cohort-analysis")).toEqual({
    slug: "customer-cohort-analysis",
    title: "Customer cohort analysis",
    shape: "cohort-grid",
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/analytics/report-config.test.ts`
Expected: FAIL — length is 15 not 16, `cohort-grid` shape and slug don't exist.

- [ ] **Step 3: Implement**

In `src/lib/analytics/report-config.ts`:

1. Add the flag near `SHOW_SALES_BY_CHANNEL`:

```ts
// New, never verified against live order data (full order-history
// aggregation across a 24-month window via the WC Analytics orders
// endpoint). Disabled pending verification against the live store —
// same gating pattern as SHOW_SALES_BY_CHANNEL above. See
// docs/superpowers/specs/2026-09-08-customer-cohort-analysis-design.md.
export const SHOW_CUSTOMER_COHORT_ANALYSIS = false;
```

2. Extend `ReportShape`:

```ts
export type ReportShape =
  | "line-comparison"
  | "line-simple"
  | "donut"
  | "list"
  | "ranked"
  | "funnel"
  | "cohort-grid";
```

3. Extend `ReportSlug` (add at the end of the union):

```ts
  | "conversion-rate-breakdown"
  | "customer-cohort-analysis";
```

4. Append to `REPORT_CONFIGS`:

```ts
  {
    slug: "customer-cohort-analysis",
    title: "Customer cohort analysis",
    shape: "cohort-grid",
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/analytics/report-config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/report-config.ts src/lib/analytics/report-config.test.ts
git commit -m "Add SHOW_CUSTOMER_COHORT_ANALYSIS flag and cohort-grid report shape"
```

---

## Task 4: Wire into `normalize.ts`

**Files:**
- Modify: `src/lib/analytics/normalize.ts`
- Test: `src/lib/analytics/normalize.test.ts`

**Interfaces:**
- Consumes: `CohortRow` from `./types` (Task 2).
- Produces: `RawPipelineResults.customerCohortAnalysis: CohortRow[] | Error`; `DashboardPayload.charts.customerCohortAnalysis: CohortRow[]` (via `types.ts`, added in this task's Step 3). Task 5 (`actions.ts`) populates the raw field; Task 6 (`mock-data.ts`) and Task 7 (component) consume `charts.customerCohortAnalysis`.

- [ ] **Step 1: Write the failing tests**

In `src/lib/analytics/normalize.test.ts`:

1. Add `customerCohortAnalysis: []` to the object returned by `baseRaw()` (needed for every existing `buildDashboardPayload(baseRaw())` call to keep compiling and passing).
2. Add a new test near the other isolation tests (e.g. after the `sessionsOverTimeBreakdown` isolation test):

```ts
it("isolates a customerCohortAnalysis failure to its own card, defaulting to an empty array", () => {
  const raw = baseRaw();
  raw.customerCohortAnalysis = new Error("WooCommerce API error 500");

  const payload = buildDashboardPayload(raw);

  expect(payload.errors.customerCohortAnalysis).toBe(
    "WooCommerce API error 500",
  );
  expect(payload.charts.customerCohortAnalysis).toEqual([]);
});

it("passes through customerCohortAnalysis rows unchanged on success", () => {
  const raw = baseRaw();
  raw.customerCohortAnalysis = [
    { cohortMonth: "2026-06", cohortSize: 2, retentionByMonth: [50] },
  ];

  const payload = buildDashboardPayload(raw);

  expect(payload.charts.customerCohortAnalysis).toEqual([
    { cohortMonth: "2026-06", cohortSize: 2, retentionByMonth: [50] },
  ]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/analytics/normalize.test.ts`
Expected: FAIL — TypeScript error (`customerCohortAnalysis` doesn't exist on `RawPipelineResults`/`DashboardPayload`) surfaces as a Vitest failure, and the new tests fail.

- [ ] **Step 3: Implement**

1. In `src/lib/analytics/types.ts`:
   - Add `"customerCohortAnalysis"` to the `CardKey` union.
   - Add `customerCohortAnalysis: CohortRow[];` to `DashboardPayload["charts"]`.

2. In `src/lib/analytics/normalize.ts`:
   - Add `CohortRow` to the `import type { ... } from "./types";` block.
   - Add to `RawPipelineResults`: `customerCohortAnalysis: CohortRow[] | Error;`
   - In `buildDashboardPayload`'s `charts` object, add (anywhere among the other `unwrap(...)` calls):

     ```ts
     customerCohortAnalysis: unwrap(
       "customerCohortAnalysis",
       raw.customerCohortAnalysis,
       [],
     ),
     ```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/analytics/normalize.test.ts`
Expected: PASS, all tests including pre-existing ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/types.ts src/lib/analytics/normalize.ts src/lib/analytics/normalize.test.ts
git commit -m "Unwrap customerCohortAnalysis into DashboardPayload"
```

---

## Task 5: Wire into `actions.ts` (flag-gated, cached fetch)

**Files:**
- Modify: `src/lib/analytics/actions.ts`
- Test: `src/lib/analytics/actions.test.ts`

**Interfaces:**
- Consumes: `getCustomerCohortAnalysis(now?: Date): Promise<CohortRow[]>` from `./woocommerce/cohort` (Task 2); `SHOW_CUSTOMER_COHORT_ANALYSIS: boolean` from `./report-config` (Task 3); `CohortRow` from `./types`.
- Produces: `getDashboardData` now populates `RawPipelineResults.customerCohortAnalysis`.

- [ ] **Step 1: Write the failing test**

In `src/lib/analytics/actions.test.ts`:

1. Add a mock for the new module, near the other `vi.mock` calls:

```ts
vi.mock("./woocommerce/cohort", () => ({ getCustomerCohortAnalysis: vi.fn() }));
```

2. Add the import alongside the other fetcher imports:

```ts
import { getCustomerCohortAnalysis } from "./woocommerce/cohort";
```

3. In `mockHappyPath()`, add a default mock:

```ts
vi.mocked(getCustomerCohortAnalysis).mockResolvedValue([]);
```

4. Add a new test inside `describe("getDashboardData", ...)`:

```ts
it("does not fetch customer cohort analysis while its feature flag is disabled, defaulting the chart to an empty array", async () => {
  stubRealCredentials();
  mockHappyPath();

  const payload = await getDashboardData("7d");

  expect(getCustomerCohortAnalysis).not.toHaveBeenCalled();
  expect(payload.charts.customerCohortAnalysis).toEqual([]);
  expect(payload.errors.customerCohortAnalysis).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/analytics/actions.test.ts`
Expected: FAIL — TypeScript error (`RawPipelineResults` requires `customerCohortAnalysis`, not yet provided by `actions.ts`) plus the new test failing since the field doesn't exist.

- [ ] **Step 3: Implement**

In `src/lib/analytics/actions.ts`:

1. Add imports:

```ts
import { getCustomerCohortAnalysis } from "./woocommerce/cohort";
import { SHOW_CUSTOMER_COHORT_ANALYSIS } from "./report-config";
```

   Extend the existing `import type { DashboardPayload, DateRangeKey, LiveViewPayload } from "./types";` to also import `CohortRow`.

2. Add a cache binding near the other `cached*` constants (using `withCache`, not `withRangeCache`/`withFixedCache`, since this fetcher takes no `range` argument):

```ts
const cachedCustomerCohortAnalysis = withCache(
  getCustomerCohortAnalysis,
  ["wc-customer-cohort-analysis"],
  21600, // 6h — full order-history aggregation is expensive and this
         // data doesn't meaningfully change minute to minute
);
```

3. In `getDashboardData`, add a new parallel entry. Because this fetch must be skipped entirely while the flag is off (unlike every other card), build its promise conditionally rather than adding an unconditional `settle(cachedX(range))` call like the rest:

```ts
const customerCohortAnalysisPromise: Promise<CohortRow[] | Error> =
  SHOW_CUSTOMER_COHORT_ANALYSIS
    ? settle(cachedCustomerCohortAnalysis())
    : Promise.resolve<CohortRow[]>([]);
```

   Add `customerCohortAnalysisPromise` to the existing `Promise.all([...])` array and `customerCohortAnalysis` to its destructured result list, then add `customerCohortAnalysis` to the `raw: RawPipelineResults` object passed to `buildDashboardPayload`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/analytics/actions.test.ts`
Expected: PASS, all tests including pre-existing ones.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — this confirms nothing else broke from the `RawPipelineResults`/`DashboardPayload` shape change.

- [ ] **Step 6: Commit**

```bash
git add src/lib/analytics/actions.ts src/lib/analytics/actions.test.ts
git commit -m "Wire flag-gated customer cohort analysis fetch into getDashboardData"
```

---

## Task 6: Mock data

**Files:**
- Modify: `src/lib/analytics/mock-data.ts`
- Test: `src/lib/analytics/mock-data.test.ts`

**Interfaces:**
- Consumes: `addIsoMonths`, `dateToIsoMonth` from `./format` (Task 1); reuses the existing private `wave()` helper already in this file.
- Produces: `buildMockDashboardPayload(range).charts.customerCohortAnalysis: CohortRow[]`.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/analytics/mock-data.test.ts`:

```ts
describe("buildMockDashboardPayload customer cohort analysis", () => {
  it("returns 12 cohort rows with elapsed-month lengths decreasing toward the most recent", () => {
    const range = resolveDateRange("7d", NOW);
    const payload = buildMockDashboardPayload(range);

    expect(payload.charts.customerCohortAnalysis).toHaveLength(12);
    expect(
      payload.charts.customerCohortAnalysis.map(
        (row) => row.retentionByMonth.length,
      ),
    ).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it("gives every cohort row a positive cohort size and every retention value a plausible percentage", () => {
    const payload = buildMockDashboardPayload(resolveDateRange("7d", NOW));

    for (const row of payload.charts.customerCohortAnalysis) {
      expect(row.cohortSize).toBeGreaterThan(0);
      for (const value of row.retentionByMonth) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(100);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/analytics/mock-data.test.ts`
Expected: FAIL — `payload.charts.customerCohortAnalysis` is `undefined`.

- [ ] **Step 3: Implement**

In `src/lib/analytics/mock-data.ts`:

1. Add to the imports: `import { addIsoMonths, dateToIsoMonth } from "./format";` and add `CohortRow` to the `import type { ... } from "./types";` block.

2. Add a new function after the existing `sum()` helper (around line 108, before `export function buildMockDashboardPayload`):

```ts
function buildMockCohortRows(referenceDate: Date): CohortRow[] {
  const currentMonth = dateToIsoMonth(referenceDate);
  const rows: CohortRow[] = [];
  for (let i = 12; i >= 1; i--) {
    const cohortMonth = addIsoMonths(currentMonth, -i);
    const cohortIndex = 12 - i;
    const cohortSize = Math.round(wave(cohortIndex, 45, 15, 1.2));
    const retentionByMonth: number[] = [];
    for (let n = 1; n <= i; n++) {
      const decay = Math.max(3, 14 - n * 1.1);
      const value = wave(n + cohortIndex, decay, 4, cohortIndex * 0.5);
      retentionByMonth.push(Math.round(value * 10) / 10);
    }
    rows.push({ cohortMonth, cohortSize, retentionByMonth });
  }
  return rows;
}
```

3. In `buildMockDashboardPayload`'s returned `charts` object, add (right after `salesByProduct: [...]`, before the closing `},`):

```ts
      customerCohortAnalysis: buildMockCohortRows(range.current.end),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/analytics/mock-data.test.ts`
Expected: PASS, all tests including pre-existing ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/mock-data.ts src/lib/analytics/mock-data.test.ts
git commit -m "Add synthetic customer cohort analysis data to the mock payload"
```

---

## Task 7: `CustomerCohortTable` component

**Files:**
- Create: `src/components/analytics/CustomerCohortTable.tsx`
- Test: `src/components/analytics/CustomerCohortTable.test.tsx`

**Interfaces:**
- Consumes: `CohortRow` from `@/lib/analytics/types`; `formatIsoMonthLabel`, `addIsoMonths` from `@/lib/analytics/format`; `CARD_CLASS`, `LABEL_CLASS` from `./theme`.
- Produces: `export interface CustomerCohortTableProps { rows: CohortRow[]; variant?: "full" | "preview" }`; `export function CustomerCohortTable(props: CustomerCohortTableProps)`. Task 8 (home page) uses `variant="preview"`; Task 9 (report page) uses the default `"full"`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/analytics/CustomerCohortTable.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CustomerCohortTable } from "./CustomerCohortTable";
import type { CohortRow } from "@/lib/analytics/types";

function row(overrides: Partial<CohortRow> = {}): CohortRow {
  return {
    cohortMonth: "2026-01",
    cohortSize: 10,
    retentionByMonth: [20, 15, 10],
    ...overrides,
  };
}

describe("CustomerCohortTable", () => {
  it("renders one row per cohort with its formatted month label", () => {
    render(
      <CustomerCohortTable
        rows={[
          row({ cohortMonth: "2026-01" }),
          row({ cohortMonth: "2026-02" }),
        ]}
      />,
    );

    expect(screen.getByText("Jan 2026")).toBeInTheDocument();
    expect(screen.getByText("Feb 2026")).toBeInTheDocument();
  });

  it("renders a blank cell for columns beyond a shorter row's data", () => {
    render(
      <CustomerCohortTable
        rows={[
          row({ cohortMonth: "2026-01", retentionByMonth: [20, 15, 10] }),
          row({ cohortMonth: "2026-03", retentionByMonth: [5] }),
        ]}
      />,
    );

    expect(screen.getByText("20%")).toBeInTheDocument();
    expect(screen.getByText("5%")).toBeInTheDocument();
  });

  it("shows a tooltip naming the month and cohort only while a cell is hovered", () => {
    render(
      <CustomerCohortTable
        rows={[row({ cohortMonth: "2026-01", retentionByMonth: [42] })]}
      />,
    );

    expect(
      screen.queryByText("Month 1 · Jan 2026 cohort"),
    ).not.toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByText("42%"));

    expect(screen.getByText("Month 1 · Jan 2026 cohort")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Customers who returned to purchase from you in Feb 2026",
      ),
    ).toBeInTheDocument();

    fireEvent.mouseLeave(screen.getByText("42%"));

    expect(
      screen.queryByText("Month 1 · Jan 2026 cohort"),
    ).not.toBeInTheDocument();
  });

  it("preview variant shows only the last 4 rows and at most 3 columns", () => {
    const rows = [
      row({ cohortMonth: "2026-01", retentionByMonth: [1, 2, 3, 4, 5] }),
      row({ cohortMonth: "2026-02", retentionByMonth: [1, 2, 3, 4] }),
      row({ cohortMonth: "2026-03", retentionByMonth: [1, 2, 3] }),
      row({ cohortMonth: "2026-04", retentionByMonth: [1, 2] }),
      row({ cohortMonth: "2026-05", retentionByMonth: [1] }),
    ];

    render(<CustomerCohortTable rows={rows} variant="preview" />);

    expect(screen.queryByText("Jan 2026")).not.toBeInTheDocument();
    expect(screen.getByText("Feb 2026")).toBeInTheDocument();
    expect(screen.getByText("May 2026")).toBeInTheDocument();
    expect(screen.queryByText("4%")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/analytics/CustomerCohortTable.test.tsx`
Expected: FAIL — the component module does not exist yet.

- [ ] **Step 3: Implement**

Create `src/components/analytics/CustomerCohortTable.tsx`:

```tsx
"use client";

import { useState } from "react";
import { addIsoMonths, formatIsoMonthLabel } from "@/lib/analytics/format";
import type { CohortRow } from "@/lib/analytics/types";
import { CARD_CLASS, LABEL_CLASS } from "./theme";

export interface CustomerCohortTableProps {
  rows: CohortRow[];
  variant?: "full" | "preview";
}

interface HoveredCell {
  rowIndex: number;
  monthIndex: number;
}

export function CustomerCohortTable({
  rows,
  variant = "full",
}: CustomerCohortTableProps) {
  const [hovered, setHovered] = useState<HoveredCell | null>(null);

  const visibleRows = variant === "preview" ? rows.slice(-4) : rows;
  const widestRow = Math.max(
    0,
    ...visibleRows.map((row) => row.retentionByMonth.length),
  );
  const columnCount = variant === "preview" ? Math.min(widestRow, 3) : widestRow;
  const maxValue = Math.max(
    0,
    ...visibleRows.flatMap((row) => row.retentionByMonth),
  );

  function cellBackground(value: number): string {
    if (maxValue === 0) return "transparent";
    const intensity = 6 + (value / maxValue) * 80;
    return `color-mix(in srgb, var(--analytics-accent) ${intensity}%, transparent)`;
  }

  return (
    <div className={`${CARD_CLASS} overflow-x-auto`}>
      <p className={LABEL_CLASS}>Customer cohort analysis</p>
      {variant === "full" && (
        <p className="mt-1 mb-3 text-[12px] text-(--analytics-t2)">
          Returning purchase rates, with customers grouped by month of
          first purchase
        </p>
      )}
      <table className="mt-3 w-full min-w-full border-collapse text-left text-[12px]">
        <thead>
          <tr>
            <th className="py-2 pr-4 font-semibold text-(--analytics-t2)">
              Cohort
            </th>
            {columnCount > 0 && (
              <th
                colSpan={columnCount}
                className="py-2 text-center font-semibold text-(--analytics-t2)"
              >
                Months
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, rowIndex) => (
            <tr key={row.cohortMonth}>
              <td className="whitespace-nowrap py-1 pr-4 text-(--analytics-t1)">
                {formatIsoMonthLabel(row.cohortMonth)}
              </td>
              {Array.from({ length: columnCount }, (_, colIndex) => {
                const monthIndex = colIndex + 1;
                const value = row.retentionByMonth[colIndex];
                if (value === undefined) {
                  return <td key={monthIndex} className="p-1" />;
                }
                const isHovered =
                  hovered?.rowIndex === rowIndex &&
                  hovered?.monthIndex === monthIndex;
                return (
                  <td
                    key={monthIndex}
                    className="relative p-1 text-center tabular-nums text-(--analytics-t1)"
                    style={{ backgroundColor: cellBackground(value) }}
                    tabIndex={0}
                    onMouseEnter={() => setHovered({ rowIndex, monthIndex })}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered({ rowIndex, monthIndex })}
                    onBlur={() => setHovered(null)}
                  >
                    {value}%
                    {isHovered && (
                      <div className="absolute bottom-full left-1/2 z-10 mb-1 w-48 -translate-x-1/2 rounded-md border border-(--analytics-border) bg-(--analytics-surface) p-2 text-left shadow-lg">
                        <p className="text-[11px] font-semibold text-(--analytics-t1)">
                          Month {monthIndex} ·{" "}
                          {formatIsoMonthLabel(row.cohortMonth)} cohort
                        </p>
                        <p className="mt-1 text-[11px] text-(--analytics-t2)">
                          Customers who returned to purchase from you in{" "}
                          {formatIsoMonthLabel(
                            addIsoMonths(row.cohortMonth, monthIndex),
                          )}
                        </p>
                        <p className="mt-1 text-[12px] font-bold text-(--analytics-accent)">
                          {value}%
                        </p>
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/analytics/CustomerCohortTable.test.tsx`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/analytics/CustomerCohortTable.tsx src/components/analytics/CustomerCohortTable.test.tsx
git commit -m "Add CustomerCohortTable heatmap component"
```

---

## Task 8: Home page card (flag-gated)

**Files:**
- Modify: `src/app/(with-sidebar)/page.tsx`

**Interfaces:**
- Consumes: `CustomerCohortTable` (Task 7) with `variant="preview"`; `SHOW_CUSTOMER_COHORT_ANALYSIS` from `@/lib/analytics/report-config` (Task 3); `data.charts.customerCohortAnalysis` (Task 4/5).

- [ ] **Step 1: Implement**

1. Add `SHOW_CUSTOMER_COHORT_ANALYSIS` to the existing import: `import { SHOW_CUSTOMER_COHORT_ANALYSIS, SHOW_SALES_BY_CHANNEL } from "@/lib/analytics/report-config";`
2. Add `import { CustomerCohortTable } from "@/components/analytics/CustomerCohortTable";`
3. After the closing `</div>` of the last `grid grid-cols-1 gap-3 md:grid-cols-3` section (the block ending just before the component's final closing `</div></div>`), add a new full-width section:

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
```

- [ ] **Step 2: Manually verify**

No page-level tests exist for this file in this codebase today (confirmed: no `src/app/**/*.test.tsx` other than the auth API route), so verify by running the dev server:

```bash
npm run dev
```

Visit `/` with `SHOW_CUSTOMER_COHORT_ANALYSIS` temporarily flipped to `true` in `report-config.ts` (do not commit that flip — see Task 10) and confirm the preview card renders below the existing cards, links to `/reports/customer-cohort-analysis`, and shows no card at all when the flag is `false`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(with-sidebar)/page.tsx"
git commit -m "Add flag-gated customer cohort analysis card to the dashboard home page"
```

---

## Task 9: Report detail page (flag-gated)

**Files:**
- Modify: `src/app/reports/[slug]/page.tsx`

**Interfaces:**
- Consumes: `CustomerCohortTable` (Task 7) with the default `"full"` variant; `SHOW_CUSTOMER_COHORT_ANALYSIS` from `@/lib/analytics/report-config` (Task 3).

- [ ] **Step 1: Implement**

1. Add `SHOW_CUSTOMER_COHORT_ANALYSIS` to the existing `import { getReportConfig, SHOW_SALES_BY_CHANNEL, type ReportConfig } from "@/lib/analytics/report-config";`.
2. Add `import { CustomerCohortTable } from "@/components/analytics/CustomerCohortTable";`.
3. In `renderReport`'s `switch`, add a new case (e.g. after the `"total-sales-by-sales-channel"` case, following its exact gating pattern):

```tsx
case "customer-cohort-analysis": {
  // See SHOW_CUSTOMER_COHORT_ANALYSIS's comment in report-config.ts:
  // this metric has never been verified against live order data.
  // Gated here too so navigating directly to this URL can't surface
  // unverified numbers.
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
  return (
    <CustomerCohortTable rows={data.charts.customerCohortAnalysis} />
  );
}
```

- [ ] **Step 2: Manually verify**

With the dev server running (from Task 8) and the flag still temporarily flipped to `true`, visit `/reports/customer-cohort-analysis` directly and confirm the full grid renders with tooltips on hover. Flip the flag back to `false` and confirm the same URL now shows the "temporarily disabled" message instead.

- [ ] **Step 3: Commit**

```bash
git add "src/app/reports/[slug]/page.tsx"
git commit -m "Add flag-gated customer cohort analysis report detail page"
```

---

## Task 10: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Confirm the flag is off**

```bash
grep -n "SHOW_CUSTOMER_COHORT_ANALYSIS = " src/lib/analytics/report-config.ts
```

Expected: `export const SHOW_CUSTOMER_COHORT_ANALYSIS = false;` — if Task 8/9's manual verification left it flipped to `true`, fix it now.

- [ ] **Step 2: Run the full test suite**

```bash
npm run test
```

Expected: all tests pass, including every new file from Tasks 1–7.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Confirm the dashboard is unchanged with the flag off**

```bash
npm run dev
```

Visit `/` and confirm no customer-cohort-analysis card appears anywhere, and that every existing card still renders exactly as before this plan's changes.

- [ ] **Step 6: Commit (only if Step 1 required a fix)**

```bash
git add src/lib/analytics/report-config.ts
git commit -m "Ensure SHOW_CUSTOMER_COHORT_ANALYSIS stays disabled pending live verification"
```
