import type { ChangeMetric, OrdersOverTimeBreakdownRow } from "@/lib/analytics/types";
import { formatCurrency } from "@/lib/analytics/format";
import { computeChange } from "@/lib/analytics/normalize";
import { CARD_CLASS, trendArrow, trendBadgeClass } from "./theme";

export interface OrdersOverTimeTableProps {
  data: OrdersOverTimeBreakdownRow[];
}

function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

function dateOnly(label: string): string {
  return label.replace(/,\s*\d{1,2}:\d{2}\s*[AP]M$/, "");
}

interface ColumnSummary {
  heading: string;
  format: (value: number) => string;
  current: number;
  previous: number;
  change: ChangeMetric;
  row: (r: OrdersOverTimeBreakdownRow) => { current: number; previous: number };
}

export function OrdersOverTimeTable({ data }: OrdersOverTimeTableProps) {
  if (data.length === 0) return null;

  const ordersCurrent = sum(data.map((r) => r.orders.current));
  const ordersPrevious = sum(data.map((r) => r.orders.previous));
  const reversedQuantityCurrent = sum(
    data.map((r) => r.reversedQuantity.current),
  );
  const reversedQuantityPrevious = sum(
    data.map((r) => r.reversedQuantity.previous),
  );

  const itemsPerOrderCurrent = ordersCurrent
    ? sum(data.map((r) => r.orders.current * r.itemsPerOrder.current)) /
      ordersCurrent
    : 0;
  const itemsPerOrderPrevious = ordersPrevious
    ? sum(data.map((r) => r.orders.previous * r.itemsPerOrder.previous)) /
      ordersPrevious
    : 0;
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
      heading: "Orders",
      format: (v) => v.toLocaleString(),
      current: ordersCurrent,
      previous: ordersPrevious,
      change: computeChange(ordersCurrent, ordersPrevious),
      row: (r) => r.orders,
    },
    {
      heading: "Quantity ordered per order",
      format: (v) => v.toFixed(1),
      current: itemsPerOrderCurrent,
      previous: itemsPerOrderPrevious,
      change: computeChange(itemsPerOrderCurrent, itemsPerOrderPrevious),
      row: (r) => r.itemsPerOrder,
    },
    {
      heading: "Average order value",
      format: formatCurrency,
      current: aovCurrent,
      previous: aovPrevious,
      change: computeChange(aovCurrent, aovPrevious),
      row: (r) => r.averageOrderValue,
    },
    {
      heading: "Reversed quantity",
      format: (v) => v.toLocaleString(),
      current: reversedQuantityCurrent,
      previous: reversedQuantityPrevious,
      change: computeChange(reversedQuantityCurrent, reversedQuantityPrevious),
      row: (r) => r.reversedQuantity,
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
