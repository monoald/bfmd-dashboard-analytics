# E-commerce Analytics Dashboard (Pass 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/admin/analytics` Overview page — a WooCommerce + GA4-backed dashboard replicating Shopify's combined Sessions + Sales analytics view, per `docs/superpowers/specs/2026-08-07-ecommerce-analytics-dashboard-design.md`.

**Architecture:** Two isolated server-side data pipelines (`src/lib/analytics/woocommerce/`, `src/lib/analytics/ga4/`) produce raw typed results, which `src/lib/analytics/normalize.ts` maps into a single `DashboardPayload`. A Server Action (`src/lib/analytics/actions.ts`) orchestrates both pipelines per-request with per-card error isolation and `unstable_cache`-based caching, and a Server Component page renders the result using six reusable card components.

**Tech Stack:** Next.js 16 (App Router, `src/` dir), TypeScript, Tailwind CSS v4, shadcn/ui, Recharts, `@google-analytics/data`, Vitest + React Testing Library (added in this plan — needed to unit-test the date-math, normalization, and revenue-aggregation logic that this feature depends on).

## Global Constraints

- Real WooCommerce and GA4 credentials are used directly — no mock-data layer.
- Revenue pipeline uses the WooCommerce **Analytics REST API** (`/wc-analytics/reports/*`), not the legacy `/wc/v3/reports/*` endpoints — except the sales-by-channel card, which reads raw `/wc/v3/orders` because `created_via` isn't exposed by the Analytics API.
- Revenue source of truth is WooCommerce for every card except referrer-attributed revenue ("Total sales by social referrer"), which is sourced from GA4's `purchaseRevenue` metric. These two revenue numbers are not expected to reconcile.
- "Previous period" = the immediately preceding period of equal length (e.g. Last 7 Days → the 7 days before that; Today → yesterday).
- Caching: every WC-Analytics and GA4 fetcher is wrapped in `unstable_cache`, revalidate 300s for "Today" and 3600s for "Last 7/30 Days". The sales-by-channel aggregation always uses a fixed 14400s (4h) TTL regardless of range, since it's the heaviest query (full order pagination).
- `/admin/analytics` has no auth gate in this pass.
- Styling: Tailwind CSS, page background `#F6F6F7`, cards `bg-white rounded-xl shadow-sm border border-gray-200`, values `text-2xl font-semibold`, Inter font via `next/font`.
- Pipelines are isolated: a WC or GA4 failure only degrades the cards it feeds (shown via an inline `CardError`), never the whole page.
- Package manager: npm. Import alias: `@/*` → `./src/*`.

---

### Task 1: Set Up Vitest Testing Infrastructure

**Files:**
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `src/lib/analytics/smoke.test.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces: `npm test` command available to every later task.

- [ ] **Step 1: Install test dependencies**

```bash
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @vitejs/plugin-react vite-tsconfig-paths
```

- [ ] **Step 2: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
  },
});
```

- [ ] **Step 3: Create `vitest.setup.ts`**

```typescript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Add test scripts to `package.json`**

Add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Write a failing smoke test**

`src/lib/analytics/smoke.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

describe("vitest setup", () => {
  it("runs a basic assertion", () => {
    expect(1 + 1).toBe(3);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `expected 2 to be 3`

- [ ] **Step 7: Fix the assertion**

```typescript
import { describe, expect, it } from "vitest";

describe("vitest setup", () => {
  it("runs a basic assertion", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add vitest.config.ts vitest.setup.ts src/lib/analytics/smoke.test.ts package.json package-lock.json
git commit -m "test: add Vitest + React Testing Library infrastructure"
```

---

### Task 2: Shared Types + Date Range Resolution

**Files:**
- Create: `src/lib/analytics/types.ts`
- Create: `src/lib/analytics/date-range.ts`
- Test: `src/lib/analytics/date-range.test.ts`

**Interfaces:**
- Produces: `DateRangeKey`, `PeriodBounds`, `ResolvedDateRange`, `ChangeMetric`, `TimeSeriesData`, `NamedValue`, `FunnelStep`, `SalesBreakdownLine`, `CardKey`, `DashboardPayload` (all from `types.ts`); `resolveDateRange(key: DateRangeKey, now: Date): ResolvedDateRange` (from `date-range.ts`). Every later task in `src/lib/analytics/` and `src/components/analytics/` imports from these two files.

- [ ] **Step 1: Create `src/lib/analytics/types.ts`**

```typescript
export type DateRangeKey = "today" | "7d" | "30d";

export interface PeriodBounds {
  start: Date;
  end: Date;
}

export interface ResolvedDateRange {
  key: DateRangeKey;
  interval: "hour" | "day";
  current: PeriodBounds;
  previous: PeriodBounds;
}

export interface ChangeMetric {
  value: number;
  changePercentage: number;
  trend: "up" | "down";
  sparkline?: number[];
}

export interface TimeSeriesData {
  date: string;
  currentPeriod: number;
  previousPeriod: number;
}

export interface NamedValue {
  name: string;
  value: number;
}

export interface FunnelStep {
  step: string;
  sessions: number;
  percentage: number;
}

export interface SalesBreakdownLine {
  label: string;
  value: number;
}

export type CardKey =
  | "grossSales"
  | "conversionRate"
  | "ordersFulfilled"
  | "orders"
  | "returningCustomerRate"
  | "sessionsOverTime"
  | "conversionRateOverTime"
  | "conversionFunnel"
  | "sessionsByDevice"
  | "sessionsByLocation"
  | "totalSalesBySocialReferrer"
  | "salesOverTime"
  | "salesBreakdown"
  | "salesByChannel"
  | "aovOverTime"
  | "salesByProduct";

export interface DashboardPayload {
  summaryCards: {
    grossSales: ChangeMetric;
    conversionRate: ChangeMetric;
    ordersFulfilled: ChangeMetric;
    orders: ChangeMetric;
    returningCustomerRate: ChangeMetric;
  };
  charts: {
    sessionsOverTime: TimeSeriesData[];
    conversionRateOverTime: TimeSeriesData[];
    conversionFunnel: FunnelStep[];
    sessionsByDevice: NamedValue[];
    sessionsByLocation: NamedValue[];
    totalSalesBySocialReferrer: NamedValue[];
    salesOverTime: TimeSeriesData[];
    salesBreakdown: SalesBreakdownLine[];
    salesByChannel: NamedValue[];
    aovOverTime: TimeSeriesData[];
    salesByProduct: NamedValue[];
  };
  errors: Partial<Record<CardKey, string>>;
}
```

- [ ] **Step 2: Write failing tests for `resolveDateRange`**

`src/lib/analytics/date-range.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { resolveDateRange } from "./date-range";

describe("resolveDateRange", () => {
  it("resolves 'today' to today vs. yesterday, hourly interval", () => {
    const now = new Date(2026, 7, 7, 15, 30, 0);
    const range = resolveDateRange("today", now);

    expect(range.interval).toBe("hour");
    expect(range.current.start.toISOString().slice(0, 10)).toBe("2026-08-07");
    expect(range.current.end.toISOString().slice(0, 10)).toBe("2026-08-07");
    expect(range.previous.start.toISOString().slice(0, 10)).toBe("2026-08-06");
    expect(range.previous.end.toISOString().slice(0, 10)).toBe("2026-08-06");
  });

  it("resolves '7d' to the last 7 days vs. the 7 days before, daily interval", () => {
    const now = new Date(2026, 7, 7, 15, 30, 0);
    const range = resolveDateRange("7d", now);

    expect(range.interval).toBe("day");
    expect(range.current.start.getDate()).toBe(1);
    expect(range.current.end.getDate()).toBe(7);
    expect(range.previous.start.getDate()).toBe(25);
    expect(range.previous.start.getMonth()).toBe(6); // July
    expect(range.previous.end.getDate()).toBe(31);
    expect(range.previous.end.getMonth()).toBe(6); // July
  });

  it("resolves '30d' to a 30-day current period and a 30-day previous period immediately before it", () => {
    const now = new Date(2026, 7, 7, 15, 30, 0);
    const range = resolveDateRange("30d", now);

    const currentLengthMs = range.current.end.getTime() - range.current.start.getTime();
    const previousLengthMs = range.previous.end.getTime() - range.previous.start.getTime();

    expect(Math.round(currentLengthMs / (24 * 60 * 60 * 1000))).toBe(30);
    expect(Math.round(previousLengthMs / (24 * 60 * 60 * 1000))).toBe(30);
    expect(range.previous.end.getTime()).toBeLessThan(range.current.start.getTime());
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- date-range`
Expected: FAIL — `Cannot find module './date-range'`

- [ ] **Step 4: Implement `src/lib/analytics/date-range.ts`**

```typescript
import type { DateRangeKey, ResolvedDateRange } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function resolveDateRange(key: DateRangeKey, now: Date): ResolvedDateRange {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (key === "today") {
    return {
      key,
      interval: "hour",
      current: { start: startOfToday, end: endOfToday },
      previous: {
        start: new Date(startOfToday.getTime() - DAY_MS),
        end: new Date(endOfToday.getTime() - DAY_MS),
      },
    };
  }

  const lengthDays = key === "7d" ? 7 : 30;
  const currentStart = new Date(endOfToday.getTime() - (lengthDays - 1) * DAY_MS);
  const currentStartMidnight = new Date(
    currentStart.getFullYear(),
    currentStart.getMonth(),
    currentStart.getDate(),
    0,
    0,
    0,
    0
  );
  const previousEnd = new Date(currentStartMidnight.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - (lengthDays - 1) * DAY_MS);
  const previousStartMidnight = new Date(
    previousStart.getFullYear(),
    previousStart.getMonth(),
    previousStart.getDate(),
    0,
    0,
    0,
    0
  );

  return {
    key,
    interval: "day",
    current: { start: currentStartMidnight, end: endOfToday },
    previous: { start: previousStartMidnight, end: previousEnd },
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- date-range`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/analytics/types.ts src/lib/analytics/date-range.ts src/lib/analytics/date-range.test.ts
git commit -m "feat: add analytics shared types and date range resolution"
```

---

### Task 3: `computeChange` Helper

**Files:**
- Create: `src/lib/analytics/normalize.ts`
- Test: `src/lib/analytics/normalize.test.ts`

**Interfaces:**
- Consumes: `ChangeMetric` (from `./types`).
- Produces: `computeChange(current: number, previous: number): ChangeMetric`. Used by every fetcher-consuming task from Task 12 onward.

- [ ] **Step 1: Write failing tests**

`src/lib/analytics/normalize.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { computeChange } from "./normalize";

describe("computeChange", () => {
  it("computes a positive change", () => {
    expect(computeChange(120, 100)).toEqual({ value: 120, changePercentage: 20, trend: "up" });
  });

  it("computes a negative change", () => {
    expect(computeChange(80, 100)).toEqual({ value: 80, changePercentage: -20, trend: "down" });
  });

  it("treats a zero previous value with positive current as a 100% increase", () => {
    expect(computeChange(50, 0)).toEqual({ value: 50, changePercentage: 100, trend: "up" });
  });

  it("treats zero vs. zero as no change", () => {
    expect(computeChange(0, 0)).toEqual({ value: 0, changePercentage: 0, trend: "up" });
  });

  it("rounds to one decimal place", () => {
    expect(computeChange(103, 100).changePercentage).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- normalize`
Expected: FAIL — `Cannot find module './normalize'`

- [ ] **Step 3: Implement `computeChange` in `src/lib/analytics/normalize.ts`**

```typescript
import type { ChangeMetric } from "./types";

export function computeChange(current: number, previous: number): ChangeMetric {
  if (previous === 0) {
    return {
      value: current,
      changePercentage: current === 0 ? 0 : 100,
      trend: current >= 0 ? "up" : "down",
    };
  }

  const changePercentage = Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
  return {
    value: current,
    changePercentage,
    trend: changePercentage >= 0 ? "up" : "down",
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- normalize`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/normalize.ts src/lib/analytics/normalize.test.ts
git commit -m "feat: add computeChange helper for period-over-period metrics"
```

---

### Task 4: WooCommerce API Client

**Files:**
- Create: `src/lib/analytics/woocommerce/client.ts`
- Test: `src/lib/analytics/woocommerce/client.test.ts`
- Create: `.env.example`

**Interfaces:**
- Produces: `WooCommerceApiError`, `fetchWc<T>(path: string, params?: Record<string,string>): Promise<T>`, `fetchWcCount(path: string, params?: Record<string,string>): Promise<number>`. Used by every `src/lib/analytics/woocommerce/*.ts` fetcher.

- [ ] **Step 1: Write failing tests**

`src/lib/analytics/woocommerce/client.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWc, fetchWcCount, WooCommerceApiError } from "./client";

describe("WooCommerce client", () => {
  beforeEach(() => {
    vi.stubEnv("WC_STORE_URL", "https://store.example.com");
    vi.stubEnv("WC_CONSUMER_KEY", "ck_test");
    vi.stubEnv("WC_CONSUMER_SECRET", "cs_test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("builds the request URL, query params, and Basic Auth header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hello: "world" }),
      headers: new Headers(),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchWc<{ hello: string }>("/wc-analytics/reports/orders", { status: "completed" });

    expect(result).toEqual({ hello: "world" });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://store.example.com/wc-analytics/reports/orders?status=completed");
    expect(options.headers.Authorization).toBe(`Basic ${Buffer.from("ck_test:cs_test").toString("base64")}`);
  });

  it("throws WooCommerceApiError on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "Unauthorized" })
    );

    await expect(fetchWc("/wc-analytics/reports/orders")).rejects.toThrow(WooCommerceApiError);
  });

  it("throws when environment variables are missing", async () => {
    vi.unstubAllEnvs();
    await expect(fetchWc("/wc-analytics/reports/orders")).rejects.toThrow(/Missing WooCommerce/);
  });

  it("reads the total count from the X-WP-Total header, forcing per_page=1", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
      headers: new Headers({ "X-WP-Total": "42" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const count = await fetchWcCount("/wc-analytics/reports/orders", { status: "completed" });

    expect(count).toBe(42);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("per_page=1");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- woocommerce/client`
Expected: FAIL — `Cannot find module './client'`

- [ ] **Step 3: Implement `src/lib/analytics/woocommerce/client.ts`**

```typescript
export class WooCommerceApiError extends Error {
  constructor(public status: number, public path: string, message: string) {
    super(`WooCommerce API error ${status} for ${path}: ${message}`);
    this.name = "WooCommerceApiError";
  }
}

interface WcCredentials {
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

function getCredentials(): WcCredentials {
  const storeUrl = process.env.WC_STORE_URL;
  const consumerKey = process.env.WC_CONSUMER_KEY;
  const consumerSecret = process.env.WC_CONSUMER_SECRET;

  if (!storeUrl || !consumerKey || !consumerSecret) {
    throw new Error("Missing WooCommerce environment variables (WC_STORE_URL, WC_CONSUMER_KEY, WC_CONSUMER_SECRET)");
  }
  return { storeUrl, consumerKey, consumerSecret };
}

async function wcRequest(path: string, params: Record<string, string>): Promise<Response> {
  const { storeUrl, consumerKey, consumerSecret } = getCredentials();
  const url = new URL(path, storeUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
  const response = await fetch(url.toString(), { headers: { Authorization: `Basic ${credentials}` } });

  if (!response.ok) {
    const body = await response.text();
    throw new WooCommerceApiError(response.status, path, body);
  }
  return response;
}

export async function fetchWc<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const response = await wcRequest(path, params);
  return (await response.json()) as T;
}

export async function fetchWcCount(path: string, params: Record<string, string> = {}): Promise<number> {
  const response = await wcRequest(path, { ...params, per_page: "1" });
  return Number(response.headers.get("X-WP-Total") ?? "0");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- woocommerce/client`
Expected: PASS

- [ ] **Step 5: Create `.env.example`**

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

- [ ] **Step 6: Commit**

```bash
git add src/lib/analytics/woocommerce/client.ts src/lib/analytics/woocommerce/client.test.ts .env.example
git commit -m "feat: add WooCommerce API client with Basic Auth and count helper"
```

---

### Task 5: Cache Helpers

**Files:**
- Create: `src/lib/analytics/cache.ts`
- Test: `src/lib/analytics/cache.test.ts`

**Interfaces:**
- Consumes: `ResolvedDateRange` (from `./types`), `unstable_cache` (from `next/cache`).
- Produces: `withRangeCache<T>(fn: (range: ResolvedDateRange) => Promise<T>, keyPrefix: string): (range: ResolvedDateRange) => Promise<T>`, `withFixedCache<T>(fn: (range: ResolvedDateRange) => Promise<T>, keyPrefix: string, revalidateSeconds: number): (range: ResolvedDateRange) => Promise<T>`. Used by `src/lib/analytics/actions.ts` (Task 15).

- [ ] **Step 1: Write failing tests**

`src/lib/analytics/cache.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import type { ResolvedDateRange } from "./types";

vi.mock("next/cache", () => ({
  unstable_cache: vi.fn((fn: unknown) => fn),
}));

import { unstable_cache } from "next/cache";
import { withFixedCache, withRangeCache } from "./cache";

const todayRange: ResolvedDateRange = {
  key: "today",
  interval: "hour",
  current: { start: new Date(), end: new Date() },
  previous: { start: new Date(), end: new Date() },
};

const sevenDayRange: ResolvedDateRange = { ...todayRange, key: "7d", interval: "day" };

describe("withRangeCache", () => {
  it("wraps the function with a 300s cache keyed 'today' and a 3600s cache keyed 'range'", async () => {
    const fn = vi.fn().mockResolvedValue("result");
    withRangeCache(fn, "test-prefix");

    expect(unstable_cache).toHaveBeenCalledWith(fn, ["test-prefix", "today"], { revalidate: 300 });
    expect(unstable_cache).toHaveBeenCalledWith(fn, ["test-prefix", "range"], { revalidate: 3600 });
  });

  it("calls the underlying function for both today and longer ranges", async () => {
    const fn = vi.fn().mockResolvedValue("result");
    const cached = withRangeCache(fn, "test-prefix");

    await cached(todayRange);
    await cached(sevenDayRange);

    expect(fn).toHaveBeenCalledWith(todayRange);
    expect(fn).toHaveBeenCalledWith(sevenDayRange);
  });
});

describe("withFixedCache", () => {
  it("wraps the function with the given fixed revalidate time regardless of range", () => {
    const fn = vi.fn().mockResolvedValue("result");
    withFixedCache(fn, "fixed-prefix", 14400);

    expect(unstable_cache).toHaveBeenCalledWith(fn, ["fixed-prefix"], { revalidate: 14400 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- cache`
Expected: FAIL — `Cannot find module './cache'`

- [ ] **Step 3: Implement `src/lib/analytics/cache.ts`**

```typescript
import { unstable_cache } from "next/cache";
import type { ResolvedDateRange } from "./types";

export function withRangeCache<T>(
  fn: (range: ResolvedDateRange) => Promise<T>,
  keyPrefix: string
): (range: ResolvedDateRange) => Promise<T> {
  const shortCache = unstable_cache(fn, [keyPrefix, "today"], { revalidate: 300 });
  const longCache = unstable_cache(fn, [keyPrefix, "range"], { revalidate: 3600 });
  return (range: ResolvedDateRange) => (range.key === "today" ? shortCache(range) : longCache(range));
}

export function withFixedCache<T>(
  fn: (range: ResolvedDateRange) => Promise<T>,
  keyPrefix: string,
  revalidateSeconds: number
): (range: ResolvedDateRange) => Promise<T> {
  return unstable_cache(fn, [keyPrefix], { revalidate: revalidateSeconds });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- cache`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/cache.ts src/lib/analytics/cache.test.ts
git commit -m "feat: add unstable_cache wrappers for range-based and fixed TTL caching"
```

---

### Task 6: WooCommerce Revenue Stats Fetcher

**Files:**
- Create: `src/lib/analytics/woocommerce/revenue.ts`
- Test: `src/lib/analytics/woocommerce/revenue.test.ts`

**Interfaces:**
- Consumes: `fetchWc` (from `./client`), `ResolvedDateRange`, `PeriodBounds` (from `../types`).
- Produces: `RevenueStatsInterval`, `RevenueStatsTotals`, `RevenueStatsResult`, `getRevenueStats(range: ResolvedDateRange): Promise<{ current: RevenueStatsResult; previous: RevenueStatsResult }>`. Consumed by `src/lib/analytics/normalize.ts` (Task 14) and `src/lib/analytics/actions.ts` (Task 15).

- [ ] **Step 1: Write failing tests**

`src/lib/analytics/woocommerce/revenue.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import type { ResolvedDateRange } from "../types";

vi.mock("./client", () => ({ fetchWc: vi.fn() }));

import { fetchWc } from "./client";
import { getRevenueStats } from "./revenue";

const range: ResolvedDateRange = {
  key: "7d",
  interval: "day",
  current: { start: new Date("2026-08-01"), end: new Date("2026-08-07") },
  previous: { start: new Date("2026-07-25"), end: new Date("2026-07-31") },
};

function rawResponse(grossSales: number) {
  return {
    intervals: [
      {
        date_start: "2026-08-01 00:00:00",
        subtotals: {
          gross_sales: grossSales,
          net_revenue: grossSales - 10,
          coupons: 5,
          refunds: 2,
          shipping: 8,
          taxes: 3,
          total_sales: grossSales - 10 + 8 + 3,
          orders_count: 4,
        },
      },
    ],
  };
}

describe("getRevenueStats", () => {
  it("fetches both current and previous periods with the resolved interval", async () => {
    vi.mocked(fetchWc).mockResolvedValueOnce(rawResponse(100)).mockResolvedValueOnce(rawResponse(80));

    await getRevenueStats(range);

    expect(fetchWc).toHaveBeenCalledWith(
      "/wc-analytics/reports/revenue/stats",
      expect.objectContaining({ interval: "day", after: range.current.start.toISOString(), before: range.current.end.toISOString() })
    );
    expect(fetchWc).toHaveBeenCalledWith(
      "/wc-analytics/reports/revenue/stats",
      expect.objectContaining({ interval: "day", after: range.previous.start.toISOString(), before: range.previous.end.toISOString() })
    );
  });

  it("maps WC subtotal fields to typed intervals and sums totals, including average order value", async () => {
    vi.mocked(fetchWc).mockResolvedValueOnce(rawResponse(100)).mockResolvedValueOnce(rawResponse(80));

    const result = await getRevenueStats(range);

    expect(result.current.intervals[0]).toEqual({
      date: "2026-08-01 00:00:00",
      grossSales: 100,
      netRevenue: 90,
      discounts: 5,
      refunds: 2,
      shipping: 8,
      taxes: 3,
      totalSales: 101,
      ordersCount: 4,
    });
    expect(result.current.totals.grossSales).toBe(100);
    expect(result.current.totals.ordersCount).toBe(4);
    expect(result.current.totals.averageOrderValue).toBe(90 / 4);
    expect(result.previous.totals.grossSales).toBe(80);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- woocommerce/revenue`
Expected: FAIL — `Cannot find module './revenue'`

- [ ] **Step 3: Implement `src/lib/analytics/woocommerce/revenue.ts`**

```typescript
import { fetchWc } from "./client";
import type { PeriodBounds, ResolvedDateRange } from "../types";

interface WcRevenueStatsResponse {
  intervals: Array<{
    date_start: string;
    subtotals: {
      gross_sales: number;
      net_revenue: number;
      coupons: number;
      refunds: number;
      shipping: number;
      taxes: number;
      total_sales: number;
      orders_count: number;
    };
  }>;
}

export interface RevenueStatsInterval {
  date: string;
  grossSales: number;
  netRevenue: number;
  discounts: number;
  refunds: number;
  shipping: number;
  taxes: number;
  totalSales: number;
  ordersCount: number;
}

export interface RevenueStatsTotals {
  grossSales: number;
  netRevenue: number;
  discounts: number;
  refunds: number;
  shipping: number;
  taxes: number;
  totalSales: number;
  ordersCount: number;
  averageOrderValue: number;
}

export interface RevenueStatsResult {
  intervals: RevenueStatsInterval[];
  totals: RevenueStatsTotals;
}

function sumTotals(intervals: RevenueStatsInterval[]): RevenueStatsTotals {
  const totals = intervals.reduce(
    (acc, i) => ({
      grossSales: acc.grossSales + i.grossSales,
      netRevenue: acc.netRevenue + i.netRevenue,
      discounts: acc.discounts + i.discounts,
      refunds: acc.refunds + i.refunds,
      shipping: acc.shipping + i.shipping,
      taxes: acc.taxes + i.taxes,
      totalSales: acc.totalSales + i.totalSales,
      ordersCount: acc.ordersCount + i.ordersCount,
    }),
    { grossSales: 0, netRevenue: 0, discounts: 0, refunds: 0, shipping: 0, taxes: 0, totalSales: 0, ordersCount: 0 }
  );
  return {
    ...totals,
    averageOrderValue: totals.ordersCount === 0 ? 0 : totals.netRevenue / totals.ordersCount,
  };
}

async function fetchRevenueStatsForPeriod(period: PeriodBounds, interval: "hour" | "day"): Promise<RevenueStatsResult> {
  const raw = await fetchWc<WcRevenueStatsResponse>("/wc-analytics/reports/revenue/stats", {
    after: period.start.toISOString(),
    before: period.end.toISOString(),
    interval,
  });

  const intervals: RevenueStatsInterval[] = raw.intervals.map((i) => ({
    date: i.date_start,
    grossSales: i.subtotals.gross_sales,
    netRevenue: i.subtotals.net_revenue,
    discounts: i.subtotals.coupons,
    refunds: i.subtotals.refunds,
    shipping: i.subtotals.shipping,
    taxes: i.subtotals.taxes,
    totalSales: i.subtotals.total_sales,
    ordersCount: i.subtotals.orders_count,
  }));

  return { intervals, totals: sumTotals(intervals) };
}

export async function getRevenueStats(
  range: ResolvedDateRange
): Promise<{ current: RevenueStatsResult; previous: RevenueStatsResult }> {
  const [current, previous] = await Promise.all([
    fetchRevenueStatsForPeriod(range.current, range.interval),
    fetchRevenueStatsForPeriod(range.previous, range.interval),
  ]);
  return { current, previous };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- woocommerce/revenue`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/woocommerce/revenue.ts src/lib/analytics/woocommerce/revenue.test.ts
git commit -m "feat: add WooCommerce revenue stats fetcher"
```

---

### Task 7: WooCommerce Orders-Fulfilled + Returning-Customer-Rate Fetchers

**Files:**
- Create: `src/lib/analytics/woocommerce/orders.ts`
- Create: `src/lib/analytics/woocommerce/customers.ts`
- Test: `src/lib/analytics/woocommerce/orders.test.ts`
- Test: `src/lib/analytics/woocommerce/customers.test.ts`

**Interfaces:**
- Consumes: `fetchWc`, `fetchWcCount` (from `./client`), `ResolvedDateRange` (from `../types`).
- Produces: `getOrdersFulfilled(range: ResolvedDateRange): Promise<{ current: number; previous: number }>`, `getReturningCustomerRate(range: ResolvedDateRange): Promise<{ current: number; previous: number }>`. Consumed by `src/lib/analytics/normalize.ts` (Task 14) and `src/lib/analytics/actions.ts` (Task 15).

- [ ] **Step 1: Write failing test for orders**

`src/lib/analytics/woocommerce/orders.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import type { ResolvedDateRange } from "../types";

vi.mock("./client", () => ({ fetchWcCount: vi.fn() }));

import { fetchWcCount } from "./client";
import { getOrdersFulfilled } from "./orders";

const range: ResolvedDateRange = {
  key: "7d",
  interval: "day",
  current: { start: new Date("2026-08-01"), end: new Date("2026-08-07") },
  previous: { start: new Date("2026-07-25"), end: new Date("2026-07-31") },
};

describe("getOrdersFulfilled", () => {
  it("counts completed orders for current and previous periods", async () => {
    vi.mocked(fetchWcCount).mockResolvedValueOnce(12).mockResolvedValueOnce(9);

    const result = await getOrdersFulfilled(range);

    expect(result).toEqual({ current: 12, previous: 9 });
    expect(fetchWcCount).toHaveBeenCalledWith(
      "/wc-analytics/reports/orders",
      expect.objectContaining({ status: "completed", after: range.current.start.toISOString(), before: range.current.end.toISOString() })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- woocommerce/orders`
Expected: FAIL — `Cannot find module './orders'`

- [ ] **Step 3: Implement `src/lib/analytics/woocommerce/orders.ts`**

```typescript
import { fetchWcCount } from "./client";
import type { ResolvedDateRange } from "../types";

export async function getOrdersFulfilled(range: ResolvedDateRange): Promise<{ current: number; previous: number }> {
  const [current, previous] = await Promise.all([
    fetchWcCount("/wc-analytics/reports/orders", {
      status: "completed",
      after: range.current.start.toISOString(),
      before: range.current.end.toISOString(),
    }),
    fetchWcCount("/wc-analytics/reports/orders", {
      status: "completed",
      after: range.previous.start.toISOString(),
      before: range.previous.end.toISOString(),
    }),
  ]);
  return { current, previous };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- woocommerce/orders`
Expected: PASS

- [ ] **Step 5: Write failing test for returning customer rate**

`src/lib/analytics/woocommerce/customers.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import type { ResolvedDateRange } from "../types";

vi.mock("./client", () => ({ fetchWc: vi.fn() }));

import { fetchWc } from "./client";
import { getReturningCustomerRate } from "./customers";

const range: ResolvedDateRange = {
  key: "7d",
  interval: "day",
  current: { start: new Date("2026-08-01"), end: new Date("2026-08-07") },
  previous: { start: new Date("2026-07-25"), end: new Date("2026-07-31") },
};

describe("getReturningCustomerRate", () => {
  it("computes the percentage of customers with more than one order", async () => {
    vi.mocked(fetchWc)
      .mockResolvedValueOnce([{ id: 1, orders_count: 2 }, { id: 2, orders_count: 1 }, { id: 3, orders_count: 3 }, { id: 4, orders_count: 1 }])
      .mockResolvedValueOnce([{ id: 5, orders_count: 1 }]);

    const result = await getReturningCustomerRate(range);

    expect(result.current).toBe(50);
    expect(result.previous).toBe(0);
  });

  it("returns 0 when there are no customers in the period", async () => {
    vi.mocked(fetchWc).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const result = await getReturningCustomerRate(range);

    expect(result).toEqual({ current: 0, previous: 0 });
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- woocommerce/customers`
Expected: FAIL — `Cannot find module './customers'`

- [ ] **Step 7: Implement `src/lib/analytics/woocommerce/customers.ts`**

Caps at 100 customers per period (`per_page=100`, no further pagination) — acceptable for a period-level rate metric at this scope; revisit if a store consistently has 100+ distinct customers in a single "Today"/7d/30d window.

```typescript
import { fetchWc } from "./client";
import type { ResolvedDateRange } from "../types";

interface WcCustomerRow {
  id: number;
  orders_count: number;
}

async function fetchCustomerRows(period: { start: Date; end: Date }): Promise<WcCustomerRow[]> {
  return fetchWc<WcCustomerRow[]>("/wc-analytics/reports/customers", {
    after: period.start.toISOString(),
    before: period.end.toISOString(),
    per_page: "100",
  });
}

function computeReturningRate(rows: WcCustomerRow[]): number {
  if (rows.length === 0) return 0;
  const returning = rows.filter((row) => row.orders_count > 1).length;
  return Math.round((returning / rows.length) * 1000) / 10;
}

export async function getReturningCustomerRate(
  range: ResolvedDateRange
): Promise<{ current: number; previous: number }> {
  const [currentRows, previousRows] = await Promise.all([
    fetchCustomerRows(range.current),
    fetchCustomerRows(range.previous),
  ]);
  return {
    current: computeReturningRate(currentRows),
    previous: computeReturningRate(previousRows),
  };
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- woocommerce/customers`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/lib/analytics/woocommerce/orders.ts src/lib/analytics/woocommerce/orders.test.ts src/lib/analytics/woocommerce/customers.ts src/lib/analytics/woocommerce/customers.test.ts
git commit -m "feat: add orders-fulfilled and returning-customer-rate fetchers"
```

---

### Task 8: WooCommerce Top-Products-by-Revenue Fetcher

**Files:**
- Create: `src/lib/analytics/woocommerce/products.ts`
- Test: `src/lib/analytics/woocommerce/products.test.ts`

**Interfaces:**
- Consumes: `fetchWc` (from `./client`), `ResolvedDateRange`, `NamedValue` (from `../types`).
- Produces: `getTopProductsByRevenue(range: ResolvedDateRange): Promise<NamedValue[]>`. Consumed by `src/lib/analytics/normalize.ts` and `src/lib/analytics/actions.ts`.

- [ ] **Step 1: Write failing test**

`src/lib/analytics/woocommerce/products.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import type { ResolvedDateRange } from "../types";

vi.mock("./client", () => ({ fetchWc: vi.fn() }));

import { fetchWc } from "./client";
import { getTopProductsByRevenue } from "./products";

const range: ResolvedDateRange = {
  key: "7d",
  interval: "day",
  current: { start: new Date("2026-08-01"), end: new Date("2026-08-07") },
  previous: { start: new Date("2026-07-25"), end: new Date("2026-07-31") },
};

describe("getTopProductsByRevenue", () => {
  it("maps product rows to NamedValue, ordered by revenue descending", async () => {
    vi.mocked(fetchWc).mockResolvedValue([
      { extended_info: { name: "Cocoa Flavanols" }, subtotals: { net_revenue: 236.4567 } },
      { extended_info: { name: "Magnesium Sleep Aid" }, subtotals: { net_revenue: 51.2 } },
    ]);

    const result = await getTopProductsByRevenue(range);

    expect(result).toEqual([
      { name: "Cocoa Flavanols", value: 236.46 },
      { name: "Magnesium Sleep Aid", value: 51.2 },
    ]);
    expect(fetchWc).toHaveBeenCalledWith(
      "/wc-analytics/reports/revenue/products",
      expect.objectContaining({ orderby: "net_revenue", order: "desc", per_page: "10", extended_info: "true" })
    );
  });

  it("falls back to 'Unknown product' when extended_info is missing", async () => {
    vi.mocked(fetchWc).mockResolvedValue([{ subtotals: { net_revenue: 10 } }]);

    const result = await getTopProductsByRevenue(range);

    expect(result[0].name).toBe("Unknown product");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- woocommerce/products`
Expected: FAIL — `Cannot find module './products'`

- [ ] **Step 3: Implement `src/lib/analytics/woocommerce/products.ts`**

```typescript
import { fetchWc } from "./client";
import type { NamedValue, ResolvedDateRange } from "../types";

interface WcRevenueProductRow {
  extended_info?: { name: string };
  subtotals: { net_revenue: number };
}

export async function getTopProductsByRevenue(range: ResolvedDateRange): Promise<NamedValue[]> {
  const rows = await fetchWc<WcRevenueProductRow[]>("/wc-analytics/reports/revenue/products", {
    after: range.current.start.toISOString(),
    before: range.current.end.toISOString(),
    orderby: "net_revenue",
    order: "desc",
    per_page: "10",
    extended_info: "true",
  });

  return rows.map((row) => ({
    name: row.extended_info?.name ?? "Unknown product",
    value: Math.round(row.subtotals.net_revenue * 100) / 100,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- woocommerce/products`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/woocommerce/products.ts src/lib/analytics/woocommerce/products.test.ts
git commit -m "feat: add top-products-by-revenue fetcher"
```

---

### Task 9: WooCommerce Sales-by-Channel Fetcher

**Files:**
- Create: `src/lib/analytics/woocommerce/sales-channel.ts`
- Test: `src/lib/analytics/woocommerce/sales-channel.test.ts`

**Interfaces:**
- Consumes: `fetchWc` (from `./client`), `ResolvedDateRange`, `NamedValue` (from `../types`).
- Produces: `getSalesByChannel(range: ResolvedDateRange): Promise<NamedValue[]>`. Consumed by `src/lib/analytics/normalize.ts` and `src/lib/analytics/actions.ts` (wrapped with `withFixedCache`, per Global Constraints).

- [ ] **Step 1: Write failing test**

`src/lib/analytics/woocommerce/sales-channel.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import type { ResolvedDateRange } from "../types";

vi.mock("./client", () => ({ fetchWc: vi.fn() }));

import { fetchWc } from "./client";
import { getSalesByChannel } from "./sales-channel";

const range: ResolvedDateRange = {
  key: "30d",
  interval: "day",
  current: { start: new Date("2026-07-08"), end: new Date("2026-08-07") },
  previous: { start: new Date("2026-06-08"), end: new Date("2026-07-07") },
};

function page(rows: Array<{ created_via: string; total: string }>) {
  return rows;
}

describe("getSalesByChannel", () => {
  it("paginates through all orders and buckets totals by created_via, mapped to friendly labels", async () => {
    const firstPage = page(
      Array.from({ length: 100 }, (_, i) => ({ created_via: "checkout", total: "10.00" }))
    );
    const secondPage = page([
      { created_via: "checkout", total: "5.00" },
      { created_via: "admin", total: "20.00" },
    ]);
    vi.mocked(fetchWc).mockResolvedValueOnce(firstPage).mockResolvedValueOnce(secondPage);

    const result = await getSalesByChannel(range);

    expect(fetchWc).toHaveBeenCalledTimes(2);
    expect(fetchWc).toHaveBeenNthCalledWith(
      1,
      "/wc/v3/orders",
      expect.objectContaining({ page: "1", per_page: "100", status: "any" })
    );
    expect(fetchWc).toHaveBeenNthCalledWith(2, "/wc/v3/orders", expect.objectContaining({ page: "2" }));

    expect(result).toEqual([
      { name: "Online Store", value: 1005 },
      { name: "Admin", value: 20 },
    ]);
  });

  it("stops after a page with fewer rows than per_page", async () => {
    vi.mocked(fetchWc).mockResolvedValueOnce([{ created_via: "checkout", total: "1.00" }]);

    await getSalesByChannel(range);

    expect(fetchWc).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- woocommerce/sales-channel`
Expected: FAIL — `Cannot find module './sales-channel'`

- [ ] **Step 3: Implement `src/lib/analytics/woocommerce/sales-channel.ts`**

```typescript
import { fetchWc } from "./client";
import type { NamedValue, PeriodBounds, ResolvedDateRange } from "../types";

interface WcOrderRow {
  created_via: string;
  total: string;
}

const CHANNEL_LABELS: Record<string, string> = {
  checkout: "Online Store",
  "store-api": "Online Store",
  admin: "Admin",
  "rest-api": "API",
  subscription: "Subscriptions",
};

async function fetchAllOrders(period: PeriodBounds): Promise<WcOrderRow[]> {
  const perPage = 100;
  let page = 1;
  const results: WcOrderRow[] = [];

  while (true) {
    const rows = await fetchWc<WcOrderRow[]>("/wc/v3/orders", {
      after: period.start.toISOString(),
      before: period.end.toISOString(),
      status: "any",
      per_page: String(perPage),
      page: String(page),
    });
    results.push(...rows);
    if (rows.length < perPage) break;
    page += 1;
  }
  return results;
}

export async function getSalesByChannel(range: ResolvedDateRange): Promise<NamedValue[]> {
  const orders = await fetchAllOrders(range.current);
  const totalsByChannel = new Map<string, number>();

  for (const order of orders) {
    const label = CHANNEL_LABELS[order.created_via] ?? order.created_via;
    totalsByChannel.set(label, (totalsByChannel.get(label) ?? 0) + Number(order.total));
  }

  return [...totalsByChannel.entries()]
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- woocommerce/sales-channel`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/woocommerce/sales-channel.ts src/lib/analytics/woocommerce/sales-channel.test.ts
git commit -m "feat: add sales-by-channel fetcher with created_via aggregation"
```

---

### Task 10: GA4 Client + Report Runner

**Files:**
- Create: `src/lib/analytics/ga4/client.ts`
- Test: `src/lib/analytics/ga4/client.test.ts`

**Interfaces:**
- Produces: `Ga4ReportRow`, `Ga4ReportParams`, `runGa4Report(params: Ga4ReportParams): Promise<Ga4ReportRow[]>`, `resetGa4ClientForTests(): void`. Used by every `src/lib/analytics/ga4/*.ts` fetcher.

- [ ] **Step 1: Install the GA4 SDK**

```bash
npm install @google-analytics/data
```

- [ ] **Step 2: Write failing tests**

`src/lib/analytics/ga4/client.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runReportMock = vi.fn();

vi.mock("@google-analytics/data", () => ({
  BetaAnalyticsDataClient: vi.fn().mockImplementation((config: unknown) => ({
    runReport: runReportMock,
    __config: config,
  })),
}));

import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { resetGa4ClientForTests, runGa4Report } from "./client";

describe("GA4 client", () => {
  beforeEach(() => {
    resetGa4ClientForTests();
    vi.stubEnv("GA4_PROPERTY_ID", "123456789");
    vi.stubEnv("GA4_CLIENT_EMAIL", "svc@example.iam.gserviceaccount.com");
    vi.stubEnv("GA4_PRIVATE_KEY", "line1\\nline2");
    runReportMock.mockResolvedValue([
      {
        rows: [{ dimensionValues: [{ value: "mobile" }], metricValues: [{ value: "42" }] }],
      },
    ]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("constructs the client once with credentials, converting escaped newlines", async () => {
    await runGa4Report({ dimensions: ["deviceCategory"], metrics: ["sessions"], startDate: "2026-08-01", endDate: "2026-08-07" });
    await runGa4Report({ dimensions: ["deviceCategory"], metrics: ["sessions"], startDate: "2026-08-01", endDate: "2026-08-07" });

    expect(BetaAnalyticsDataClient).toHaveBeenCalledTimes(1);
    const config = vi.mocked(BetaAnalyticsDataClient).mock.calls[0][0] as { credentials: { private_key: string } };
    expect(config.credentials.private_key).toBe("line1\nline2");
  });

  it("builds the runReport request from params and maps rows to plain values", async () => {
    const rows = await runGa4Report({
      dimensions: ["deviceCategory"],
      metrics: ["sessions"],
      startDate: "2026-08-01",
      endDate: "2026-08-07",
      dimensionFilter: { fieldName: "sessionMedium", value: "social" },
    });

    expect(runReportMock).toHaveBeenCalledWith({
      property: "properties/123456789",
      dateRanges: [{ startDate: "2026-08-01", endDate: "2026-08-07" }],
      dimensions: [{ name: "deviceCategory" }],
      metrics: [{ name: "sessions" }],
      dimensionFilter: { filter: { fieldName: "sessionMedium", stringFilter: { value: "social" } } },
    });
    expect(rows).toEqual([{ dimensionValues: ["mobile"], metricValues: [42] }]);
  });

  it("throws when GA4_PROPERTY_ID is missing", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("GA4_CLIENT_EMAIL", "svc@example.iam.gserviceaccount.com");
    vi.stubEnv("GA4_PRIVATE_KEY", "line1");

    await expect(
      runGa4Report({ dimensions: [], metrics: ["sessions"], startDate: "2026-08-01", endDate: "2026-08-07" })
    ).rejects.toThrow(/GA4_PROPERTY_ID/);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- ga4/client`
Expected: FAIL — `Cannot find module './client'`

- [ ] **Step 4: Implement `src/lib/analytics/ga4/client.ts`**

```typescript
import { BetaAnalyticsDataClient } from "@google-analytics/data";

let client: BetaAnalyticsDataClient | null = null;

function getClient(): BetaAnalyticsDataClient {
  if (client) return client;

  const clientEmail = process.env.GA4_CLIENT_EMAIL;
  const privateKey = process.env.GA4_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    throw new Error("Missing GA4 environment variables (GA4_CLIENT_EMAIL, GA4_PRIVATE_KEY)");
  }

  client = new BetaAnalyticsDataClient({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, "\n"),
    },
  });
  return client;
}

export interface Ga4ReportRow {
  dimensionValues: string[];
  metricValues: number[];
}

export interface Ga4ReportParams {
  dimensions: string[];
  metrics: string[];
  startDate: string;
  endDate: string;
  dimensionFilter?: {
    fieldName: string;
    value: string;
  };
}

export async function runGa4Report(params: Ga4ReportParams): Promise<Ga4ReportRow[]> {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) {
    throw new Error("Missing GA4 environment variable GA4_PROPERTY_ID");
  }

  const [response] = await getClient().runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: params.startDate, endDate: params.endDate }],
    dimensions: params.dimensions.map((name) => ({ name })),
    metrics: params.metrics.map((name) => ({ name })),
    dimensionFilter: params.dimensionFilter
      ? {
          filter: {
            fieldName: params.dimensionFilter.fieldName,
            stringFilter: { value: params.dimensionFilter.value },
          },
        }
      : undefined,
  });

  return (response.rows ?? []).map((row) => ({
    dimensionValues: (row.dimensionValues ?? []).map((d) => d.value ?? ""),
    metricValues: (row.metricValues ?? []).map((m) => Number(m.value ?? 0)),
  }));
}

export function resetGa4ClientForTests(): void {
  client = null;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- ga4/client`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/analytics/ga4/client.ts src/lib/analytics/ga4/client.test.ts
git commit -m "feat: add GA4 Data API client and report runner"
```

---

### Task 11: GA4 Sessions Fetchers + Time-Series Formatting Helpers

**Files:**
- Create: `src/lib/analytics/ga4/format.ts`
- Create: `src/lib/analytics/ga4/sessions.ts`
- Test: `src/lib/analytics/ga4/format.test.ts`
- Test: `src/lib/analytics/ga4/sessions.test.ts`

**Interfaces:**
- Consumes: `runGa4Report` (from `./client`), `ResolvedDateRange`, `TimeSeriesData`, `NamedValue` (from `../types`).
- Produces: `toIsoDate(date: Date): string`, `formatBucketLabel(rawDate: string, interval: "hour"|"day"): string`, `alignSeries(currentMap: Map<string,number>, previousMap: Map<string,number>, interval: "hour"|"day"): TimeSeriesData[]` (from `format.ts` — reused by `ga4/funnel.ts` in Task 12); `getSessionsOverTime(range): Promise<TimeSeriesData[]>`, `getSessionsByDevice(range): Promise<NamedValue[]>`, `getSessionsByLocation(range): Promise<NamedValue[]>` (from `sessions.ts`).

- [ ] **Step 1: Write failing tests for `format.ts`**

`src/lib/analytics/ga4/format.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { alignSeries, formatBucketLabel, toIsoDate } from "./format";

describe("toIsoDate", () => {
  it("formats a Date as YYYY-MM-DD", () => {
    expect(toIsoDate(new Date("2026-08-07T15:30:00.000Z"))).toBe("2026-08-07");
  });
});

describe("formatBucketLabel", () => {
  it("formats a GA4 dateHour value (YYYYMMDDHH) as '12 AM'-style labels", () => {
    expect(formatBucketLabel("2026080700", "hour")).toBe("12 AM");
    expect(formatBucketLabel("2026080713", "hour")).toBe("1 PM");
  });

  it("formats a GA4 date value (YYYYMMDD) as 'Mon D' labels", () => {
    expect(formatBucketLabel("20260807", "day")).toBe("Aug 7");
  });
});

describe("alignSeries", () => {
  it("pairs sorted current and previous buckets positionally and fills gaps with 0", () => {
    const current = new Map([["20260801", 10], ["20260802", 20]]);
    const previous = new Map([["20260725", 5]]);

    const result = alignSeries(current, previous, "day");

    expect(result).toEqual([
      { date: "Aug 1", currentPeriod: 10, previousPeriod: 5 },
      { date: "Aug 2", currentPeriod: 20, previousPeriod: 0 },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- ga4/format`
Expected: FAIL — `Cannot find module './format'`

- [ ] **Step 3: Implement `src/lib/analytics/ga4/format.ts`**

```typescript
import type { TimeSeriesData } from "../types";

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatBucketLabel(rawDate: string, interval: "hour" | "day"): string {
  if (interval === "hour") {
    const hour = Number(rawDate.slice(8, 10));
    const period = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${hour12} ${period}`;
  }

  const month = Number(rawDate.slice(4, 6));
  const day = Number(rawDate.slice(6, 8));
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${monthNames[month - 1]} ${day}`;
}

export function alignSeries(
  currentMap: Map<string, number>,
  previousMap: Map<string, number>,
  interval: "hour" | "day"
): TimeSeriesData[] {
  const currentKeys = [...currentMap.keys()].sort();
  const previousKeys = [...previousMap.keys()].sort();
  const bucketCount = Math.max(currentKeys.length, previousKeys.length);

  const series: TimeSeriesData[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const currentKey = currentKeys[i];
    const previousKey = previousKeys[i];
    const labelSource = currentKey ?? previousKey;
    series.push({
      date: formatBucketLabel(labelSource, interval),
      currentPeriod: currentKey ? currentMap.get(currentKey)! : 0,
      previousPeriod: previousKey ? previousMap.get(previousKey)! : 0,
    });
  }
  return series;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- ga4/format`
Expected: PASS

- [ ] **Step 5: Write failing tests for `sessions.ts`**

`src/lib/analytics/ga4/sessions.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import type { ResolvedDateRange } from "../types";

vi.mock("./client", () => ({ runGa4Report: vi.fn() }));

import { runGa4Report } from "./client";
import { getSessionsByDevice, getSessionsByLocation, getSessionsOverTime } from "./sessions";

const range: ResolvedDateRange = {
  key: "7d",
  interval: "day",
  current: { start: new Date("2026-08-01"), end: new Date("2026-08-07") },
  previous: { start: new Date("2026-07-25"), end: new Date("2026-07-31") },
};

describe("getSessionsOverTime", () => {
  it("fetches current and previous sessions by date and aligns them into a TimeSeriesData series", async () => {
    vi.mocked(runGa4Report)
      .mockResolvedValueOnce([{ dimensionValues: ["20260801"], metricValues: [100] }])
      .mockResolvedValueOnce([{ dimensionValues: ["20260725"], metricValues: [80] }]);

    const result = await getSessionsOverTime(range);

    expect(result).toEqual([{ date: "Aug 1", currentPeriod: 100, previousPeriod: 80 }]);
  });
});

describe("getSessionsByDevice", () => {
  it("maps rows to NamedValue sorted by sessions descending", async () => {
    vi.mocked(runGa4Report).mockResolvedValue([
      { dimensionValues: ["desktop"], metricValues: [10] },
      { dimensionValues: ["mobile"], metricValues: [50] },
    ]);

    const result = await getSessionsByDevice(range);

    expect(result).toEqual([
      { name: "mobile", value: 50 },
      { name: "desktop", value: 10 },
    ]);
  });
});

describe("getSessionsByLocation", () => {
  it("joins region and city, sorts descending, and caps at 10 rows", async () => {
    vi.mocked(runGa4Report).mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => ({
        dimensionValues: [`Region${i}`, `City${i}`],
        metricValues: [12 - i],
      }))
    );

    const result = await getSessionsByLocation(range);

    expect(result).toHaveLength(10);
    expect(result[0]).toEqual({ name: "Region0 · City0", value: 12 });
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npm test -- ga4/sessions`
Expected: FAIL — `Cannot find module './sessions'`

- [ ] **Step 7: Implement `src/lib/analytics/ga4/sessions.ts`**

```typescript
import { runGa4Report } from "./client";
import { alignSeries, toIsoDate } from "./format";
import type { NamedValue, PeriodBounds, ResolvedDateRange, TimeSeriesData } from "../types";

async function fetchSessionsByBucket(period: PeriodBounds, interval: "hour" | "day"): Promise<Map<string, number>> {
  const rows = await runGa4Report({
    dimensions: [interval === "hour" ? "dateHour" : "date"],
    metrics: ["sessions"],
    startDate: toIsoDate(period.start),
    endDate: toIsoDate(period.end),
  });

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.dimensionValues[0], row.metricValues[0]);
  }
  return map;
}

export async function getSessionsOverTime(range: ResolvedDateRange): Promise<TimeSeriesData[]> {
  const [currentMap, previousMap] = await Promise.all([
    fetchSessionsByBucket(range.current, range.interval),
    fetchSessionsByBucket(range.previous, range.interval),
  ]);
  return alignSeries(currentMap, previousMap, range.interval);
}

export async function getSessionsByDevice(range: ResolvedDateRange): Promise<NamedValue[]> {
  const rows = await runGa4Report({
    dimensions: ["deviceCategory"],
    metrics: ["sessions"],
    startDate: toIsoDate(range.current.start),
    endDate: toIsoDate(range.current.end),
  });

  return rows
    .map((row) => ({ name: row.dimensionValues[0], value: row.metricValues[0] }))
    .sort((a, b) => b.value - a.value);
}

export async function getSessionsByLocation(range: ResolvedDateRange): Promise<NamedValue[]> {
  const rows = await runGa4Report({
    dimensions: ["region", "city"],
    metrics: ["sessions"],
    startDate: toIsoDate(range.current.start),
    endDate: toIsoDate(range.current.end),
  });

  return rows
    .map((row) => ({ name: `${row.dimensionValues[0]} · ${row.dimensionValues[1]}`, value: row.metricValues[0] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- ga4/sessions`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/lib/analytics/ga4/format.ts src/lib/analytics/ga4/format.test.ts src/lib/analytics/ga4/sessions.ts src/lib/analytics/ga4/sessions.test.ts
git commit -m "feat: add GA4 sessions fetchers and time-series formatting helpers"
```

---

### Task 12: GA4 Conversion Funnel + Conversion Rate Fetchers

**Files:**
- Create: `src/lib/analytics/ga4/funnel.ts`
- Test: `src/lib/analytics/ga4/funnel.test.ts`

**Interfaces:**
- Consumes: `runGa4Report` (from `./client`), `toIsoDate`, `alignSeries` (from `./format`), `computeChange` (from `../normalize`), `ResolvedDateRange`, `FunnelStep`, `TimeSeriesData`, `ChangeMetric` (from `../types`).
- Produces: `getConversionFunnel(range): Promise<FunnelStep[]>`, `getConversionRateOverTime(range): Promise<TimeSeriesData[]>`, `getConversionRateSummary(range): Promise<ChangeMetric>`. Consumed by `src/lib/analytics/normalize.ts` and `src/lib/analytics/actions.ts`.

- [ ] **Step 1: Write failing tests**

`src/lib/analytics/ga4/funnel.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import type { ResolvedDateRange } from "../types";

vi.mock("./client", () => ({ runGa4Report: vi.fn() }));

import { runGa4Report } from "./client";
import { getConversionFunnel, getConversionRateOverTime, getConversionRateSummary } from "./funnel";

const range: ResolvedDateRange = {
  key: "7d",
  interval: "day",
  current: { start: new Date("2026-08-01"), end: new Date("2026-08-07") },
  previous: { start: new Date("2026-07-25"), end: new Date("2026-07-31") },
};

describe("getConversionFunnel", () => {
  it("builds four funnel steps with sessions and percentage of top-of-funnel sessions", async () => {
    vi.mocked(runGa4Report)
      .mockResolvedValueOnce([{ dimensionValues: [], metricValues: [1000] }]) // sessions
      .mockResolvedValueOnce([{ dimensionValues: ["add_to_cart"], metricValues: [300] }])
      .mockResolvedValueOnce([{ dimensionValues: ["begin_checkout"], metricValues: [150] }])
      .mockResolvedValueOnce([{ dimensionValues: ["purchase"], metricValues: [100] }]);

    const result = await getConversionFunnel(range);

    expect(result).toEqual([
      { step: "Sessions", sessions: 1000, percentage: 100 },
      { step: "Added to cart", sessions: 300, percentage: 30 },
      { step: "Reached checkout", sessions: 150, percentage: 15 },
      { step: "Completed checkout", sessions: 100, percentage: 10 },
    ]);
  });
});

describe("getConversionRateSummary", () => {
  it("computes the change in completed-checkout / sessions between periods", async () => {
    vi.mocked(runGa4Report)
      .mockResolvedValueOnce([{ dimensionValues: [], metricValues: [1000] }])
      .mockResolvedValueOnce([{ dimensionValues: ["add_to_cart"], metricValues: [300] }])
      .mockResolvedValueOnce([{ dimensionValues: ["begin_checkout"], metricValues: [150] }])
      .mockResolvedValueOnce([{ dimensionValues: ["purchase"], metricValues: [100] }])
      .mockResolvedValueOnce([{ dimensionValues: [], metricValues: [800] }])
      .mockResolvedValueOnce([{ dimensionValues: ["add_to_cart"], metricValues: [200] }])
      .mockResolvedValueOnce([{ dimensionValues: ["begin_checkout"], metricValues: [100] }])
      .mockResolvedValueOnce([{ dimensionValues: ["purchase"], metricValues: [64] }]);

    const result = await getConversionRateSummary(range);

    expect(result.value).toBe(10);
    expect(result.trend).toBe("up");
  });
});

describe("getConversionRateOverTime", () => {
  it("aligns current and previous per-bucket conversion rates", async () => {
    vi.mocked(runGa4Report)
      .mockResolvedValueOnce([{ dimensionValues: ["20260801"], metricValues: [100] }]) // current sessions
      .mockResolvedValueOnce([{ dimensionValues: ["20260801", "purchase"], metricValues: [10] }]) // current purchases
      .mockResolvedValueOnce([{ dimensionValues: ["20260725"], metricValues: [50] }]) // previous sessions
      .mockResolvedValueOnce([{ dimensionValues: ["20260725", "purchase"], metricValues: [5] }]); // previous purchases

    const result = await getConversionRateOverTime(range);

    expect(result).toEqual([{ date: "Aug 1", currentPeriod: 10, previousPeriod: 10 }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- ga4/funnel`
Expected: FAIL — `Cannot find module './funnel'`

- [ ] **Step 3: Implement `src/lib/analytics/ga4/funnel.ts`**

```typescript
import { runGa4Report } from "./client";
import { alignSeries, toIsoDate } from "./format";
import { computeChange } from "../normalize";
import type { ChangeMetric, FunnelStep, PeriodBounds, ResolvedDateRange, TimeSeriesData } from "../types";

const FUNNEL_EVENTS = [
  { step: "Sessions", event: null as string | null },
  { step: "Added to cart", event: "add_to_cart" },
  { step: "Reached checkout", event: "begin_checkout" },
  { step: "Completed checkout", event: "purchase" },
];

async function fetchFunnelCounts(period: PeriodBounds): Promise<number[]> {
  const counts: number[] = [];
  for (const step of FUNNEL_EVENTS) {
    if (step.event === null) {
      const rows = await runGa4Report({
        dimensions: [],
        metrics: ["sessions"],
        startDate: toIsoDate(period.start),
        endDate: toIsoDate(period.end),
      });
      counts.push(rows[0]?.metricValues[0] ?? 0);
      continue;
    }
    const rows = await runGa4Report({
      dimensions: ["eventName"],
      metrics: ["sessions"],
      startDate: toIsoDate(period.start),
      endDate: toIsoDate(period.end),
      dimensionFilter: { fieldName: "eventName", value: step.event },
    });
    counts.push(rows[0]?.metricValues[0] ?? 0);
  }
  return counts;
}

export async function getConversionFunnel(range: ResolvedDateRange): Promise<FunnelStep[]> {
  const counts = await fetchFunnelCounts(range.current);
  const sessions = counts[0] || 1;
  return FUNNEL_EVENTS.map((step, i) => ({
    step: step.step,
    sessions: counts[i],
    percentage: Math.round((counts[i] / sessions) * 1000) / 10,
  }));
}

export async function getConversionRateSummary(range: ResolvedDateRange): Promise<ChangeMetric> {
  const [currentCounts, previousCounts] = await Promise.all([
    fetchFunnelCounts(range.current),
    fetchFunnelCounts(range.previous),
  ]);
  const currentRate = currentCounts[0] ? Math.round((currentCounts[3] / currentCounts[0]) * 1000) / 10 : 0;
  const previousRate = previousCounts[0] ? Math.round((previousCounts[3] / previousCounts[0]) * 1000) / 10 : 0;
  return computeChange(currentRate, previousRate);
}

async function fetchRateByBucket(period: PeriodBounds, interval: "hour" | "day"): Promise<Map<string, number>> {
  const dimension = interval === "hour" ? "dateHour" : "date";

  const [sessionsRows, purchaseRows] = await Promise.all([
    runGa4Report({
      dimensions: [dimension],
      metrics: ["sessions"],
      startDate: toIsoDate(period.start),
      endDate: toIsoDate(period.end),
    }),
    runGa4Report({
      dimensions: [dimension, "eventName"],
      metrics: ["sessions"],
      startDate: toIsoDate(period.start),
      endDate: toIsoDate(period.end),
      dimensionFilter: { fieldName: "eventName", value: "purchase" },
    }),
  ]);

  const sessionsByBucket = new Map<string, number>();
  for (const row of sessionsRows) sessionsByBucket.set(row.dimensionValues[0], row.metricValues[0]);

  const purchasesByBucket = new Map<string, number>();
  for (const row of purchaseRows) purchasesByBucket.set(row.dimensionValues[0], row.metricValues[0]);

  const rateByBucket = new Map<string, number>();
  for (const [bucket, sessions] of sessionsByBucket) {
    const purchases = purchasesByBucket.get(bucket) ?? 0;
    rateByBucket.set(bucket, sessions === 0 ? 0 : Math.round((purchases / sessions) * 1000) / 10);
  }
  return rateByBucket;
}

export async function getConversionRateOverTime(range: ResolvedDateRange): Promise<TimeSeriesData[]> {
  const [currentMap, previousMap] = await Promise.all([
    fetchRateByBucket(range.current, range.interval),
    fetchRateByBucket(range.previous, range.interval),
  ]);
  return alignSeries(currentMap, previousMap, range.interval);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- ga4/funnel`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/ga4/funnel.ts src/lib/analytics/ga4/funnel.test.ts
git commit -m "feat: add GA4 conversion funnel and conversion rate fetchers"
```

---

### Task 13: GA4 Social Referrer Revenue Fetcher

**Files:**
- Create: `src/lib/analytics/ga4/referrers.ts`
- Test: `src/lib/analytics/ga4/referrers.test.ts`

**Interfaces:**
- Consumes: `runGa4Report` (from `./client`), `toIsoDate` (from `./format`), `ResolvedDateRange`, `NamedValue` (from `../types`).
- Produces: `getSocialReferrerRevenue(range: ResolvedDateRange): Promise<NamedValue[]>`. Consumed by `src/lib/analytics/normalize.ts` and `src/lib/analytics/actions.ts`.

- [ ] **Step 1: Write failing test**

`src/lib/analytics/ga4/referrers.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import type { ResolvedDateRange } from "../types";

vi.mock("./client", () => ({ runGa4Report: vi.fn() }));

import { runGa4Report } from "./client";
import { getSocialReferrerRevenue } from "./referrers";

const range: ResolvedDateRange = {
  key: "today",
  interval: "hour",
  current: { start: new Date("2026-08-07T00:00:00Z"), end: new Date("2026-08-07T23:59:59Z") },
  previous: { start: new Date("2026-08-06T00:00:00Z"), end: new Date("2026-08-06T23:59:59Z") },
};

describe("getSocialReferrerRevenue", () => {
  it("filters to social medium, extracts the source name, and sorts by revenue descending", async () => {
    vi.mocked(runGa4Report).mockResolvedValue([
      { dimensionValues: ["facebook / social"], metricValues: [34.945] },
      { dimensionValues: ["youtube / social"], metricValues: [6135.07] },
    ]);

    const result = await getSocialReferrerRevenue(range);

    expect(runGa4Report).toHaveBeenCalledWith(
      expect.objectContaining({
        dimensions: ["sessionSourceMedium"],
        metrics: ["purchaseRevenue"],
        dimensionFilter: { fieldName: "sessionMedium", value: "social" },
      })
    );
    expect(result).toEqual([
      { name: "youtube", value: 6135.07 },
      { name: "facebook", value: 34.95 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ga4/referrers`
Expected: FAIL — `Cannot find module './referrers'`

- [ ] **Step 3: Implement `src/lib/analytics/ga4/referrers.ts`**

```typescript
import { runGa4Report } from "./client";
import { toIsoDate } from "./format";
import type { NamedValue, ResolvedDateRange } from "../types";

export async function getSocialReferrerRevenue(range: ResolvedDateRange): Promise<NamedValue[]> {
  const rows = await runGa4Report({
    dimensions: ["sessionSourceMedium"],
    metrics: ["purchaseRevenue"],
    startDate: toIsoDate(range.current.start),
    endDate: toIsoDate(range.current.end),
    dimensionFilter: { fieldName: "sessionMedium", value: "social" },
  });

  return rows
    .map((row) => ({
      name: row.dimensionValues[0].split(" / ")[0],
      value: Math.round(row.metricValues[0] * 100) / 100,
    }))
    .sort((a, b) => b.value - a.value);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ga4/referrers`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/ga4/referrers.ts src/lib/analytics/ga4/referrers.test.ts
git commit -m "feat: add GA4 social referrer revenue fetcher"
```

---

### Task 14: Full `DashboardPayload` Assembly in `normalize.ts`

**Files:**
- Modify: `src/lib/analytics/normalize.ts`
- Modify: `src/lib/analytics/normalize.test.ts`

**Interfaces:**
- Consumes: `RevenueStatsResult` (from `./woocommerce/revenue`), `computeChange` (already in this file), all `DashboardPayload`/`CardKey`/etc. types (from `./types`).
- Produces: `RawPipelineResults` interface, `buildDashboardPayload(raw: RawPipelineResults): DashboardPayload`. Consumed by `src/lib/analytics/actions.ts` (Task 15).

- [ ] **Step 1: Write failing tests**

Append to `src/lib/analytics/normalize.test.ts`:

```typescript
import { buildDashboardPayload, type RawPipelineResults } from "./normalize";
import type { RevenueStatsResult } from "./woocommerce/revenue";

function revenueStats(overrides: Partial<RevenueStatsResult["totals"]> = {}): RevenueStatsResult {
  return {
    intervals: [
      { date: "Aug 1", grossSales: 100, netRevenue: 90, discounts: 5, refunds: 2, shipping: 8, taxes: 3, totalSales: 101, ordersCount: 4 },
    ],
    totals: {
      grossSales: 100,
      netRevenue: 90,
      discounts: 5,
      refunds: 2,
      shipping: 8,
      taxes: 3,
      totalSales: 101,
      ordersCount: 4,
      averageOrderValue: 22.5,
      ...overrides,
    },
  };
}

function baseRaw(): RawPipelineResults {
  return {
    revenueStats: { current: revenueStats(), previous: revenueStats({ grossSales: 80, ordersCount: 3 }) },
    ordersFulfilled: { current: 12, previous: 9 },
    returningCustomerRate: { current: 50, previous: 40 },
    salesByProduct: [{ name: "Widget", value: 100 }],
    salesByChannel: [{ name: "Online Store", value: 100 }],
    sessionsOverTime: [{ date: "Aug 1", currentPeriod: 10, previousPeriod: 8 }],
    sessionsByDevice: [{ name: "mobile", value: 10 }],
    sessionsByLocation: [{ name: "US · NY", value: 10 }],
    conversionFunnel: [{ step: "Sessions", sessions: 10, percentage: 100 }],
    conversionRateOverTime: [{ date: "Aug 1", currentPeriod: 10, previousPeriod: 5 }],
    conversionRateSummary: { value: 10, changePercentage: 100, trend: "up" },
    totalSalesBySocialReferrer: [{ name: "youtube", value: 50 }],
  };
}

describe("buildDashboardPayload", () => {
  it("computes summary cards from revenue stats, orders, and customer data", () => {
    const payload = buildDashboardPayload(baseRaw());

    expect(payload.summaryCards.grossSales.value).toBe(100);
    expect(payload.summaryCards.grossSales.changePercentage).toBe(25);
    expect(payload.summaryCards.orders.value).toBe(4);
    expect(payload.summaryCards.ordersFulfilled).toEqual({ value: 12, changePercentage: (3 / 9) * 100, trend: "up" });
    expect(payload.summaryCards.returningCustomerRate.value).toBe(50);
    expect(payload.summaryCards.conversionRate).toEqual({ value: 10, changePercentage: 100, trend: "up", sparkline: [10] });
  });

  it("derives salesOverTime, aovOverTime, and salesBreakdown from revenue stats intervals/totals", () => {
    const payload = buildDashboardPayload(baseRaw());

    expect(payload.charts.salesOverTime).toEqual([{ date: "Aug 1", currentPeriod: 100, previousPeriod: 80 }]);
    expect(payload.charts.aovOverTime).toEqual([{ date: "Aug 1", currentPeriod: 90 / 4, previousPeriod: 0 }]);
    expect(payload.charts.salesBreakdown).toEqual([
      { label: "Gross sales", value: 100 },
      { label: "Discounts", value: -5 },
      { label: "Sales reversals", value: -2 },
      { label: "Net sales", value: 90 },
      { label: "Shipping charges", value: 8 },
      { label: "Taxes", value: 3 },
      { label: "Total sales", value: 101 },
    ]);
  });

  it("passes through GA4-sourced charts unchanged", () => {
    const payload = buildDashboardPayload(baseRaw());

    expect(payload.charts.sessionsOverTime).toEqual([{ date: "Aug 1", currentPeriod: 10, previousPeriod: 8 }]);
    expect(payload.charts.totalSalesBySocialReferrer).toEqual([{ name: "youtube", value: 50 }]);
  });

  it("isolates a revenue-stats failure to the cards it feeds, leaving other cards populated", () => {
    const raw = baseRaw();
    raw.revenueStats = new Error("WooCommerce API error 500");

    const payload = buildDashboardPayload(raw);

    expect(payload.errors.grossSales).toBe("WooCommerce API error 500");
    expect(payload.errors.orders).toBe("WooCommerce API error 500");
    expect(payload.errors.salesOverTime).toBe("WooCommerce API error 500");
    expect(payload.summaryCards.grossSales.value).toBe(0);
    expect(payload.charts.salesOverTime).toEqual([]);
    expect(payload.summaryCards.returningCustomerRate.value).toBe(50);
    expect(payload.errors.returningCustomerRate).toBeUndefined();
  });

  it("isolates a GA4 sessions failure without affecting revenue cards", () => {
    const raw = baseRaw();
    raw.sessionsOverTime = new Error("GA4 quota exceeded");

    const payload = buildDashboardPayload(raw);

    expect(payload.errors.sessionsOverTime).toBe("GA4 quota exceeded");
    expect(payload.charts.sessionsOverTime).toEqual([]);
    expect(payload.summaryCards.grossSales.value).toBe(100);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- normalize`
Expected: FAIL — `buildDashboardPayload is not exported`

- [ ] **Step 3: Extend `src/lib/analytics/normalize.ts`**

Append below the existing `computeChange`:

```typescript
import type {
  CardKey,
  ChangeMetric,
  DashboardPayload,
  FunnelStep,
  NamedValue,
  SalesBreakdownLine,
  TimeSeriesData,
} from "./types";
import type { RevenueStatsResult } from "./woocommerce/revenue";

export interface RawPipelineResults {
  revenueStats: { current: RevenueStatsResult; previous: RevenueStatsResult } | Error;
  ordersFulfilled: { current: number; previous: number } | Error;
  returningCustomerRate: { current: number; previous: number } | Error;
  salesByProduct: NamedValue[] | Error;
  salesByChannel: NamedValue[] | Error;
  sessionsOverTime: TimeSeriesData[] | Error;
  sessionsByDevice: NamedValue[] | Error;
  sessionsByLocation: NamedValue[] | Error;
  conversionFunnel: FunnelStep[] | Error;
  conversionRateOverTime: TimeSeriesData[] | Error;
  conversionRateSummary: ChangeMetric | Error;
  totalSalesBySocialReferrer: NamedValue[] | Error;
}

const EMPTY_REVENUE_STATS: RevenueStatsResult = {
  intervals: [],
  totals: {
    grossSales: 0,
    netRevenue: 0,
    discounts: 0,
    refunds: 0,
    shipping: 0,
    taxes: 0,
    totalSales: 0,
    ordersCount: 0,
    averageOrderValue: 0,
  },
};

function salesOverTimeFrom(stats: { current: RevenueStatsResult; previous: RevenueStatsResult }): TimeSeriesData[] {
  const count = Math.max(stats.current.intervals.length, stats.previous.intervals.length);
  const series: TimeSeriesData[] = [];
  for (let i = 0; i < count; i++) {
    series.push({
      date: stats.current.intervals[i]?.date ?? stats.previous.intervals[i]?.date ?? "",
      currentPeriod: stats.current.intervals[i]?.grossSales ?? 0,
      previousPeriod: stats.previous.intervals[i]?.grossSales ?? 0,
    });
  }
  return series;
}

function aovOverTimeFrom(stats: { current: RevenueStatsResult; previous: RevenueStatsResult }): TimeSeriesData[] {
  const count = Math.max(stats.current.intervals.length, stats.previous.intervals.length);
  const series: TimeSeriesData[] = [];
  for (let i = 0; i < count; i++) {
    const cur = stats.current.intervals[i];
    const prev = stats.previous.intervals[i];
    series.push({
      date: cur?.date ?? prev?.date ?? "",
      currentPeriod: cur && cur.ordersCount > 0 ? cur.netRevenue / cur.ordersCount : 0,
      previousPeriod: prev && prev.ordersCount > 0 ? prev.netRevenue / prev.ordersCount : 0,
    });
  }
  return series;
}

function salesBreakdownFrom(stats: RevenueStatsResult): SalesBreakdownLine[] {
  const t = stats.totals;
  return [
    { label: "Gross sales", value: t.grossSales },
    { label: "Discounts", value: -Math.abs(t.discounts) },
    { label: "Sales reversals", value: -Math.abs(t.refunds) },
    { label: "Net sales", value: t.netRevenue },
    { label: "Shipping charges", value: t.shipping },
    { label: "Taxes", value: t.taxes },
    { label: "Total sales", value: t.totalSales },
  ];
}

export function buildDashboardPayload(raw: RawPipelineResults): DashboardPayload {
  const errors: Partial<Record<CardKey, string>> = {};

  function unwrap<T>(key: CardKey, result: T | Error, fallback: T): T {
    if (result instanceof Error) {
      errors[key] = result.message;
      return fallback;
    }
    return result;
  }

  let revenueStats: { current: RevenueStatsResult; previous: RevenueStatsResult };
  if (raw.revenueStats instanceof Error) {
    const message = raw.revenueStats.message;
    errors.grossSales = message;
    errors.orders = message;
    errors.salesOverTime = message;
    errors.salesBreakdown = message;
    errors.aovOverTime = message;
    revenueStats = { current: EMPTY_REVENUE_STATS, previous: EMPTY_REVENUE_STATS };
  } else {
    revenueStats = raw.revenueStats;
  }

  const ordersFulfilled = unwrap("ordersFulfilled", raw.ordersFulfilled, { current: 0, previous: 0 });
  const returningCustomerRate = unwrap("returningCustomerRate", raw.returningCustomerRate, { current: 0, previous: 0 });
  const conversionRateOverTimeSeries = unwrap("conversionRateOverTime", raw.conversionRateOverTime, []);
  const conversionRateSummaryMetric = unwrap("conversionRate", raw.conversionRateSummary, {
    value: 0,
    changePercentage: 0,
    trend: "up" as const,
  });

  return {
    summaryCards: {
      grossSales: {
        ...computeChange(revenueStats.current.totals.grossSales, revenueStats.previous.totals.grossSales),
        sparkline: revenueStats.current.intervals.map((i) => i.grossSales),
      },
      conversionRate: {
        ...conversionRateSummaryMetric,
        sparkline: conversionRateOverTimeSeries.map((point) => point.currentPeriod),
      },
      ordersFulfilled: computeChange(ordersFulfilled.current, ordersFulfilled.previous),
      orders: {
        ...computeChange(revenueStats.current.totals.ordersCount, revenueStats.previous.totals.ordersCount),
        sparkline: revenueStats.current.intervals.map((i) => i.ordersCount),
      },
      returningCustomerRate: computeChange(returningCustomerRate.current, returningCustomerRate.previous),
    },
    charts: {
      sessionsOverTime: unwrap("sessionsOverTime", raw.sessionsOverTime, []),
      conversionRateOverTime: conversionRateOverTimeSeries,
      conversionFunnel: unwrap("conversionFunnel", raw.conversionFunnel, []),
      sessionsByDevice: unwrap("sessionsByDevice", raw.sessionsByDevice, []),
      sessionsByLocation: unwrap("sessionsByLocation", raw.sessionsByLocation, []),
      totalSalesBySocialReferrer: unwrap("totalSalesBySocialReferrer", raw.totalSalesBySocialReferrer, []),
      salesOverTime: salesOverTimeFrom(revenueStats),
      salesBreakdown: salesBreakdownFrom(revenueStats.current),
      salesByChannel: unwrap("salesByChannel", raw.salesByChannel, []),
      aovOverTime: aovOverTimeFrom(revenueStats),
      salesByProduct: unwrap("salesByProduct", raw.salesByProduct, []),
    },
    errors,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- normalize`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/normalize.ts src/lib/analytics/normalize.test.ts
git commit -m "feat: assemble full DashboardPayload with per-card error isolation"
```

---

### Task 15: `getDashboardData` Server Action

**Files:**
- Create: `src/lib/analytics/actions.ts`
- Test: `src/lib/analytics/actions.test.ts`

**Interfaces:**
- Consumes: `withRangeCache`, `withFixedCache` (from `./cache`), `resolveDateRange` (from `./date-range`), `buildDashboardPayload`, `RawPipelineResults` (from `./normalize`), every fetcher from Tasks 6–13, `DashboardPayload`, `DateRangeKey` (from `./types`).
- Produces: `getDashboardData(rangeKey: DateRangeKey): Promise<DashboardPayload>`. Consumed by `src/app/admin/analytics/page.tsx` (Task 21).

- [ ] **Step 1: Write failing tests**

`src/lib/analytics/actions.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

vi.mock("./cache", () => ({
  withRangeCache: (fn: unknown) => fn,
  withFixedCache: (fn: unknown) => fn,
}));
vi.mock("./woocommerce/revenue", () => ({ getRevenueStats: vi.fn() }));
vi.mock("./woocommerce/orders", () => ({ getOrdersFulfilled: vi.fn() }));
vi.mock("./woocommerce/customers", () => ({ getReturningCustomerRate: vi.fn() }));
vi.mock("./woocommerce/products", () => ({ getTopProductsByRevenue: vi.fn() }));
vi.mock("./woocommerce/sales-channel", () => ({ getSalesByChannel: vi.fn() }));
vi.mock("./ga4/sessions", () => ({
  getSessionsOverTime: vi.fn(),
  getSessionsByDevice: vi.fn(),
  getSessionsByLocation: vi.fn(),
}));
vi.mock("./ga4/funnel", () => ({
  getConversionFunnel: vi.fn(),
  getConversionRateOverTime: vi.fn(),
  getConversionRateSummary: vi.fn(),
}));
vi.mock("./ga4/referrers", () => ({ getSocialReferrerRevenue: vi.fn() }));

import { getReturningCustomerRate } from "./woocommerce/customers";
import { getConversionFunnel, getConversionRateOverTime, getConversionRateSummary } from "./ga4/funnel";
import { getOrdersFulfilled } from "./woocommerce/orders";
import { getTopProductsByRevenue } from "./woocommerce/products";
import { getSocialReferrerRevenue } from "./ga4/referrers";
import { getSalesByChannel } from "./woocommerce/sales-channel";
import { getSessionsByDevice, getSessionsByLocation, getSessionsOverTime } from "./ga4/sessions";
import { getRevenueStats } from "./woocommerce/revenue";
import { getDashboardData } from "./actions";

const revenueStatsResult = {
  current: {
    intervals: [],
    totals: { grossSales: 100, netRevenue: 90, discounts: 0, refunds: 0, shipping: 0, taxes: 0, totalSales: 100, ordersCount: 2, averageOrderValue: 45 },
  },
  previous: {
    intervals: [],
    totals: { grossSales: 80, netRevenue: 70, discounts: 0, refunds: 0, shipping: 0, taxes: 0, totalSales: 80, ordersCount: 2, averageOrderValue: 35 },
  },
};

function mockHappyPath() {
  vi.mocked(getRevenueStats).mockResolvedValue(revenueStatsResult);
  vi.mocked(getOrdersFulfilled).mockResolvedValue({ current: 5, previous: 4 });
  vi.mocked(getReturningCustomerRate).mockResolvedValue({ current: 50, previous: 40 });
  vi.mocked(getTopProductsByRevenue).mockResolvedValue([]);
  vi.mocked(getSalesByChannel).mockResolvedValue([]);
  vi.mocked(getSessionsOverTime).mockResolvedValue([]);
  vi.mocked(getSessionsByDevice).mockResolvedValue([]);
  vi.mocked(getSessionsByLocation).mockResolvedValue([]);
  vi.mocked(getConversionFunnel).mockResolvedValue([]);
  vi.mocked(getConversionRateOverTime).mockResolvedValue([]);
  vi.mocked(getConversionRateSummary).mockResolvedValue({ value: 10, changePercentage: 5, trend: "up" });
  vi.mocked(getSocialReferrerRevenue).mockResolvedValue([]);
}

describe("getDashboardData", () => {
  it("assembles a full DashboardPayload when every fetcher succeeds", async () => {
    mockHappyPath();

    const payload = await getDashboardData("7d");

    expect(payload.summaryCards.grossSales.value).toBe(100);
    expect(payload.errors).toEqual({});
  });

  it("isolates a single fetcher rejection to its card without throwing", async () => {
    mockHappyPath();
    vi.mocked(getSessionsOverTime).mockRejectedValue(new Error("GA4 quota exceeded"));

    const payload = await getDashboardData("7d");

    expect(payload.errors.sessionsOverTime).toBe("GA4 quota exceeded");
    expect(payload.summaryCards.grossSales.value).toBe(100);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- actions`
Expected: FAIL — `Cannot find module './actions'`

- [ ] **Step 3: Implement `src/lib/analytics/actions.ts`**

```typescript
"use server";

import { withFixedCache, withRangeCache } from "./cache";
import { resolveDateRange } from "./date-range";
import { buildDashboardPayload, type RawPipelineResults } from "./normalize";
import { getRevenueStats } from "./woocommerce/revenue";
import { getOrdersFulfilled } from "./woocommerce/orders";
import { getReturningCustomerRate } from "./woocommerce/customers";
import { getTopProductsByRevenue } from "./woocommerce/products";
import { getSalesByChannel } from "./woocommerce/sales-channel";
import { getSessionsByDevice, getSessionsByLocation, getSessionsOverTime } from "./ga4/sessions";
import { getConversionFunnel, getConversionRateOverTime, getConversionRateSummary } from "./ga4/funnel";
import { getSocialReferrerRevenue } from "./ga4/referrers";
import type { DashboardPayload, DateRangeKey } from "./types";

const cachedRevenueStats = withRangeCache(getRevenueStats, "wc-revenue-stats");
const cachedOrdersFulfilled = withRangeCache(getOrdersFulfilled, "wc-orders-fulfilled");
const cachedReturningCustomerRate = withRangeCache(getReturningCustomerRate, "wc-returning-customers");
const cachedTopProducts = withRangeCache(getTopProductsByRevenue, "wc-top-products");
const cachedSalesByChannel = withFixedCache(getSalesByChannel, "wc-sales-by-channel", 14400);
const cachedSessionsOverTime = withRangeCache(getSessionsOverTime, "ga4-sessions-over-time");
const cachedSessionsByDevice = withRangeCache(getSessionsByDevice, "ga4-sessions-by-device");
const cachedSessionsByLocation = withRangeCache(getSessionsByLocation, "ga4-sessions-by-location");
const cachedConversionFunnel = withRangeCache(getConversionFunnel, "ga4-conversion-funnel");
const cachedConversionRateOverTime = withRangeCache(getConversionRateOverTime, "ga4-conversion-rate-over-time");
const cachedConversionRateSummary = withRangeCache(getConversionRateSummary, "ga4-conversion-rate-summary");
const cachedSocialReferrerRevenue = withRangeCache(getSocialReferrerRevenue, "ga4-social-referrer-revenue");

async function settle<T>(promise: Promise<T>): Promise<T | Error> {
  try {
    return await promise;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

export async function getDashboardData(rangeKey: DateRangeKey): Promise<DashboardPayload> {
  const range = resolveDateRange(rangeKey, new Date());

  const [
    revenueStats,
    ordersFulfilled,
    returningCustomerRate,
    salesByProduct,
    salesByChannel,
    sessionsOverTime,
    sessionsByDevice,
    sessionsByLocation,
    conversionFunnel,
    conversionRateOverTime,
    conversionRateSummary,
    totalSalesBySocialReferrer,
  ] = await Promise.all([
    settle(cachedRevenueStats(range)),
    settle(cachedOrdersFulfilled(range)),
    settle(cachedReturningCustomerRate(range)),
    settle(cachedTopProducts(range)),
    settle(cachedSalesByChannel(range)),
    settle(cachedSessionsOverTime(range)),
    settle(cachedSessionsByDevice(range)),
    settle(cachedSessionsByLocation(range)),
    settle(cachedConversionFunnel(range)),
    settle(cachedConversionRateOverTime(range)),
    settle(cachedConversionRateSummary(range)),
    settle(cachedSocialReferrerRevenue(range)),
  ]);

  const raw: RawPipelineResults = {
    revenueStats,
    ordersFulfilled,
    returningCustomerRate,
    salesByProduct,
    salesByChannel,
    sessionsOverTime,
    sessionsByDevice,
    sessionsByLocation,
    conversionFunnel,
    conversionRateOverTime,
    conversionRateSummary,
    totalSalesBySocialReferrer,
  };

  return buildDashboardPayload(raw);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- actions`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/actions.ts src/lib/analytics/actions.test.ts
git commit -m "feat: add getDashboardData Server Action orchestrating both pipelines"
```

---

### Task 16: shadcn/ui + Recharts Install, Inter Font, Page Background

**Files:**
- Modify: `package.json`, `src/app/layout.tsx`, `src/app/globals.css`
- Create: `components.json`, `src/components/ui/card.tsx`, `src/components/ui/table.tsx` (generated by shadcn CLI)

**Interfaces:**
- Produces: `Inter` font applied to `<body>`, `#F6F6F7` background on `<body>`, shadcn `Card`/`Table` primitives available under `@/components/ui/`. Used by Tasks 17–21.

- [ ] **Step 1: Initialize shadcn/ui with defaults**

```bash
npx shadcn@latest init -d
npx shadcn@latest add card table -y
```

- [ ] **Step 2: Install Recharts**

```bash
npm install recharts
```

- [ ] **Step 3: Apply Inter font and background in `src/app/layout.tsx`**

```typescript
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Analytics Dashboard",
  description: "WooCommerce + GA4 analytics dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased bg-[#F6F6F7] text-gray-900`}>{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json components.json src/app/layout.tsx src/app/globals.css src/components/ui
git commit -m "chore: install shadcn/ui and Recharts, apply Inter font and page background"
```

---

### Task 17: `Sparkline` + `SummaryMetricCard` Components

**Files:**
- Create: `src/components/analytics/Sparkline.tsx`
- Create: `src/components/analytics/SummaryMetricCard.tsx`
- Test: `src/components/analytics/SummaryMetricCard.test.tsx`

**Interfaces:**
- Produces: `SparklineProps { data: number[] }`, `Sparkline`; `SummaryMetricCardProps { title: string; value: string; changePercentage: number; trend: "up"|"down"; sparklineData: number[] }`, `SummaryMetricCard`. Used by `src/app/admin/analytics/page.tsx` (Task 21).

- [ ] **Step 1: Write failing test**

`src/components/analytics/SummaryMetricCard.test.tsx`:

```typescript
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SummaryMetricCard } from "./SummaryMetricCard";

describe("SummaryMetricCard", () => {
  it("renders title, value, and a green upward change", () => {
    render(
      <SummaryMetricCard title="Gross sales" value="$74,800.00" changePercentage={26} trend="up" sparklineData={[1, 2, 3]} />
    );

    expect(screen.getByText("Gross sales")).toBeInTheDocument();
    expect(screen.getByText("$74,800.00")).toBeInTheDocument();
    const change = screen.getByText("+26%");
    expect(change).toHaveClass("text-green-600");
  });

  it("renders a red downward change", () => {
    render(
      <SummaryMetricCard title="AOV" value="$60.75" changePercentage={-6} trend="down" sparklineData={[3, 2, 1]} />
    );

    const change = screen.getByText("-6%");
    expect(change).toHaveClass("text-red-600");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- SummaryMetricCard`
Expected: FAIL — `Cannot find module './SummaryMetricCard'`

- [ ] **Step 3: Implement `src/components/analytics/Sparkline.tsx`**

```typescript
"use client";

import { Line, LineChart, ResponsiveContainer } from "recharts";

export interface SparklineProps {
  data: number[];
}

export function Sparkline({ data }: SparklineProps) {
  if (data.length < 2) return null;

  const points = data.map((value, index) => ({ index, value }));
  return (
    <ResponsiveContainer width={80} height={32}>
      <LineChart data={points}>
        <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 4: Implement `src/components/analytics/SummaryMetricCard.tsx`**

```typescript
import { Sparkline } from "./Sparkline";

export interface SummaryMetricCardProps {
  title: string;
  value: string;
  changePercentage: number;
  trend: "up" | "down";
  sparklineData: number[];
}

export function SummaryMetricCard({ title, value, changePercentage, trend, sparklineData }: SummaryMetricCardProps) {
  const trendColor = trend === "up" ? "text-green-600" : "text-red-600";
  const trendSign = trend === "up" ? "+" : "-";

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-500">{title}</p>
        <p className="text-2xl font-semibold">{value}</p>
        <p className={`text-sm ${trendColor}`}>
          {trendSign}
          {Math.abs(changePercentage)}%
        </p>
      </div>
      <Sparkline data={sparklineData} />
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- SummaryMetricCard`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/analytics/Sparkline.tsx src/components/analytics/SummaryMetricCard.tsx src/components/analytics/SummaryMetricCard.test.tsx
git commit -m "feat: add Sparkline and SummaryMetricCard components"
```

---

### Task 18: `TimeSeriesChart` Component

**Files:**
- Create: `src/components/analytics/TimeSeriesChart.tsx`
- Test: `src/components/analytics/TimeSeriesChart.test.tsx`

**Interfaces:**
- Consumes: `TimeSeriesData` (from `@/lib/analytics/types`).
- Produces: `buildChartSeries(data: TimeSeriesData[]): { date: string; currentPeriod: number; previousPeriod: number }[]`, `TimeSeriesChartProps { title: string; data: TimeSeriesData[]; formatValue?: (value: number) => string }`, `TimeSeriesChart`. Reused across Sessions/Conversion-rate/Sales/AOV-over-time cards in `src/app/admin/analytics/page.tsx` (Task 21).

- [ ] **Step 1: Write failing tests**

`src/components/analytics/TimeSeriesChart.test.tsx`:

```typescript
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { buildChartSeries, TimeSeriesChart } from "./TimeSeriesChart";

describe("buildChartSeries", () => {
  it("maps TimeSeriesData points to chart series points", () => {
    const result = buildChartSeries([{ date: "Aug 1", currentPeriod: 10, previousPeriod: 5 }]);
    expect(result).toEqual([{ date: "Aug 1", currentPeriod: 10, previousPeriod: 5 }]);
  });
});

describe("TimeSeriesChart", () => {
  it("renders the title without crashing given data", () => {
    render(<TimeSeriesChart title="Sessions over time" data={[{ date: "Aug 1", currentPeriod: 10, previousPeriod: 5 }]} />);
    expect(screen.getByText("Sessions over time")).toBeInTheDocument();
  });

  it("renders without crashing given an empty series", () => {
    render(<TimeSeriesChart title="Sessions over time" data={[]} />);
    expect(screen.getByText("Sessions over time")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- TimeSeriesChart`
Expected: FAIL — `Cannot find module './TimeSeriesChart'`

- [ ] **Step 3: Implement `src/components/analytics/TimeSeriesChart.tsx`**

```typescript
"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TimeSeriesData } from "@/lib/analytics/types";

export interface TimeSeriesChartProps {
  title: string;
  data: TimeSeriesData[];
  formatValue?: (value: number) => string;
}

export function buildChartSeries(
  data: TimeSeriesData[]
): { date: string; currentPeriod: number; previousPeriod: number }[] {
  return data.map((point) => ({
    date: point.date,
    currentPeriod: point.currentPeriod,
    previousPeriod: point.previousPeriod,
  }));
}

export function TimeSeriesChart({ title, data, formatValue }: TimeSeriesChartProps) {
  const series = buildChartSeries(data);
  const format = formatValue ?? ((value: number) => String(value));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <p className="text-sm text-gray-500 mb-2">{title}</p>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={series}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={format} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(value: number) => format(value)} />
          <Area type="monotone" dataKey="currentPeriod" stroke="#2563eb" strokeWidth={2} fill="#2563eb" fillOpacity={0.1} />
          <Area type="monotone" dataKey="previousPeriod" stroke="#2563eb" strokeWidth={2} strokeDasharray="4 4" fill="transparent" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- TimeSeriesChart`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/analytics/TimeSeriesChart.tsx src/components/analytics/TimeSeriesChart.test.tsx
git commit -m "feat: add TimeSeriesChart dual-line component"
```

---

### Task 19: `FunnelChart`, `DonutBreakdown`, `RankedList` Components

**Files:**
- Create: `src/components/analytics/FunnelChart.tsx`
- Create: `src/components/analytics/DonutBreakdown.tsx`
- Create: `src/components/analytics/RankedList.tsx`
- Test: `src/components/analytics/FunnelChart.test.tsx`
- Test: `src/components/analytics/DonutBreakdown.test.tsx`
- Test: `src/components/analytics/RankedList.test.tsx`

**Interfaces:**
- Consumes: `FunnelStep`, `NamedValue` (from `@/lib/analytics/types`).
- Produces: `FunnelChart`, `DonutBreakdown`, `RankedList` (each with a `title` prop plus its data prop). Used by `src/app/admin/analytics/page.tsx` (Task 21).

- [ ] **Step 1: Write failing test for `FunnelChart`**

`src/components/analytics/FunnelChart.test.tsx`:

```typescript
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FunnelChart } from "./FunnelChart";

describe("FunnelChart", () => {
  it("renders each step's label, percentage, and session count", () => {
    render(
      <FunnelChart
        title="Conversion rate breakdown"
        steps={[
          { step: "Sessions", sessions: 5516, percentage: 100 },
          { step: "Completed checkout", sessions: 552, percentage: 10 },
        ]}
      />
    );

    expect(screen.getByText("Sessions")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("552")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- FunnelChart`
Expected: FAIL — `Cannot find module './FunnelChart'`

- [ ] **Step 3: Implement `src/components/analytics/FunnelChart.tsx`**

```typescript
import type { FunnelStep } from "@/lib/analytics/types";

export interface FunnelChartProps {
  title: string;
  steps: FunnelStep[];
}

export function FunnelChart({ title, steps }: FunnelChartProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <p className="text-sm text-gray-500 mb-4">{title}</p>
      <div className="flex gap-4">
        {steps.map((step) => (
          <div key={step.step} className="flex-1">
            <p className="text-xs text-gray-500">{step.step}</p>
            <p className="text-2xl font-semibold">{step.percentage}%</p>
            <p className="text-xs text-gray-400">{step.sessions.toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- FunnelChart`
Expected: PASS

- [ ] **Step 5: Write failing test for `DonutBreakdown`**

`src/components/analytics/DonutBreakdown.test.tsx`:

```typescript
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DonutBreakdown } from "./DonutBreakdown";

describe("DonutBreakdown", () => {
  it("renders the title and a legend entry with percentage per item", () => {
    render(
      <DonutBreakdown
        title="Sessions by device type"
        data={[
          { name: "Mobile", value: 75 },
          { name: "Desktop", value: 25 },
        ]}
      />
    );

    expect(screen.getByText("Sessions by device type")).toBeInTheDocument();
    expect(screen.getByText("Mobile")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- DonutBreakdown`
Expected: FAIL — `Cannot find module './DonutBreakdown'`

- [ ] **Step 7: Implement `src/components/analytics/DonutBreakdown.tsx`**

```typescript
"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import type { NamedValue } from "@/lib/analytics/types";

export interface DonutBreakdownProps {
  title: string;
  data: NamedValue[];
}

const COLORS = ["#2563eb", "#7c3aed", "#0891b2", "#db2777", "#ea580c"];

export function DonutBreakdown({ title, data }: DonutBreakdownProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <p className="text-sm text-gray-500 mb-2">{title}</p>
      <div className="flex items-center gap-4">
        <ResponsiveContainer width={140} height={140}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={65}>
              {data.map((entry, index) => (
                <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <ul className="text-sm space-y-1">
          {data.map((item, index) => (
            <li key={item.name} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
              <span>{item.name}</span>
              <span className="text-gray-400">{total === 0 ? 0 : Math.round((item.value / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- DonutBreakdown`
Expected: PASS

- [ ] **Step 9: Write failing test for `RankedList`**

`src/components/analytics/RankedList.test.tsx`:

```typescript
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RankedList } from "./RankedList";

describe("RankedList", () => {
  it("renders each item's name and formatted value in list order", () => {
    render(
      <RankedList
        title="Total sales by product"
        items={[
          { name: "Cocoa Flavanols", value: 23678.06 },
          { name: "Magnesium Sleep Aid", value: 5134.49 },
        ]}
        formatValue={(v) => `$${v.toFixed(2)}`}
      />
    );

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Cocoa Flavanols");
    expect(rows[0]).toHaveTextContent("$23678.06");
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `npm test -- RankedList`
Expected: FAIL — `Cannot find module './RankedList'`

- [ ] **Step 11: Implement `src/components/analytics/RankedList.tsx`**

```typescript
import type { NamedValue } from "@/lib/analytics/types";

export interface RankedListProps {
  title: string;
  items: NamedValue[];
  formatValue?: (value: number) => string;
}

export function RankedList({ title, items, formatValue }: RankedListProps) {
  const format = formatValue ?? ((value: number) => value.toLocaleString());

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <p className="text-sm text-gray-500 mb-2">{title}</p>
      <ul className="divide-y divide-gray-100">
        {items.map((item) => (
          <li key={item.name} className="flex items-center justify-between py-2 text-sm">
            <span>{item.name}</span>
            <span className="font-medium">{format(item.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 12: Run test to verify it passes**

Run: `npm test -- RankedList`
Expected: PASS

- [ ] **Step 13: Commit**

```bash
git add src/components/analytics/FunnelChart.tsx src/components/analytics/FunnelChart.test.tsx src/components/analytics/DonutBreakdown.tsx src/components/analytics/DonutBreakdown.test.tsx src/components/analytics/RankedList.tsx src/components/analytics/RankedList.test.tsx
git commit -m "feat: add FunnelChart, DonutBreakdown, and RankedList components"
```

---

### Task 20: `CardError` + `DashboardDateFilter` Components

**Files:**
- Create: `src/components/analytics/CardError.tsx`
- Create: `src/components/analytics/DashboardDateFilter.tsx`
- Test: `src/components/analytics/CardError.test.tsx`
- Test: `src/components/analytics/DashboardDateFilter.test.tsx`

**Interfaces:**
- Consumes: `DateRangeKey` (from `@/lib/analytics/types`), `useRouter`/`useSearchParams` (from `next/navigation`).
- Produces: `CardErrorProps { title: string; message: string }`, `CardError`; `DashboardDateFilter` (no props, reads `?range=` from the URL). Used by `src/app/admin/analytics/page.tsx` (Task 21).

- [ ] **Step 1: Write failing test for `CardError`**

`src/components/analytics/CardError.test.tsx`:

```typescript
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CardError } from "./CardError";

describe("CardError", () => {
  it("renders the card title and the error message", () => {
    render(<CardError title="Sessions over time" message="GA4 quota exceeded" />);

    expect(screen.getByText("Sessions over time")).toBeInTheDocument();
    expect(screen.getByText(/GA4 quota exceeded/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- CardError`
Expected: FAIL — `Cannot find module './CardError'`

- [ ] **Step 3: Implement `src/components/analytics/CardError.tsx`**

```typescript
export interface CardErrorProps {
  title: string;
  message: string;
}

export function CardError({ title, message }: CardErrorProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <p className="text-sm text-gray-500 mb-2">{title}</p>
      <p className="text-sm text-red-600">Couldn&apos;t load this data: {message}</p>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- CardError`
Expected: PASS

- [ ] **Step 5: Write failing test for `DashboardDateFilter`**

`src/components/analytics/DashboardDateFilter.test.tsx`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(""),
}));

import { DashboardDateFilter } from "./DashboardDateFilter";

describe("DashboardDateFilter", () => {
  it("defaults to 'Today' as active and pushes ?range=7d when 'Last 7 Days' is clicked", () => {
    render(<DashboardDateFilter />);

    const todayButton = screen.getByText("Today");
    expect(todayButton).toHaveClass("bg-gray-900");

    fireEvent.click(screen.getByText("Last 7 Days"));

    expect(pushMock).toHaveBeenCalledWith("?range=7d");
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- DashboardDateFilter`
Expected: FAIL — `Cannot find module './DashboardDateFilter'`

- [ ] **Step 7: Implement `src/components/analytics/DashboardDateFilter.tsx`**

```typescript
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { DateRangeKey } from "@/lib/analytics/types";

const OPTIONS: { key: DateRangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 Days" },
  { key: "30d", label: "Last 30 Days" },
];

export function DashboardDateFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeRange = (searchParams.get("range") as DateRangeKey | null) ?? "today";

  function handleSelect(key: DateRangeKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", key);
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex gap-2">
      {OPTIONS.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => handleSelect(option.key)}
          className={`px-3 py-1.5 rounded-lg text-sm border ${
            activeRange === option.key ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-700 border-gray-200"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- DashboardDateFilter`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/components/analytics/CardError.tsx src/components/analytics/CardError.test.tsx src/components/analytics/DashboardDateFilter.tsx src/components/analytics/DashboardDateFilter.test.tsx
git commit -m "feat: add CardError and DashboardDateFilter components"
```

---

### Task 21: Assemble `/admin/analytics` Page

**Files:**
- Create: `src/app/admin/analytics/page.tsx`

**Interfaces:**
- Consumes: `getDashboardData` (from `@/lib/analytics/actions`), `DateRangeKey` (from `@/lib/analytics/types`), all components from Tasks 17–20.
- Produces: the `/admin/analytics` route.

This task requires real WooCommerce and GA4 credentials in `.env.local` (see `.env.example` from Task 4) — it's the first point in the plan where the app talks to the live APIs, so it's verified manually rather than with an automated test.

- [ ] **Step 1: Add real credentials to `.env.local`**

Copy `.env.example` to `.env.local` and fill in the real WooCommerce and GA4 values. `.env.local` is already gitignored by the Next.js scaffold — confirm with `git check-ignore .env.local` before proceeding (expected output: `.env.local`).

- [ ] **Step 2: Implement `src/app/admin/analytics/page.tsx`**

```typescript
import { getDashboardData } from "@/lib/analytics/actions";
import { DashboardDateFilter } from "@/components/analytics/DashboardDateFilter";
import { SummaryMetricCard } from "@/components/analytics/SummaryMetricCard";
import { TimeSeriesChart } from "@/components/analytics/TimeSeriesChart";
import { FunnelChart } from "@/components/analytics/FunnelChart";
import { DonutBreakdown } from "@/components/analytics/DonutBreakdown";
import { RankedList } from "@/components/analytics/RankedList";
import { CardError } from "@/components/analytics/CardError";
import type { DateRangeKey } from "@/lib/analytics/types";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range } = await searchParams;
  const rangeKey = (range as DateRangeKey) ?? "today";
  const data = await getDashboardData(rangeKey);

  return (
    <div className="min-h-screen bg-[#F6F6F7] p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <DashboardDateFilter />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <SummaryMetricCard
          title="Gross sales"
          value={formatCurrency(data.summaryCards.grossSales.value)}
          changePercentage={data.summaryCards.grossSales.changePercentage}
          trend={data.summaryCards.grossSales.trend}
          sparklineData={data.summaryCards.grossSales.sparkline ?? []}
        />
        <SummaryMetricCard
          title="Conversion rate"
          value={formatPercent(data.summaryCards.conversionRate.value)}
          changePercentage={data.summaryCards.conversionRate.changePercentage}
          trend={data.summaryCards.conversionRate.trend}
          sparklineData={data.summaryCards.conversionRate.sparkline ?? []}
        />
        <SummaryMetricCard
          title="Orders fulfilled"
          value={data.summaryCards.ordersFulfilled.value.toLocaleString()}
          changePercentage={data.summaryCards.ordersFulfilled.changePercentage}
          trend={data.summaryCards.ordersFulfilled.trend}
          sparklineData={data.summaryCards.ordersFulfilled.sparkline ?? []}
        />
        <SummaryMetricCard
          title="Orders"
          value={data.summaryCards.orders.value.toLocaleString()}
          changePercentage={data.summaryCards.orders.changePercentage}
          trend={data.summaryCards.orders.trend}
          sparklineData={data.summaryCards.orders.sparkline ?? []}
        />
        <SummaryMetricCard
          title="Returning customer rate"
          value={formatPercent(data.summaryCards.returningCustomerRate.value)}
          changePercentage={data.summaryCards.returningCustomerRate.changePercentage}
          trend={data.summaryCards.returningCustomerRate.trend}
          sparklineData={data.summaryCards.returningCustomerRate.sparkline ?? []}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {data.errors.sessionsOverTime ? (
          <CardError title="Sessions over time" message={data.errors.sessionsOverTime} />
        ) : (
          <TimeSeriesChart title="Sessions over time" data={data.charts.sessionsOverTime} />
        )}
        {data.errors.conversionRateOverTime ? (
          <CardError title="Conversion rate over time" message={data.errors.conversionRateOverTime} />
        ) : (
          <TimeSeriesChart title="Conversion rate over time" data={data.charts.conversionRateOverTime} formatValue={formatPercent} />
        )}
        {data.errors.conversionFunnel ? (
          <CardError title="Conversion rate breakdown" message={data.errors.conversionFunnel} />
        ) : (
          <FunnelChart title="Conversion rate breakdown" steps={data.charts.conversionFunnel} />
        )}
        {data.errors.sessionsByDevice ? (
          <CardError title="Sessions by device type" message={data.errors.sessionsByDevice} />
        ) : (
          <DonutBreakdown title="Sessions by device type" data={data.charts.sessionsByDevice} />
        )}
        {data.errors.sessionsByLocation ? (
          <CardError title="Sessions by location" message={data.errors.sessionsByLocation} />
        ) : (
          <RankedList title="Sessions by location" items={data.charts.sessionsByLocation} />
        )}
        {data.errors.totalSalesBySocialReferrer ? (
          <CardError title="Total sales by social referrer" message={data.errors.totalSalesBySocialReferrer} />
        ) : (
          <RankedList title="Total sales by social referrer" items={data.charts.totalSalesBySocialReferrer} formatValue={formatCurrency} />
        )}
        {data.errors.salesOverTime ? (
          <CardError title="Total sales over time" message={data.errors.salesOverTime} />
        ) : (
          <TimeSeriesChart title="Total sales over time" data={data.charts.salesOverTime} formatValue={formatCurrency} />
        )}
        {data.errors.salesBreakdown ? (
          <CardError title="Total sales breakdown" message={data.errors.salesBreakdown} />
        ) : (
          <RankedList
            title="Total sales breakdown"
            items={data.charts.salesBreakdown.map((line) => ({ name: line.label, value: line.value }))}
            formatValue={formatCurrency}
          />
        )}
        {data.errors.salesByChannel ? (
          <CardError title="Total sales by sales channel" message={data.errors.salesByChannel} />
        ) : (
          <DonutBreakdown title="Total sales by sales channel" data={data.charts.salesByChannel} />
        )}
        {data.errors.aovOverTime ? (
          <CardError title="Average order value over time" message={data.errors.aovOverTime} />
        ) : (
          <TimeSeriesChart title="Average order value over time" data={data.charts.aovOverTime} formatValue={formatCurrency} />
        )}
        {data.errors.salesByProduct ? (
          <CardError title="Total sales by product" message={data.errors.salesByProduct} />
        ) : (
          <RankedList title="Total sales by product" items={data.charts.salesByProduct} formatValue={formatCurrency} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run the full test suite and the build**

Run: `npm test`
Expected: all tests PASS.

Run: `npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 4: Manually verify against live data**

Run: `npm run dev`, open `http://localhost:3000/admin/analytics`.

Check:
- All 5 summary cards and 11 chart/list cards render with real numbers (or a `CardError` if a specific pipeline call fails — check the browser console / terminal for the underlying error).
- Clicking "Today" / "Last 7 Days" / "Last 30 Days" changes the URL to `?range=today|7d|30d` and the numbers update accordingly.
- Background is `#F6F6F7`, cards are white with rounded corners and a soft border.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/analytics/page.tsx
git commit -m "feat: assemble /admin/analytics overview page"
```

---

## Self-Review Notes

- **Spec coverage:** every Pass-1 card from the design spec has a task producing it (summary row → Tasks 6, 7, 12, 14; all 11 chart/list cards → Tasks 6, 8, 9, 11, 12, 13, 14). Caching rules (Global Constraints) → Task 5 + wiring in Task 15. Env/auth setup → Task 4. Styling → Task 16. Error isolation → Tasks 14–15, rendered in Task 21.
- **Deviation flagged inline:** the spec's `SummaryMetricCard` requires a sparkline, but `DashboardPayload` as specified only carries single before/after values for summary metrics, not a series. Resolved by adding an optional `sparkline?: number[]` to `ChangeMetric` (Task 2), populated for `grossSales`, `orders`, and `conversionRate` (which already have per-interval data from other cards) and left empty for `ordersFulfilled`/`returningCustomerRate` (no per-interval source in Pass 1). `Sparkline` renders nothing when given fewer than 2 points.
- **Placeholder scan:** no TBD/TODO markers; the one documented limitation (customers report capped at 100 rows/period in Task 7) is a stated, reasoned trade-off, not an unfinished stub.
- **Type consistency:** `ResolvedDateRange`/`PeriodBounds` (Task 2) are used with identical shape by every fetcher (Tasks 6–13); `RevenueStatsResult` (Task 6) fields match exactly what Task 14's `salesOverTimeFrom`/`aovOverTimeFrom`/`salesBreakdownFrom` consume; `CardKey` (Task 2) values match every key used in `normalize.ts`'s `unwrap()` calls (Task 14) and every key read in `page.tsx` (Task 21).

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-07-ecommerce-analytics-dashboard.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
