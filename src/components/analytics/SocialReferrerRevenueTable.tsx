import type { NamedValue } from "@/lib/analytics/types";
import { formatCurrency } from "@/lib/analytics/format";
import { computeChange } from "@/lib/analytics/normalize";
import { CARD_CLASS, trendArrow, trendBadgeClass } from "./theme";

export interface SocialReferrerRevenueTableProps {
  data: NamedValue[];
}

function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

export function SocialReferrerRevenueTable({
  data,
}: SocialReferrerRevenueTableProps) {
  if (data.length === 0) return null;

  const current = sum(data.map((r) => r.value));
  const previous = sum(data.map((r) => r.previousValue ?? 0));
  const change = computeChange(current, previous);

  return (
    <div className={`${CARD_CLASS} overflow-x-auto`}>
      <table className="w-full min-w-full text-left text-[12px]">
        <thead>
          <tr className="border-b border-(--analytics-border) text-(--analytics-t2)">
            <th className="py-2 pr-4 font-semibold">Order referrer name</th>
            <th className="py-2 pr-4 font-semibold">Total sales</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-(--analytics-border)">
            <td className="py-2 pr-4 align-top font-extrabold text-(--analytics-t1)">
              Summary
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
                  {trendArrow(change.trend)}{" "}
                  {Math.abs(change.changePercentage)}%
                </span>
              </div>
            </td>
          </tr>
          {data.map((row) => (
            <tr key={row.name} className="border-b border-(--analytics-border)">
              <td className="py-2 pr-4 align-top text-(--analytics-t1)">
                {row.name}
              </td>
              <td className="py-2 pr-4 align-top tabular-nums">
                <div className="font-semibold text-(--analytics-t1)">
                  {formatCurrency(row.value)}
                </div>
                <div className="text-(--analytics-t2)">
                  {formatCurrency(row.previousValue ?? 0)}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="pt-3 text-center text-[11px] text-(--analytics-t2)">
        {data.length} rows
      </div>
    </div>
  );
}
