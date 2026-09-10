import type { ChangeMetric, SalesOverTimeBreakdownRow } from "@/lib/analytics/types";
import { formatCurrency } from "@/lib/analytics/format";
import { computeChange } from "@/lib/analytics/normalize";
import { CARD_CLASS, trendArrow, trendBadgeClass } from "./theme";

export interface TotalSalesBreakdownTableProps {
  data: SalesOverTimeBreakdownRow[];
}

function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

function dateOnly(label: string): string {
  return label.replace(/,\s*\d{1,2}:\d{2}\s*[AP]M$/, "");
}

interface ColumnSummary {
  heading: string;
  current: number;
  previous: number;
  change: ChangeMetric;
  row: (r: SalesOverTimeBreakdownRow) => { current: number; previous: number };
}

export function TotalSalesBreakdownTable({
  data,
}: TotalSalesBreakdownTableProps) {
  if (data.length === 0) return null;

  function columnTotal(
    pick: (r: SalesOverTimeBreakdownRow) => { current: number; previous: number },
  ) {
    const current = sum(data.map((r) => pick(r).current));
    const previous = sum(data.map((r) => pick(r).previous));
    return { current, previous, change: computeChange(current, previous) };
  }

  const columns: ColumnSummary[] = [
    {
      heading: "Gross Sales",
      ...columnTotal((r) => r.grossSales),
      row: (r) => r.grossSales,
    },
    {
      heading: "Discounts",
      ...columnTotal((r) => r.discounts),
      row: (r) => r.discounts,
    },
    {
      heading: "Sales Reversal",
      ...columnTotal((r) => r.salesReversals),
      row: (r) => r.salesReversals,
    },
    {
      heading: "Net Sales",
      ...columnTotal((r) => r.netSales),
      row: (r) => r.netSales,
    },
    {
      heading: "Shipping Charges",
      ...columnTotal((r) => r.shippingCharges),
      row: (r) => r.shippingCharges,
    },
    {
      heading: "Returning Fees",
      ...columnTotal((r) => r.duties),
      row: (r) => r.duties,
    },
    {
      heading: "Taxes",
      ...columnTotal((r) => r.taxes),
      row: (r) => r.taxes,
    },
    {
      heading: "Total Sales",
      ...columnTotal((r) => r.totalSales),
      row: (r) => r.totalSales,
    },
  ];

  const periodStart = data[data.length - 1];
  const currentLabel = dateOnly(periodStart.currentDateLabel);
  const previousLabel = dateOnly(periodStart.previousDateLabel);

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
                  {formatCurrency(col.current)}
                </div>
                <div className="text-(--analytics-t2)">
                  {formatCurrency(col.previous)}
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
                      {formatCurrency(current)}
                    </div>
                    <div className="text-(--analytics-t2)">
                      {formatCurrency(previous)}
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
