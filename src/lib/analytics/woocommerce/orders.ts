import { fetchWc, fetchWcCount } from "./client";
import type { PeriodBounds, ResolvedDateRange } from "../types";

// Uses the WC Analytics API's array-style status_is[] filter (distinct from the
// core REST API's plain `status` param) — verify against a live store once
// real credentials are available; this is currently untested against the real API.
export async function getOrdersFulfilled(
  range: ResolvedDateRange,
): Promise<{ current: number; previous: number }> {
  const [current, previous] = await Promise.all([
    fetchWcCount("/wc-analytics/reports/orders", {
      "status_is[]": "completed",
      after: range.current.start.toISOString(),
      before: range.current.end.toISOString(),
    }),
    fetchWcCount("/wc-analytics/reports/orders", {
      "status_is[]": "completed",
      after: range.previous.start.toISOString(),
      before: range.previous.end.toISOString(),
    }),
  ]);
  return { current, previous };
}

interface WcOrdersStatsResponse {
  intervals: Array<{
    date_start: string;
    subtotals: { num_items_sold: number };
  }>;
}

export interface ItemsSoldInterval {
  date: string;
  itemsSold: number;
}

async function fetchItemsSoldForPeriod(
  period: PeriodBounds,
  interval: "hour" | "day" | "week",
): Promise<ItemsSoldInterval[]> {
  const raw = await fetchWc<WcOrdersStatsResponse>(
    "/wc-analytics/reports/orders/stats",
    {
      after: period.start.toISOString(),
      before: period.end.toISOString(),
      interval,
      per_page: "100",
    },
  );
  return raw.intervals.map((i) => ({
    date: i.date_start,
    itemsSold: i.subtotals.num_items_sold,
  }));
}

export async function getItemsSoldOverTime(
  range: ResolvedDateRange,
): Promise<{ current: ItemsSoldInterval[]; previous: ItemsSoldInterval[] }> {
  const [current, previous] = await Promise.all([
    fetchItemsSoldForPeriod(range.current, range.interval),
    fetchItemsSoldForPeriod(range.previous, range.interval),
  ]);
  return { current, previous };
}
