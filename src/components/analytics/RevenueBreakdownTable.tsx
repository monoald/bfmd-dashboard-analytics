import type { ChangeMetric, RevenueBreakdownRow } from "@/lib/analytics/types";
import { formatCurrency } from "@/lib/analytics/format";
import { computeChange } from "@/lib/analytics/normalize";
import { CARD_CLASS, trendArrow, trendBadgeClass } from "./theme";

export interface RevenueBreakdownTableProps {
  data: RevenueBreakdownRow[];
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

interface ColumnSummary {
  heading: string;
  format: (value: number) => string;
  current: number;
  previous: number;
  change: ChangeMetric;
  row: (r: RevenueBreakdownRow) => { current: number; previous: number };
}

export function RevenueBreakdownTable({ data }: RevenueBreakdownTableProps) {
  if (data.length === 0) return null;

  const grossSalesCurrent = sum(data.map((r) => r.grossSales.current));
  const grossSalesPrevious = sum(data.map((r) => r.grossSales.previous));
  const discountsCurrent = sum(data.map((r) => r.discounts.current));
  const discountsPrevious = sum(data.map((r) => r.discounts.previous));
  const ordersCurrent = sum(data.map((r) => r.orders.current));
  const ordersPrevious = sum(data.map((r) => r.orders.previous));

  // Weighted, not a plain average of the per-row AOV values: for each row,
  // orders * averageOrderValue = that row's net revenue exactly (since AOV
  // is defined as netRevenue / orders), so summing that product and
  // dividing by total orders recovers the period's true net-revenue /
  // orders ratio — the same bug the AOV headline had before it was fixed
  // to use totals.averageOrderValue instead of averaging per-bucket values.
  const aovCurrent = ordersCurrent
    ? sum(data.map((r) => r.orders.current * r.averageOrderValue.current)) /
      ordersCurrent
    : 0;
  const aovPrevious = ordersPrevious
    ? sum(data.map((r) => r.orders.previous * r.averageOrderValue.previous)) /
      ordersPrevious
    : 0;

  const columns: ColumnSummary[] = [
    {
      heading: "Gross sales",
      format: formatCurrency,
      current: grossSalesCurrent,
      previous: grossSalesPrevious,
      change: computeChange(grossSalesCurrent, grossSalesPrevious),
      row: (r) => r.grossSales,
    },
    {
      heading: "Discounts",
      format: formatCurrency,
      current: discountsCurrent,
      previous: discountsPrevious,
      change: computeChange(discountsCurrent, discountsPrevious),
      row: (r) => r.discounts,
    },
    {
      heading: "Orders",
      format: (v) => v.toLocaleString(),
      current: ordersCurrent,
      previous: ordersPrevious,
      change: computeChange(ordersCurrent, ordersPrevious),
      row: (r) => r.orders,
    },
    {
      heading: "Average order value",
      format: formatCurrency,
      current: aovCurrent,
      previous: aovPrevious,
      change: computeChange(aovCurrent, aovPrevious),
      row: (r) => r.averageOrderValue,
    },
  ];

  // WC returns intervals in descending order (most recent first — same
  // convention the existing salesOverTime/aovOverTime charts already rely
  // on), so the period's actual start date is the *last* row, not the
  // first: data[0] is the day's last hour, not its first.
  const periodStart = data[data.length - 1];
  const currentLabel = dateOnly(periodStart?.currentDateLabel ?? "");
  const previousLabel = dateOnly(periodStart?.previousDateLabel ?? "");

  return (
    <div className={`${CARD_CLASS} overflow-x-auto`}>
      <table className="w-full min-w-full text-left text-[12px]">
        <thead>
          <tr className="border-b border-(--analytics-border) text-(--analytics-t2)">
            <th className="py-2 pr-4 font-semibold">Hour</th>
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
            {columns.map((col) => (
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
                  <span className={trendBadgeClass(col.change.trend)}>
                    {trendArrow(col.change.trend)}{" "}
                    {Math.abs(col.change.changePercentage)}%
                  </span>
                </div>
              </td>
            ))}
          </tr>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-(--analytics-border)">
              <td className="py-2 pr-4 align-top">
                <div className="text-(--analytics-t1)">
                  {row.currentDateLabel}
                </div>
                <div className="text-(--analytics-t2)">
                  {row.previousDateLabel}
                </div>
              </td>
              {columns.map((col) => {
                const { current, previous } = col.row(row);
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
