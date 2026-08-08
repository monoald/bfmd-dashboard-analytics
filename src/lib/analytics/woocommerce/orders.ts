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
