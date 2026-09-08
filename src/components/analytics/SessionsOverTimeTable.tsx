import type {
  ChangeMetric,
  SessionsOverTimeBreakdownRow,
} from "@/lib/analytics/types";
import { computeChange } from "@/lib/analytics/normalize";
import { CARD_CLASS, trendArrow, trendBadgeClass } from "./theme";

export interface SessionsOverTimeTableProps {
  data: SessionsOverTimeBreakdownRow[];
}

function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

interface ColumnSummary {
  heading: string;
  bold?: boolean;
  current: number;
  previous: number;
  change: ChangeMetric;
  row: (r: SessionsOverTimeBreakdownRow) => {
    current: number;
    previous: number;
  };
}

export function SessionsOverTimeTable({ data }: SessionsOverTimeTableProps) {
  if (data.length === 0) return null;

  function columnTotal(
    pick: (r: SessionsOverTimeBreakdownRow) => {
      current: number;
      previous: number;
    },
  ) {
    const current = sum(data.map((r) => pick(r).current));
    const previous = sum(data.map((r) => pick(r).previous));
    return { current, previous, change: computeChange(current, previous) };
  }

  const onlineStoreVisitors = columnTotal((r) => r.onlineStoreVisitors);
  const sessions = columnTotal((r) => r.sessions);

  const columns: ColumnSummary[] = [
    {
      heading: "Online store visitors",
      ...onlineStoreVisitors,
      row: (r) => r.onlineStoreVisitors,
    },
    { heading: "Sessions", bold: true, ...sessions, row: (r) => r.sessions },
  ];

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
                  {col.current.toLocaleString()}
                </div>
                <div className="text-(--analytics-t2)">
                  {col.previous.toLocaleString()}
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
                    {current.toLocaleString()}
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
