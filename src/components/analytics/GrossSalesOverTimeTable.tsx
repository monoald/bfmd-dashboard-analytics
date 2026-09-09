import type { SalesOverTimeBreakdownRow } from "@/lib/analytics/types";
import { formatCurrency } from "@/lib/analytics/format";
import { computeChange } from "@/lib/analytics/normalize";
import { CARD_CLASS, trendArrow, trendBadgeClass } from "./theme";

export interface GrossSalesOverTimeTableProps {
  data: SalesOverTimeBreakdownRow[];
}

function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

// The summary row shows just the date ("Sep 2, 2026"), not each row's full
// date+time label ("Sep 2, 2026, 12:00 AM") — strips the time suffix when
// present; a no-op for day/week-interval labels, which never have one.
function dateOnly(label: string): string {
  return label.replace(/,\s*\d{1,2}:\d{2}\s*[AP]M$/, "");
}

export function GrossSalesOverTimeTable({
  data,
}: GrossSalesOverTimeTableProps) {
  if (data.length === 0) return null;

  const current = sum(data.map((r) => r.grossSales.current));
  const previous = sum(data.map((r) => r.grossSales.previous));
  const change = computeChange(current, previous);

  // WC returns intervals in descending order (most recent first — same
  // convention TotalSalesOverTimeTable/salesOverTime/aovOverTime rely on),
  // so the period's actual start date is the *last* row, not the first.
  const periodStart = data[data.length - 1];
  const currentLabel = dateOnly(periodStart.currentDateLabel);
  const previousLabel = dateOnly(periodStart.previousDateLabel);

  return (
    <div className={`${CARD_CLASS} overflow-x-auto`}>
      <table className="w-full min-w-full text-left text-[12px]">
        <thead>
          <tr className="border-b border-(--analytics-border) text-(--analytics-t2)">
            <th className="py-2 pr-4 font-semibold">Date</th>
            <th className="py-2 pr-4 font-semibold">Gross sales</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-(--analytics-border)">
            <td className="py-2 pr-4 align-top">
              <div className="font-extrabold text-(--analytics-t1)">
                {currentLabel}
              </div>
              <div className="text-(--analytics-t2)">{previousLabel}</div>
              <div className="mt-1 text-(--analytics-t2)">% Change</div>
            </td>
            <td className="py-2 pr-4 align-top tabular-nums">
              <div className="font-extrabold text-(--analytics-t1)">
                {formatCurrency(current)}
              </div>
              <div className="text-(--analytics-t2)">
                {formatCurrency(previous)}
              </div>
              <div className="mt-1">
                <span className={trendBadgeClass(change.trend)}>
                  {trendArrow(change.trend)} {Math.abs(change.changePercentage)}%
                </span>
              </div>
            </td>
          </tr>
          {data.map((r, i) => (
            <tr key={i} className="border-b border-(--analytics-border)">
              <td className="py-2 pr-4 align-top">
                <div className="text-(--analytics-t1)">
                  {r.currentDateLabel}
                </div>
                <div className="text-(--analytics-t2)">
                  {r.previousDateLabel}
                </div>
              </td>
              <td className="py-2 pr-4 align-top tabular-nums">
                <div className="font-semibold text-(--analytics-t1)">
                  {formatCurrency(r.grossSales.current)}
                </div>
                <div className="text-(--analytics-t2)">
                  {formatCurrency(r.grossSales.previous)}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
