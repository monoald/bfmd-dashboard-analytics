import {
  averageSeries,
  computeChange,
  sumSeries,
} from "@/lib/analytics/normalize";
import type { TimeSeriesData } from "@/lib/analytics/types";
import { CARD_CLASS, trendArrow, trendBadgeClass } from "./theme";

export interface TimeSeriesReportTableProps {
  data: TimeSeriesData[];
  formatValue: (value: number) => string;
  aggregate?: "sum" | "average";
  // For a rate/ratio series (e.g. conversion rate), neither summing nor
  // averaging the per-bucket values gives the correct period total — pass
  // the correctly-weighted current/previous here instead (see
  // normalize.ts's weightedRate) and `aggregate` is ignored.
  totalOverride?: { current: number; previous: number };
}

export function TimeSeriesReportTable({
  data,
  formatValue,
  aggregate = "sum",
  totalOverride,
}: TimeSeriesReportTableProps) {
  if (data.length === 0) return null;

  const aggregateFn = aggregate === "average" ? averageSeries : sumSeries;
  const totalCurrent = totalOverride?.current ?? aggregateFn(data, "currentPeriod");
  const totalPrevious =
    totalOverride?.previous ?? aggregateFn(data, "previousPeriod");
  const totalChange = computeChange(totalCurrent, totalPrevious);
  const totalLabel = totalOverride
    ? "Total"
    : aggregate === "average"
      ? "Average"
      : "Total";

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
              {totalLabel}
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
