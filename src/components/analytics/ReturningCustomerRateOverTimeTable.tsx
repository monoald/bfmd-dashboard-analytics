import type { ReturningCustomerRateBreakdownRow } from "@/lib/analytics/types";
import { formatPercent } from "@/lib/analytics/format";
import { computeChange } from "@/lib/analytics/normalize";
import { CARD_CLASS, trendArrow, trendBadgeClass } from "./theme";

export interface ReturningCustomerRateOverTimeTableProps {
  data: ReturningCustomerRateBreakdownRow[];
  // Whole-period totals for the summary row — NOT summed from `data`, unlike
  // every other breakdown table on this dashboard. Customer counts aren't
  // additive across buckets (see ReturningCustomerRateBreakdownRow's
  // comment), so the summary row uses the real headline numbers instead.
  summary: {
    returningCustomers: { current: number; previous: number };
    customers: { current: number; previous: number };
    returningCustomerRate: { current: number; previous: number };
  };
}

// The summary row shows just the date ("Sep 2, 2026"), not each row's full
// date+time label ("Sep 2, 2026, 12:00 AM") — strips the time suffix when
// present; a no-op for day/week-interval labels, which never have one.
function dateOnly(label: string): string {
  return label.replace(/,\s*\d{1,2}:\d{2}\s*[AP]M$/, "");
}

interface ColumnSummary {
  heading: string;
  current: number;
  previous: number;
  format: (value: number) => string;
  row: (r: ReturningCustomerRateBreakdownRow) => { current: number; previous: number };
}

export function ReturningCustomerRateOverTimeTable({
  data,
  summary,
}: ReturningCustomerRateOverTimeTableProps) {
  if (data.length === 0) return null;

  const columns: ColumnSummary[] = [
    {
      heading: "Returning customers",
      ...summary.returningCustomers,
      format: (v) => v.toLocaleString(),
      row: (r) => r.returningCustomers,
    },
    {
      heading: "Customers",
      ...summary.customers,
      format: (v) => v.toLocaleString(),
      row: (r) => r.customers,
    },
    {
      heading: "Returning customer rate",
      ...summary.returningCustomerRate,
      format: (v) => formatPercent(v),
      row: (r) => r.returningCustomerRate,
    },
  ];

  // Rows are already most-recent-first (see getReturningCustomerRateBreakdown),
  // matching the display convention every other WC-sourced breakdown table
  // uses, so the period's actual start date is the *last* row.
  const periodStart = data[data.length - 1];
  const currentLabel = dateOnly(periodStart.currentDateLabel);
  const previousLabel = dateOnly(periodStart.previousDateLabel);

  return (
    <div className={`${CARD_CLASS} overflow-x-auto`}>
      <table className="w-full min-w-full text-left text-[12px]">
        <thead>
          <tr className="border-b border-(--analytics-border) text-(--analytics-t2)">
            <th className="py-2 pr-4 font-semibold">Date</th>
            {columns.map((col) => (
              <th key={col.heading} className="py-2 pr-4 font-semibold">
                {col.heading}
              </th>
            ))}
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
            {columns.map((col) => {
              const change = computeChange(col.current, col.previous);
              return (
                <td
                  key={col.heading}
                  className="py-2 pr-4 align-top tabular-nums"
                >
                  <div className="font-extrabold text-(--analytics-t1)">
                    {col.format(col.current)}
                  </div>
                  <div className="text-(--analytics-t2)">
                    {col.format(col.previous)}
                  </div>
                  <div className="mt-1">
                    <span className={trendBadgeClass(change.trend)}>
                      {trendArrow(change.trend)}{" "}
                      {Math.abs(change.changePercentage)}%
                    </span>
                  </div>
                </td>
              );
            })}
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
              {columns.map((col) => {
                const { current, previous } = col.row(r);
                return (
                  <td
                    key={col.heading}
                    className="py-2 pr-4 align-top tabular-nums"
                  >
                    <div className="font-semibold text-(--analytics-t1)">
                      {col.format(current)}
                    </div>
                    <div className="text-(--analytics-t2)">
                      {col.format(previous)}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
