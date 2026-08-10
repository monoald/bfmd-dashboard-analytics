# Report Detail Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every card on `/admin/analytics` becomes clickable and navigates to a dedicated report page for that metric, matching the shape (line chart + table, simple line, donut, list, ranked bar list, or funnel) the design spec assigned to it.

**Architecture:** One dynamic route (`/admin/analytics/reports/[slug]`) driven by a static config array, rendering the same chart components already used on the dashboard at larger/standalone size. No new data fetching — this is presentation-layer only, works identically against mock or real data.

**Tech Stack:** Next.js 16 App Router (dynamic segments, `next/link`), existing Recharts-based chart components, Vitest + React Testing Library.

Full design context: `docs/superpowers/specs/2026-08-10-report-detail-pages-design.md`.

## Global Constraints

- No Controls panel, no Shopify-style chrome (breadcrumb icon, "Last refreshed" timestamp, refresh/info/more icon buttons, currency selector, Cohorts tab). The report page header reuses exactly the existing dashboard header pieces: back link, title, `DashboardDateFilter`, `ThemeToggle`. No "Live" chip on report pages.
- No per-bucket data table for donut/list/ranked/funnel report types — only the two `line-comparison` and `line-simple` shapes get a chart; only `line-comparison` gets a table (the 4 KPI-tile `line-simple` pages have no per-bucket dates to show).
- No WooCommerce/GA4 fetcher changes. Every task in this plan touches only `src/lib/analytics/{format,normalize,date-range,report-config}.ts`, `src/components/analytics/*`, and `src/app/admin/analytics/**`.
- `?range=` must be preserved in both directions: dashboard card → report page, and report page's back link → dashboard.
- A card currently rendering `CardError` is never wrapped in a `Link` — nothing to drill into.
- The two conversion-rate report pages (`conversion-rate-over-time`, `conversion-rate-breakdown`) must check `data.errors.conversionRate` in addition to their own chart-body error key, exactly like the dashboard already does (see `page.tsx`'s existing `data.errors.conversionRateOverTime || data.errors.conversionRate` pattern) — this is the same silent-error bug fixed earlier in this project; the report pages must not reintroduce it.
- Reuse `formatCurrency`/`formatPercent`/`sumSeries`/`averageSeries` from their new shared location (Task 1) — do not redefine them locally in the new report page.
- Follow the project's existing verification loop for every task: `npx tsc --noEmit` → relevant `npm test` scope → full `npm test` → `npm run lint` → `npx prettier --write` on touched files → `npm run build`. Tasks that change rendered UI additionally require a dev-server + Playwright visual check (start the server, screenshot, confirm, then kill the server and delete temp screenshot/script files — this project has no dev server left running between turns).
- This project has no tests for `src/app/**/page.tsx` files (Server Component composition) — that precedent holds for the new report page in Task 5 too; verify it via `tsc`/`build`/visual check instead of a unit test file.

---

### Task 1: Extract shared formatting and range-resolution helpers

**Files:**
- Create: `src/lib/analytics/format.ts`
- Create: `src/lib/analytics/format.test.ts`
- Modify: `src/lib/analytics/normalize.ts`
- Modify: `src/lib/analytics/normalize.test.ts`
- Modify: `src/lib/analytics/date-range.ts`
- Modify: `src/lib/analytics/date-range.test.ts`
- Modify: `src/app/admin/analytics/page.tsx`

**Interfaces:**
- Produces: `formatCurrency(value: number): string` and `formatPercent(value: number): string` from `src/lib/analytics/format.ts`.
- Produces: `sumSeries(series: TimeSeriesData[], key: "currentPeriod" | "previousPeriod"): number`, `averageSeries(series: TimeSeriesData[], key: "currentPeriod" | "previousPeriod"): number`, and `sparklineToSeries(sparkline: number[]): TimeSeriesData[]` added to `src/lib/analytics/normalize.ts` (alongside the existing `computeChange`).
- Produces: `resolveRangeKeyParam(range: string | undefined): DateRangeKey` added to `src/lib/analytics/date-range.ts` (alongside the existing `resolveDateRange`).
- Consumes: nothing new — this task only moves existing logic and adds one new pure function (`sparklineToSeries`).

This task is pure refactor plus one small addition; behavior of `page.tsx` must not change.

- [ ] **Step 1: Write the failing tests for the new format helpers**

Create `src/lib/analytics/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatCurrency, formatPercent } from "./format";

describe("formatCurrency", () => {
  it("formats a number as USD currency", () => {
    expect(formatCurrency(1234.5)).toBe("$1,234.50");
  });

  it("formats a negative number with a leading minus sign", () => {
    expect(formatCurrency(-20539.97)).toBe("-$20,539.97");
  });
});

describe("formatPercent", () => {
  it("formats a number to one decimal place with a percent sign", () => {
    expect(formatPercent(9.876)).toBe("9.9%");
  });

  it("pads whole numbers to one decimal place", () => {
    expect(formatPercent(10)).toBe("10.0%");
  });
});
```

- [ ] **Step 2: Run the new test file to verify it fails**

Run: `npm test -- format.test.ts`
Expected: FAIL — `./format` module does not exist yet.

- [ ] **Step 3: Create `format.ts`**

Create `src/lib/analytics/format.ts`:

```ts
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}
```

- [ ] **Step 4: Run the test file to verify it passes**

Run: `npm test -- format.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Add tests for the new normalize.ts helpers**

In `src/lib/analytics/normalize.test.ts`, add this import to the existing `import { ... } from "./normalize"` statement (extend it, don't duplicate the import line) so it reads:

```ts
import {
  averageSeries,
  buildDashboardPayload,
  computeChange,
  sparklineToSeries,
  sumSeries,
  type RawPipelineResults,
} from "./normalize";
```

Then add these new `describe` blocks anywhere at the top level of the file (e.g. right after the existing `computeChange` describe block, before `function revenueStats(...)`):

```ts
describe("sumSeries", () => {
  it("sums the given key across all points", () => {
    const series = [
      { date: "Aug 1", currentPeriod: 10, previousPeriod: 5 },
      { date: "Aug 2", currentPeriod: 20, previousPeriod: 8 },
    ];
    expect(sumSeries(series, "currentPeriod")).toBe(30);
    expect(sumSeries(series, "previousPeriod")).toBe(13);
  });

  it("returns 0 for an empty series", () => {
    expect(sumSeries([], "currentPeriod")).toBe(0);
  });
});

describe("averageSeries", () => {
  it("averages the given key across all points", () => {
    const series = [
      { date: "Aug 1", currentPeriod: 10, previousPeriod: 4 },
      { date: "Aug 2", currentPeriod: 20, previousPeriod: 8 },
    ];
    expect(averageSeries(series, "currentPeriod")).toBe(15);
    expect(averageSeries(series, "previousPeriod")).toBe(6);
  });

  it("returns 0 for an empty series instead of dividing by zero", () => {
    expect(averageSeries([], "currentPeriod")).toBe(0);
  });
});

describe("sparklineToSeries", () => {
  it("maps bare sparkline numbers into TimeSeriesData points with empty dates and zeroed previousPeriod", () => {
    expect(sparklineToSeries([10, 20, 30])).toEqual([
      { date: "", currentPeriod: 10, previousPeriod: 0 },
      { date: "", currentPeriod: 20, previousPeriod: 0 },
      { date: "", currentPeriod: 30, previousPeriod: 0 },
    ]);
  });

  it("returns an empty array for an empty sparkline", () => {
    expect(sparklineToSeries([])).toEqual([]);
  });
});
```

- [ ] **Step 6: Run normalize.test.ts to verify the new tests fail**

Run: `npm test -- normalize.test.ts`
Expected: FAIL — `sumSeries`, `averageSeries`, `sparklineToSeries` are not exported from `./normalize` yet.

- [ ] **Step 7: Add the three functions to `normalize.ts`**

In `src/lib/analytics/normalize.ts`, add these three exported functions. Place them right after the existing `computeChange` function (before `export interface RawPipelineResults`):

```ts
export function sumSeries(
  series: TimeSeriesData[],
  key: "currentPeriod" | "previousPeriod",
): number {
  return series.reduce((total, point) => total + point[key], 0);
}

export function averageSeries(
  series: TimeSeriesData[],
  key: "currentPeriod" | "previousPeriod",
): number {
  return series.length === 0 ? 0 : sumSeries(series, key) / series.length;
}

export function sparklineToSeries(sparkline: number[]): TimeSeriesData[] {
  return sparkline.map((value) => ({
    date: "",
    currentPeriod: value,
    previousPeriod: 0,
  }));
}
```

`TimeSeriesData` is already imported at the top of `normalize.ts` (part of the existing `import type { ... } from "./types"` block) — no new import needed.

- [ ] **Step 8: Run normalize.test.ts to verify it passes**

Run: `npm test -- normalize.test.ts`
Expected: PASS (all tests, including the new ones)

- [ ] **Step 9: Add a test for `resolveRangeKeyParam`**

Read `src/lib/analytics/date-range.test.ts` first to match its existing import style, then add an import for `resolveRangeKeyParam` alongside the existing `resolveDateRange` import, and add this describe block:

```ts
describe("resolveRangeKeyParam", () => {
  it("returns the param when it's a valid DateRangeKey", () => {
    expect(resolveRangeKeyParam("7d")).toBe("7d");
    expect(resolveRangeKeyParam("30d")).toBe("30d");
    expect(resolveRangeKeyParam("today")).toBe("today");
  });

  it("falls back to 'today' for an invalid or missing param", () => {
    expect(resolveRangeKeyParam("bogus")).toBe("today");
    expect(resolveRangeKeyParam(undefined)).toBe("today");
  });
});
```

- [ ] **Step 10: Run date-range.test.ts to verify the new test fails**

Run: `npm test -- date-range.test.ts`
Expected: FAIL — `resolveRangeKeyParam` is not exported yet.

- [ ] **Step 11: Add `resolveRangeKeyParam` to `date-range.ts`**

In `src/lib/analytics/date-range.ts`, add this at the bottom of the file (after the existing `resolveDateRange` function):

```ts
const VALID_RANGE_KEYS: DateRangeKey[] = ["today", "7d", "30d"];

export function resolveRangeKeyParam(range: string | undefined): DateRangeKey {
  return VALID_RANGE_KEYS.includes(range as DateRangeKey)
    ? (range as DateRangeKey)
    : "today";
}
```

- [ ] **Step 12: Run date-range.test.ts to verify it passes**

Run: `npm test -- date-range.test.ts`
Expected: PASS (all tests, including the new ones)

- [ ] **Step 13: Update `page.tsx` to use the shared helpers instead of local definitions**

Read `src/app/admin/analytics/page.tsx` first (it may have changed slightly since this plan was written). Then:

1. Remove the local `formatCurrency`, `formatPercent`, `sumSeries`, and `averageSeries` function definitions.
2. Remove the local `const VALID_RANGES: DateRangeKey[] = [...]` line and the `rangeKey` ternary; replace with a call to `resolveRangeKeyParam`.
3. Update imports accordingly.

The full new top of the file (everything from the first import down through the start of the `AnalyticsPage` body, replacing the current equivalent lines) should read:

```tsx
import { getDashboardData } from "@/lib/analytics/actions";
import {
  computeChange,
  averageSeries,
  sumSeries,
} from "@/lib/analytics/normalize";
import { formatCurrency, formatPercent } from "@/lib/analytics/format";
import { resolveRangeKeyParam } from "@/lib/analytics/date-range";
import { DashboardDateFilter } from "@/components/analytics/DashboardDateFilter";
import { ThemeToggle } from "@/components/analytics/ThemeToggle";
import { SummaryMetricCard } from "@/components/analytics/SummaryMetricCard";
import { TimeSeriesChart } from "@/components/analytics/TimeSeriesChart";
import { FunnelChart } from "@/components/analytics/FunnelChart";
import { DonutBreakdown } from "@/components/analytics/DonutBreakdown";
import { RankedList } from "@/components/analytics/RankedList";
import { CardError } from "@/components/analytics/CardError";
import { CHIP_CLASS } from "@/components/analytics/theme";

// On hold until we implement a correct data source for it — hidden from the
// dashboard for now, not removed.
const SHOW_SALES_BY_CHANNEL = false;

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range } = await searchParams;
  const rangeKey = resolveRangeKeyParam(range);
  const data = await getDashboardData(rangeKey);
```

Note the old `import type { DateRangeKey, TimeSeriesData } from "@/lib/analytics/types";` line is dropped entirely — after removing the `VALID_RANGES`/`sumSeries`/`averageSeries` code, neither type has any remaining reference anywhere else in this file. Everything else in the file (the rest of the component body) stays exactly as-is — do not change any JSX in this task.

- [ ] **Step 14: Verify nothing broke**

Run in order, fixing anything that fails before moving on:
```
npx tsc --noEmit
npm test
npm run lint
npx prettier --write src/lib/analytics/format.ts src/lib/analytics/normalize.ts src/lib/analytics/date-range.ts src/app/admin/analytics/page.tsx src/lib/analytics/format.test.ts src/lib/analytics/normalize.test.ts src/lib/analytics/date-range.test.ts
npm run build
```
Expected: all green, build succeeds, full test suite passes (should be 88 existing + 10 new = 98 tests; exact new count depends on final assertions written, don't worry if it's not exactly 98 — just confirm 0 failures).

- [ ] **Step 15: Manually confirm the dashboard still renders correctly**

Start the dev server (`nohup npm run dev > /tmp/nextdev-task1.log 2>&1 &`, `disown`, wait ~4s), curl `http://localhost:3000/admin/analytics` to confirm a 200, then kill the dev server processes and delete the log file. This is a refactor-only task with no visual change expected — a 200 response and a clean build together are sufficient confidence; a full Playwright screenshot isn't necessary here.

- [ ] **Step 16: Commit**

```bash
git add src/lib/analytics/format.ts src/lib/analytics/format.test.ts src/lib/analytics/normalize.ts src/lib/analytics/normalize.test.ts src/lib/analytics/date-range.ts src/lib/analytics/date-range.test.ts src/app/admin/analytics/page.tsx
git commit -m "Extract shared formatting and range-resolution helpers

formatCurrency/formatPercent/sumSeries/averageSeries were only defined
locally in page.tsx; the upcoming report detail pages need the same
formatting, so move them to shared, tested locations (format.ts,
normalize.ts) and add resolveRangeKeyParam to date-range.ts to replace
page.tsx's inline range-validation block. Pure refactor, no behavior
change."
```

---

### Task 2: Add `showComparison` prop to `TimeSeriesChart`

**Files:**
- Modify: `src/components/analytics/TimeSeriesChart.tsx`
- Modify: `src/components/analytics/TimeSeriesChart.test.tsx`

**Interfaces:**
- Produces: `TimeSeriesChartProps.showComparison?: boolean` (default `true`). When `false`, the previous-period `Area`, its `ChartTooltip` row (already conditional on the payload actually containing a `previousPeriod` entry — removing the `Area` removes that payload entry automatically, no `ChartTooltip` change needed), and the hero variant's "vs. previous period" caption are all omitted.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing test**

In `src/components/analytics/TimeSeriesChart.test.tsx`, add this test inside the existing `describe("TimeSeriesChart", ...)` block, after the "omits the 'vs. previous period' caption for the compact variant" test:

```tsx
it("hides the previous-period comparison line and caption when showComparison is false", () => {
  render(
    <TimeSeriesChart
      title="Gross sales"
      data={[{ date: "", currentPeriod: 100, previousPeriod: 0 }]}
      variant="hero"
      showComparison={false}
      headline={{ value: "$100.00", changePercentage: 5, trend: "up" }}
    />,
  );

  expect(screen.getByText("$100.00")).toBeInTheDocument();
  expect(screen.queryByText("vs. previous period")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- TimeSeriesChart`
Expected: FAIL — `showComparison` isn't a recognized prop yet, so "vs. previous period" still renders for the hero variant (the test's `queryByText(...).not.toBeInTheDocument()` assertion fails).

- [ ] **Step 3: Add the prop**

In `src/components/analytics/TimeSeriesChart.tsx`:

Add to `TimeSeriesChartProps` (after `variant?: "hero" | "compact";`):

```tsx
  // When false, hides the previous-period comparison line, its tooltip row,
  // and the "vs. previous period" caption — for series that only have a
  // single period's worth of data (e.g. KPI sparklines with no previous-
  // period values at all).
  showComparison?: boolean;
```

Add `showComparison = true` to the destructured props in the `TimeSeriesChart` function signature (after `variant = "compact",`).

Change the "vs. previous period" caption condition from `{isHero && (` to `{isHero && showComparison && (`.

Wrap the previous-period `Area` element in a conditional:

```tsx
            {showComparison && (
              <Area
                type="monotone"
                dataKey="previousPeriod"
                stroke="var(--analytics-t2)"
                strokeWidth={1.25}
                strokeDasharray="4 4"
                fill="transparent"
              />
            )}
```

(replacing the existing unconditional `<Area dataKey="previousPeriod" .../>` — the `currentPeriod` `Area` right above it stays unconditional and unchanged.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- TimeSeriesChart`
Expected: PASS (all tests, including the new one)

- [ ] **Step 5: Verify and commit**

```
npx tsc --noEmit
npm test
npm run lint
npx prettier --write src/components/analytics/TimeSeriesChart.tsx src/components/analytics/TimeSeriesChart.test.tsx
npm run build
```

```bash
git add src/components/analytics/TimeSeriesChart.tsx src/components/analytics/TimeSeriesChart.test.tsx
git commit -m "Add showComparison prop to TimeSeriesChart

KPI-tile report pages (Task 5) only have a bare sparkline number[] with
no previous-period values at all, so TimeSeriesChart needs a way to
render just the current-period line without a misleading zeroed
comparison line."
```

---

### Task 3: Add `report-config.ts`

**Files:**
- Create: `src/lib/analytics/report-config.ts`
- Create: `src/lib/analytics/report-config.test.ts`

**Interfaces:**
- Produces: `type ReportShape = "line-comparison" | "line-simple" | "donut" | "list" | "ranked" | "funnel"`; `interface ReportConfig { slug: string; title: string; cardKey: CardKey; shape: ReportShape }`; `const REPORT_CONFIGS: ReportConfig[]`; `function getReportConfig(slug: string): ReportConfig | undefined`.
- Consumes: `CardKey` from `./types`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/analytics/report-config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getReportConfig, REPORT_CONFIGS } from "./report-config";

describe("REPORT_CONFIGS", () => {
  it("has exactly 15 entries with unique slugs", () => {
    expect(REPORT_CONFIGS).toHaveLength(15);
    const slugs = REPORT_CONFIGS.map((config) => config.slug);
    expect(new Set(slugs).size).toBe(15);
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
      ]),
    );
  });
});

describe("getReportConfig", () => {
  it("finds a config by slug", () => {
    expect(getReportConfig("sessions-by-device-type")).toEqual({
      slug: "sessions-by-device-type",
      title: "Sessions by device type",
      cardKey: "sessionsByDevice",
      shape: "donut",
    });
  });

  it("returns undefined for an unknown slug", () => {
    expect(getReportConfig("not-a-real-slug")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- report-config.test.ts`
Expected: FAIL — `./report-config` module does not exist yet.

- [ ] **Step 3: Create `report-config.ts`**

Create `src/lib/analytics/report-config.ts` with exactly this content:

```ts
import type { CardKey } from "./types";

export type ReportShape =
  | "line-comparison"
  | "line-simple"
  | "donut"
  | "list"
  | "ranked"
  | "funnel";

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
```

`total-sales-by-sales-channel` is included for completeness even though it's currently unreachable from the dashboard UI (gated behind `SHOW_SALES_BY_CHANNEL`) — see Global Constraints.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- report-config.test.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Verify and commit**

```
npx tsc --noEmit
npm test
npm run lint
npx prettier --write src/lib/analytics/report-config.ts src/lib/analytics/report-config.test.ts
npm run build
```

```bash
git add src/lib/analytics/report-config.ts src/lib/analytics/report-config.test.ts
git commit -m "Add report-config.ts mapping each card to a report page slug and shape

One config array driving the upcoming dynamic report route, instead of
15 separate page files. Each of the 15 card types maps to one of 6
shared shape templates (line-comparison, line-simple, donut, list,
ranked, funnel)."
```

---

### Task 4: Add `TimeSeriesReportTable` component

**Files:**
- Create: `src/components/analytics/TimeSeriesReportTable.tsx`
- Create: `src/components/analytics/TimeSeriesReportTable.test.tsx`

**Interfaces:**
- Produces: `TimeSeriesReportTable({ data: TimeSeriesData[], formatValue: (value: number) => string })` — a plain (non-`"use client"`) Server Component-compatible component. Renders `null` for an empty `data` array. Otherwise renders a table: one row per point (bucket label, current value, previous value, `computeChange`-derived trend badge), plus a "Total" footer row summing current/previous and showing the overall change.
- Consumes: `computeChange` from `@/lib/analytics/normalize`, `TimeSeriesData` from `@/lib/analytics/types`, `CARD_CLASS`/`trendArrow`/`trendBadgeClass` from `./theme`.

- [ ] **Step 1: Write the failing test**

Create `src/components/analytics/TimeSeriesReportTable.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimeSeriesReportTable } from "./TimeSeriesReportTable";

describe("TimeSeriesReportTable", () => {
  it("renders nothing when given an empty series", () => {
    const { container } = render(
      <TimeSeriesReportTable data={[]} formatValue={(v) => `$${v}`} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders one row per bucket with current, previous, and change, plus a totals footer", () => {
    render(
      <TimeSeriesReportTable
        data={[
          { date: "Aug 1", currentPeriod: 100, previousPeriod: 80 },
          { date: "Aug 2", currentPeriod: 50, previousPeriod: 90 },
        ]}
        formatValue={(v) => `$${v.toFixed(2)}`}
      />,
    );

    expect(screen.getByText("Aug 1")).toBeInTheDocument();
    expect(screen.getByText("$100.00")).toBeInTheDocument();
    expect(screen.getByText("$80.00")).toBeInTheDocument();
    // (100-80)/80*100 = 25%
    expect(screen.getByText(/25%/)).toBeInTheDocument();

    expect(screen.getByText("Aug 2")).toBeInTheDocument();
    expect(screen.getByText("$50.00")).toBeInTheDocument();
    expect(screen.getByText("$90.00")).toBeInTheDocument();
    // (50-90)/90*100 = -44.444...%, rounds to -44.4%
    expect(screen.getByText(/44\.4%/)).toBeInTheDocument();

    // totals: current 150, previous 170 -> (150-170)/170*100 = -11.76...%, rounds to -11.8%
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("$150.00")).toBeInTheDocument();
    expect(screen.getByText("$170.00")).toBeInTheDocument();
    expect(screen.getByText(/11\.8%/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- TimeSeriesReportTable`
Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Create the component**

Create `src/components/analytics/TimeSeriesReportTable.tsx`:

```tsx
import { computeChange } from "@/lib/analytics/normalize";
import type { TimeSeriesData } from "@/lib/analytics/types";
import { CARD_CLASS, trendArrow, trendBadgeClass } from "./theme";

export interface TimeSeriesReportTableProps {
  data: TimeSeriesData[];
  formatValue: (value: number) => string;
}

function sum(
  data: TimeSeriesData[],
  key: "currentPeriod" | "previousPeriod",
): number {
  return data.reduce((total, point) => total + point[key], 0);
}

export function TimeSeriesReportTable({
  data,
  formatValue,
}: TimeSeriesReportTableProps) {
  if (data.length === 0) return null;

  const totalCurrent = sum(data, "currentPeriod");
  const totalPrevious = sum(data, "previousPeriod");
  const totalChange = computeChange(totalCurrent, totalPrevious);

  return (
    <div className={`${CARD_CLASS} overflow-x-auto`}>
      <table className="w-full min-w-full text-left text-[12px]">
        <thead>
          <tr className="border-b border-(--analytics-border) text-(--analytics-t2)">
            <th className="py-2 pr-4 font-semibold">Time</th>
            <th className="py-2 pr-4 font-semibold">Current period</th>
            <th className="py-2 pr-4 font-semibold">Previous period</th>
            <th className="py-2 font-semibold">Change</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point) => {
            const change = computeChange(
              point.currentPeriod,
              point.previousPeriod,
            );
            return (
              <tr
                key={point.date}
                className="border-b border-(--analytics-border)"
              >
                <td className="py-2 pr-4 text-(--analytics-t2)">
                  {point.date}
                </td>
                <td className="py-2 pr-4 font-semibold tabular-nums text-(--analytics-t1)">
                  {formatValue(point.currentPeriod)}
                </td>
                <td className="py-2 pr-4 tabular-nums text-(--analytics-t2)">
                  {formatValue(point.previousPeriod)}
                </td>
                <td className="py-2">
                  <span className={trendBadgeClass(change.trend)}>
                    {trendArrow(change.trend)}{" "}
                    {Math.abs(change.changePercentage)}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td className="py-2 pr-4 font-extrabold text-(--analytics-t1)">
              Total
            </td>
            <td className="py-2 pr-4 font-extrabold tabular-nums text-(--analytics-t1)">
              {formatValue(totalCurrent)}
            </td>
            <td className="py-2 pr-4 font-semibold tabular-nums text-(--analytics-t2)">
              {formatValue(totalPrevious)}
            </td>
            <td className="py-2">
              <span className={trendBadgeClass(totalChange.trend)}>
                {trendArrow(totalChange.trend)}{" "}
                {Math.abs(totalChange.changePercentage)}%
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- TimeSeriesReportTable`
Expected: PASS (both tests)

- [ ] **Step 5: Verify and commit**

```
npx tsc --noEmit
npm test
npm run lint
npx prettier --write src/components/analytics/TimeSeriesReportTable.tsx src/components/analytics/TimeSeriesReportTable.test.tsx
npm run build
```

```bash
git add src/components/analytics/TimeSeriesReportTable.tsx src/components/analytics/TimeSeriesReportTable.test.tsx
git commit -m "Add TimeSeriesReportTable for the line-comparison report shape

One row per bucket (time, current, previous, change) plus a totals
footer row. Used by the report detail page (next task) for the 4
over-time cards that have full per-bucket data."
```

---

### Task 5: Build the dynamic report page

**Files:**
- Create: `src/app/admin/analytics/reports/[slug]/page.tsx`

**Interfaces:**
- Consumes: `getDashboardData` (`@/lib/analytics/actions`), `resolveRangeKeyParam` (`@/lib/analytics/date-range`), `formatCurrency`/`formatPercent` (`@/lib/analytics/format`), `sumSeries`/`averageSeries`/`sparklineToSeries`/`computeChange` (`@/lib/analytics/normalize`), `getReportConfig`/`ReportConfig` (`@/lib/analytics/report-config`), and every existing chart component (`TimeSeriesChart`, `TimeSeriesReportTable`, `DonutBreakdown`, `RankedList`, `FunnelChart`, `CardError`, `DashboardDateFilter`, `ThemeToggle`).
- Produces: the route `/admin/analytics/reports/[slug]?range=<key>`. Unknown slugs 404 via `notFound()`.

No test file for this task — this project has no tests for `src/app/**/page.tsx` files (Server Component composition); verify via `tsc`/`build`/a Playwright visual check across a representative sample of slugs instead.

- [ ] **Step 1: Create the page**

Create `src/app/admin/analytics/reports/[slug]/page.tsx` with exactly this content:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getDashboardData } from "@/lib/analytics/actions";
import { resolveRangeKeyParam } from "@/lib/analytics/date-range";
import { formatCurrency, formatPercent } from "@/lib/analytics/format";
import {
  averageSeries,
  computeChange,
  sparklineToSeries,
  sumSeries,
} from "@/lib/analytics/normalize";
import { getReportConfig, type ReportConfig } from "@/lib/analytics/report-config";
import type { DashboardPayload } from "@/lib/analytics/types";
import { CardError } from "@/components/analytics/CardError";
import { DashboardDateFilter } from "@/components/analytics/DashboardDateFilter";
import { DonutBreakdown } from "@/components/analytics/DonutBreakdown";
import { FunnelChart } from "@/components/analytics/FunnelChart";
import { RankedList } from "@/components/analytics/RankedList";
import { ThemeToggle } from "@/components/analytics/ThemeToggle";
import { TimeSeriesChart } from "@/components/analytics/TimeSeriesChart";
import { TimeSeriesReportTable } from "@/components/analytics/TimeSeriesReportTable";

const WIDE_SLUGS = new Set([
  "total-sales-over-time",
  "average-order-value-over-time",
  "sessions-over-time",
  "conversion-rate-over-time",
]);

function renderReport(config: ReportConfig, data: DashboardPayload): ReactNode {
  switch (config.slug) {
    case "gross-sales": {
      if (data.errors.grossSales) {
        return (
          <CardError title={config.title} message={data.errors.grossSales} />
        );
      }
      const metric = data.summaryCards.grossSales;
      return (
        <TimeSeriesChart
          title={config.title}
          data={sparklineToSeries(metric.sparkline ?? [])}
          formatValue="currency"
          variant="hero"
          showComparison={false}
          headline={{
            value: formatCurrency(metric.value),
            changePercentage: metric.changePercentage,
            trend: metric.trend,
          }}
        />
      );
    }

    case "returning-customer-rate": {
      if (data.errors.returningCustomerRate) {
        return (
          <CardError
            title={config.title}
            message={data.errors.returningCustomerRate}
          />
        );
      }
      const metric = data.summaryCards.returningCustomerRate;
      return (
        <TimeSeriesChart
          title={config.title}
          data={sparklineToSeries(metric.sparkline ?? [])}
          formatValue="percent"
          variant="hero"
          showComparison={false}
          headline={{
            value: formatPercent(metric.value),
            changePercentage: metric.changePercentage,
            trend: metric.trend,
          }}
        />
      );
    }

    case "orders-fulfilled": {
      if (data.errors.ordersFulfilled) {
        return (
          <CardError
            title={config.title}
            message={data.errors.ordersFulfilled}
          />
        );
      }
      const metric = data.summaryCards.ordersFulfilled;
      return (
        <TimeSeriesChart
          title={config.title}
          data={sparklineToSeries(metric.sparkline ?? [])}
          variant="hero"
          showComparison={false}
          headline={{
            value: metric.value.toLocaleString(),
            changePercentage: metric.changePercentage,
            trend: metric.trend,
          }}
        />
      );
    }

    case "orders": {
      if (data.errors.orders) {
        return (
          <CardError title={config.title} message={data.errors.orders} />
        );
      }
      const metric = data.summaryCards.orders;
      return (
        <TimeSeriesChart
          title={config.title}
          data={sparklineToSeries(metric.sparkline ?? [])}
          variant="hero"
          showComparison={false}
          headline={{
            value: metric.value.toLocaleString(),
            changePercentage: metric.changePercentage,
            trend: metric.trend,
          }}
        />
      );
    }

    case "total-sales-over-time": {
      if (data.errors.salesOverTime) {
        return (
          <CardError title={config.title} message={data.errors.salesOverTime} />
        );
      }
      const series = data.charts.salesOverTime;
      return (
        <div className="flex flex-col gap-3">
          <TimeSeriesChart
            title={config.title}
            data={series}
            formatValue="currency"
            variant="hero"
            headline={{
              value: formatCurrency(data.summaryCards.grossSales.value),
              changePercentage: data.summaryCards.grossSales.changePercentage,
              trend: data.summaryCards.grossSales.trend,
            }}
          />
          <TimeSeriesReportTable data={series} formatValue={formatCurrency} />
        </div>
      );
    }

    case "average-order-value-over-time": {
      if (data.errors.aovOverTime) {
        return (
          <CardError title={config.title} message={data.errors.aovOverTime} />
        );
      }
      const series = data.charts.aovOverTime;
      const headline = computeChange(
        averageSeries(series, "currentPeriod"),
        averageSeries(series, "previousPeriod"),
      );
      return (
        <div className="flex flex-col gap-3">
          <TimeSeriesChart
            title={config.title}
            data={series}
            formatValue="currency"
            variant="hero"
            headline={{
              value: formatCurrency(headline.value),
              changePercentage: headline.changePercentage,
              trend: headline.trend,
            }}
          />
          <TimeSeriesReportTable data={series} formatValue={formatCurrency} />
        </div>
      );
    }

    case "sessions-over-time": {
      if (data.errors.sessionsOverTime) {
        return (
          <CardError
            title={config.title}
            message={data.errors.sessionsOverTime}
          />
        );
      }
      const series = data.charts.sessionsOverTime;
      const headline = computeChange(
        sumSeries(series, "currentPeriod"),
        sumSeries(series, "previousPeriod"),
      );
      return (
        <div className="flex flex-col gap-3">
          <TimeSeriesChart
            title={config.title}
            data={series}
            variant="hero"
            headline={{
              value: headline.value.toLocaleString(),
              changePercentage: headline.changePercentage,
              trend: headline.trend,
            }}
          />
          <TimeSeriesReportTable
            data={series}
            formatValue={(v) => v.toLocaleString()}
          />
        </div>
      );
    }

    case "conversion-rate-over-time": {
      if (data.errors.conversionRateOverTime || data.errors.conversionRate) {
        return (
          <CardError
            title={config.title}
            message={
              data.errors.conversionRateOverTime ?? data.errors.conversionRate!
            }
          />
        );
      }
      const series = data.charts.conversionRateOverTime;
      return (
        <div className="flex flex-col gap-3">
          <TimeSeriesChart
            title={config.title}
            data={series}
            formatValue="percent"
            variant="hero"
            headline={{
              value: formatPercent(data.summaryCards.conversionRate.value),
              changePercentage:
                data.summaryCards.conversionRate.changePercentage,
              trend: data.summaryCards.conversionRate.trend,
            }}
          />
          <TimeSeriesReportTable data={series} formatValue={formatPercent} />
        </div>
      );
    }

    case "total-sales-breakdown": {
      if (data.errors.salesBreakdown) {
        return (
          <CardError
            title={config.title}
            message={data.errors.salesBreakdown}
          />
        );
      }
      return (
        <RankedList
          title={config.title}
          variant="breakdown"
          items={data.charts.salesBreakdown.map((line) => ({
            name: line.label,
            value: line.value,
          }))}
          formatValue={formatCurrency}
        />
      );
    }

    case "total-sales-by-sales-channel": {
      if (data.errors.salesByChannel) {
        return (
          <CardError title={config.title} message={data.errors.salesByChannel} />
        );
      }
      return (
        <DonutBreakdown
          title={config.title}
          data={data.charts.salesByChannel}
          formatValue="currency"
        />
      );
    }

    case "total-sales-by-product": {
      if (data.errors.salesByProduct) {
        return (
          <CardError
            title={config.title}
            message={data.errors.salesByProduct}
          />
        );
      }
      return (
        <RankedList
          title={config.title}
          items={data.charts.salesByProduct}
          formatValue={formatCurrency}
        />
      );
    }

    case "sessions-by-device-type": {
      if (data.errors.sessionsByDevice) {
        return (
          <CardError
            title={config.title}
            message={data.errors.sessionsByDevice}
          />
        );
      }
      return (
        <DonutBreakdown title={config.title} data={data.charts.sessionsByDevice} />
      );
    }

    case "sessions-by-location": {
      if (data.errors.sessionsByLocation) {
        return (
          <CardError
            title={config.title}
            message={data.errors.sessionsByLocation}
          />
        );
      }
      return (
        <RankedList title={config.title} items={data.charts.sessionsByLocation} />
      );
    }

    case "total-sales-by-social-referrer": {
      if (data.errors.totalSalesBySocialReferrer) {
        return (
          <CardError
            title={config.title}
            message={data.errors.totalSalesBySocialReferrer}
          />
        );
      }
      return (
        <RankedList
          title={config.title}
          items={data.charts.totalSalesBySocialReferrer}
          formatValue={formatCurrency}
        />
      );
    }

    case "conversion-rate-breakdown": {
      if (data.errors.conversionFunnel || data.errors.conversionRate) {
        return (
          <CardError
            title={config.title}
            message={data.errors.conversionFunnel ?? data.errors.conversionRate!}
          />
        );
      }
      return (
        <FunnelChart
          title={config.title}
          steps={data.charts.conversionFunnel}
          headline={{
            value: formatPercent(data.summaryCards.conversionRate.value),
            changePercentage:
              data.summaryCards.conversionRate.changePercentage,
            trend: data.summaryCards.conversionRate.trend,
          }}
        />
      );
    }

    default:
      return null;
  }
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { slug } = await params;
  const config = getReportConfig(slug);
  if (!config) notFound();

  const { range } = await searchParams;
  const rangeKey = resolveRangeKeyParam(range);
  const data = await getDashboardData(rangeKey);

  const isWide = WIDE_SLUGS.has(config.slug);

  return (
    <div className="min-h-screen bg-(--analytics-bg) p-6">
      <div className="md:w-[90%] mx-auto text-[13px] text-(--analytics-t1) space-y-3.5">
        <div className="flex items-center justify-between border-b border-(--analytics-border) pb-4">
          <div className="flex items-center gap-2.5">
            <Link
              href={`/admin/analytics?range=${rangeKey}`}
              className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-(--analytics-accent) bg-(--analytics-accent-dim) text-[11px] font-extrabold tracking-[-0.5px] text-(--analytics-accent)"
            >
              BF
            </Link>
            <div>
              <div className="text-sm font-bold tracking-tight">
                {config.title}
              </div>
              <div className="text-[11px] text-(--analytics-t2)">
                Black Forest Supplements
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <DashboardDateFilter />
            <ThemeToggle />
          </div>
        </div>

        <div className={isWide ? "w-full" : "max-w-2xl"}>
          {renderReport(config, data)}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify types and build**

```
npx tsc --noEmit
npm run lint
npx prettier --write "src/app/admin/analytics/reports/[slug]/page.tsx"
npm run build
```

Fix any type errors before proceeding — in particular double check that every `case` string exactly matches a `slug` in `REPORT_CONFIGS` (Task 3), and that every payload path (e.g. `data.charts.salesOverTime`, `data.summaryCards.grossSales`) matches the current `DashboardPayload` shape in `src/lib/analytics/types.ts`.

- [ ] **Step 3: Visual check across a representative sample of slugs**

Start the dev server:
```bash
nohup npm run dev > /tmp/nextdev-task5.log 2>&1 &
disown
sleep 4
```

Using Playwright (see other components in this repo's history for the pattern: resolve the cached playwright package under `~/.npm/_npx/*/node_modules/playwright/index.mjs`, or use `npx playwright screenshot`), visit and screenshot at least these 5 URLs in both light and dark mode:
- `http://localhost:3000/admin/analytics/reports/gross-sales?range=7d` (line-simple)
- `http://localhost:3000/admin/analytics/reports/total-sales-over-time?range=7d` (line-comparison, with table)
- `http://localhost:3000/admin/analytics/reports/sessions-by-device-type?range=7d` (donut)
- `http://localhost:3000/admin/analytics/reports/total-sales-by-product?range=7d` (ranked)
- `http://localhost:3000/admin/analytics/reports/conversion-rate-breakdown?range=7d` (funnel)

Confirm for each: the header shows the correct title, date filter, and theme toggle; the chart/table renders with real (mock) data; no console errors. Also visit `http://localhost:3000/admin/analytics/reports/not-a-real-slug` and confirm it 404s.

Then kill the dev server processes and delete the log file and any temp screenshot/script files created for this check.

- [ ] **Step 4: Commit**

```bash
git add "src/app/admin/analytics/reports/[slug]/page.tsx"
git commit -m "Add dynamic report detail page for all 15 dashboard cards

One route (/admin/analytics/reports/[slug]) driven by report-config.ts,
dispatching to the right existing chart component per card. The two
conversion-rate report pages check errors.conversionRate in addition to
their own chart-body error key, matching the dashboard's existing fix
for that silent-error case."
```

---

### Task 6: Wire dashboard cards into links to their report pages

**Files:**
- Modify: `src/app/admin/analytics/page.tsx`

**Interfaces:**
- Consumes: `next/link`, the slug strings from `report-config.ts` (Task 3) — cross-check each hardcoded slug against `REPORT_CONFIGS` for correctness rather than importing the config array at runtime (page.tsx already hardcodes each card's title as a string literal; hardcoding the matching slug next to it keeps the same style).

No new test file — same no-page-tests precedent as Task 5; verify via `tsc`/`build`/a Playwright click-through check.

- [ ] **Step 1: Read the current file**

Read `src/app/admin/analytics/page.tsx` in full — it may have shifted slightly since Task 1 touched it. Note the exact current JSX for all 15 card render blocks (4 KPI tiles + hero chart + breakdown + salesByChannel/aov/product + sessions/conversionRateOverTime/funnel/device/location/referrer).

- [ ] **Step 2: Add the `Link` import**

Add `import Link from "next/link";` to the top of the file, alongside the other imports.

- [ ] **Step 3: Wrap every non-error card render in a `Link`**

For each of the 15 cards, wrap only the success branch (never the `<CardError>` branch) in a `<Link href="/admin/analytics/reports/<slug>?range={rangeKey}" className="block h-full">`. The slug for each card (matching `report-config.ts` from Task 3) is:

| Card title in page.tsx | Slug |
|---|---|
| "Gross sales" | `gross-sales` |
| "Returning customer rate" | `returning-customer-rate` |
| "Orders fulfilled" | `orders-fulfilled` |
| "Orders" | `orders` |
| "Total sales over time" | `total-sales-over-time` |
| "Total sales breakdown" | `total-sales-breakdown` |
| "Total sales by sales channel" | `total-sales-by-sales-channel` |
| "Average order value over time" | `average-order-value-over-time` |
| "Total sales by product" | `total-sales-by-product` |
| "Sessions over time" | `sessions-over-time` |
| "Conversion rate over time" | `conversion-rate-over-time` |
| "Conversion rate breakdown" | `conversion-rate-breakdown` |
| "Sessions by device type" | `sessions-by-device-type` |
| "Sessions by location" | `sessions-by-location` |
| "Total sales by social referrer" | `total-sales-by-social-referrer` |

For example, the "Gross sales" block changes from:

```tsx
          {data.errors.grossSales ? (
            <CardError title="Gross sales" message={data.errors.grossSales} />
          ) : (
            <SummaryMetricCard
              title="Gross sales"
              value={formatCurrency(data.summaryCards.grossSales.value)}
              changePercentage={data.summaryCards.grossSales.changePercentage}
              trend={data.summaryCards.grossSales.trend}
              sparklineData={data.summaryCards.grossSales.sparkline ?? []}
            />
          )}
```

to:

```tsx
          {data.errors.grossSales ? (
            <CardError title="Gross sales" message={data.errors.grossSales} />
          ) : (
            <Link
              href={`/admin/analytics/reports/gross-sales?range=${rangeKey}`}
              className="block h-full"
            >
              <SummaryMetricCard
                title="Gross sales"
                value={formatCurrency(data.summaryCards.grossSales.value)}
                changePercentage={data.summaryCards.grossSales.changePercentage}
                trend={data.summaryCards.grossSales.trend}
                sparklineData={data.summaryCards.grossSales.sparkline ?? []}
              />
            </Link>
          )}
```

Apply the identical pattern (wrap the success branch's single top-level element in `<Link href="/admin/analytics/reports/<slug>?range={rangeKey}" className="block h-full">...</Link>`) to all 15 cards using the slug table above. This includes the `SHOW_SALES_BY_CHANNEL &&` conditional block — wrap just the `<DonutBreakdown>` (not the `<CardError>`) inside that block's ternary the same way.

Do not change anything else in the file — no prop values, no data logic, no imports beyond adding `next/link`.

- [ ] **Step 4: Verify types and build**

```
npx tsc --noEmit
npm test
npm run lint
npx prettier --write src/app/admin/analytics/page.tsx
npm run build
```

- [ ] **Step 5: Click-through visual check**

Start the dev server, then using Playwright: load `/admin/analytics?range=7d`, click on 3-4 different cards spanning different shapes (e.g. a KPI tile, the hero chart, a ranked list, the funnel), and confirm each click navigates to the matching `/admin/analytics/reports/<slug>?range=7d` URL and renders the correct report. Also confirm the report page's back link (the "BF" box) returns to `/admin/analytics?range=7d`. Then kill the dev server and delete any temp files.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/analytics/page.tsx
git commit -m "Make every dashboard card a link to its report detail page

Wraps each card's success-state render (never its CardError state) in a
Link to /admin/analytics/reports/<slug>, preserving the current ?range=
so the report page opens on the same period the user was viewing."
```

---

## Final Review

After all 6 tasks are complete and committed, run the full verification suite one more time (`npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build`) and do one more Playwright pass over the main dashboard plus 3-4 report pages in both light and dark mode, confirming:
- Every one of the 15 cards is clickable and lands on a correctly-shaped report page.
- No card renders inside a `Link` when it's in its `CardError` state.
- `?range=` is preserved in both directions.
- The two conversion-rate report pages correctly show an error instead of a fake headline if `errors.conversionRate` is set (this can be smoke-tested by temporarily forcing `hasRealCredentials()` or an error in a scratch script rather than needing real broken credentials — or simply confirm by code review that both the dashboard and both new report-page branches use the identical `X || data.errors.conversionRate` condition).

Then proceed to `superpowers:finishing-a-development-branch`.
