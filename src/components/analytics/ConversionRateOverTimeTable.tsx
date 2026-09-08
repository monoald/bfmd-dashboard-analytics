import type {
  ChangeMetric,
  ConversionRateOverTimeBreakdownRow,
} from "@/lib/analytics/types";
import { formatPercent } from "@/lib/analytics/format";
import { computeChange } from "@/lib/analytics/normalize";
import { CARD_CLASS, trendArrow, trendBadgeClass } from "./theme";

export interface ConversionRateOverTimeTableProps {
  data: ConversionRateOverTimeBreakdownRow[];
}

function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

interface ColumnSummary {
  heading: string;
  bold?: boolean;
  percent?: boolean;
  current: number;
  previous: number;
  change: ChangeMetric;
  row: (r: ConversionRateOverTimeBreakdownRow) => {
    current: number;
    previous: number;
  };
}

export function ConversionRateOverTimeTable({
  data,
}: ConversionRateOverTimeTableProps) {
  if (data.length === 0) return null;

  function columnTotal(
    pick: (r: ConversionRateOverTimeBreakdownRow) => {
      current: number;
      previous: number;
    },
  ) {
    const current = sum(data.map((r) => pick(r).current));
    const previous = sum(data.map((r) => pick(r).previous));
    return { current, previous, change: computeChange(current, previous) };
  }

  const sessions = columnTotal((r) => r.sessions);
  const addedToCart = columnTotal((r) => r.addedToCart);
  const reachedCheckout = columnTotal((r) => r.reachedCheckout);
  const completedCheckout = columnTotal((r) => r.completedCheckout);

  // Weighted from the summed raw counts (completedCheckout / sessions for
  // the whole period), never by summing or averaging the per-row
  // conversionRate percentages — the same class of bug documented on
  // weightedRate in normalize.ts and on RevenueBreakdownTable's AOV summary.
  function rate(completed: number, totalSessions: number): number {
    return totalSessions === 0
      ? 0
      : Math.round((completed / totalSessions) * 1000) / 10;
  }
  const conversionRateCurrent = rate(completedCheckout.current, sessions.current);
  const conversionRatePrevious = rate(
    completedCheckout.previous,
    sessions.previous,
  );
  const conversionRate = {
    current: conversionRateCurrent,
    previous: conversionRatePrevious,
    change: computeChange(conversionRateCurrent, conversionRatePrevious),
  };

  const columns: ColumnSummary[] = [
    { heading: "Sessions", ...sessions, row: (r) => r.sessions },
    { heading: "Added to cart", ...addedToCart, row: (r) => r.addedToCart },
    {
      heading: "Reached checkout",
      ...reachedCheckout,
      row: (r) => r.reachedCheckout,
    },
    {
      heading: "Completed checkout",
      ...completedCheckout,
      row: (r) => r.completedCheckout,
    },
    {
      heading: "Conversion rate",
      bold: true,
      percent: true,
      ...conversionRate,
      row: (r) => r.conversionRate,
    },
  ];

  function format(col: ColumnSummary, value: number): string {
    return col.percent ? formatPercent(value) : value.toLocaleString();
  }

  return (
    <div className={`${CARD_CLASS} overflow-x-auto`}>
      <table className="w-full min-w-full text-left text-[12px]">
        <thead>
          <tr className="border-b border-(--analytics-border) text-(--analytics-t2)">
            <th className="py-2 pr-4 font-semibold">Date</th>
            {columns.map((col) => (
              <th
                key={col.heading}
                className={`py-2 pr-4 font-semibold ${col.bold ? "text-(--analytics-t1)" : ""}`}
              >
                {col.heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-(--analytics-border)">
            <td className="py-2 pr-4 align-top">
              <div className="font-extrabold text-(--analytics-t1)">
                {data[0].date}
              </div>
              <div className="mt-1 text-(--analytics-t2)">% Change</div>
            </td>
            {columns.map((col) => (
              <td
                key={col.heading}
                className="py-2 pr-4 align-top tabular-nums"
              >
                <div className="font-extrabold text-(--analytics-t1)">
                  {format(col, col.current)}
                </div>
                <div className="text-(--analytics-t2)">
                  {format(col, col.previous)}
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
              <td className="py-2 pr-4 align-top text-(--analytics-t1)">
                {r.date}
              </td>
              {columns.map((col) => {
                const { current } = col.row(r);
                return (
                  <td
                    key={col.heading}
                    className="py-2 pr-4 align-top tabular-nums font-semibold text-(--analytics-t1)"
                  >
                    {format(col, current)}
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
