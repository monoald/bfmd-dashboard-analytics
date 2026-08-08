import { fetchWcCount } from "./client";
import type { ResolvedDateRange } from "../types";

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
