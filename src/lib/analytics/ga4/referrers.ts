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
