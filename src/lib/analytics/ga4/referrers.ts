import { runGa4Report } from "./client";
import { toIsoDate } from "./format";
import type { NamedValue, PeriodBounds, ResolvedDateRange } from "../types";

async function fetchSocialReferrerMap(
  period: PeriodBounds,
): Promise<Map<string, number>> {
  const rows = await runGa4Report({
    dimensions: ["sessionSourceMedium"],
    metrics: ["purchaseRevenue"],
    startDate: toIsoDate(period.start),
    endDate: toIsoDate(period.end),
    dimensionFilter: { fieldName: "sessionMedium", value: "social" },
  });

  const map = new Map<string, number>();
  for (const row of rows) {
    const name = row.dimensionValues[0].split(" / ")[0];
    map.set(name, Math.round(row.metricValues[0] * 100) / 100);
  }
  return map;
}

export async function getSocialReferrerRevenue(
  range: ResolvedDateRange,
): Promise<NamedValue[]> {
  const [currentMap, previousMap] = await Promise.all([
    fetchSocialReferrerMap(range.current),
    fetchSocialReferrerMap(range.previous),
  ]);

  return [...currentMap.entries()]
    .map(([name, value]) => ({
      name,
      value,
      previousValue: previousMap.get(name) ?? 0,
    }))
    .sort((a, b) => b.value - a.value);
}
