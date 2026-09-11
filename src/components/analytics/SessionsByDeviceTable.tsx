import type { SessionsByDeviceBreakdownRow } from "@/lib/analytics/types";
import { computeChange } from "@/lib/analytics/normalize";
import { COLORS } from "./DonutBreakdown";
import { CARD_CLASS, trendArrow, trendBadgeClass } from "./theme";

export interface SessionsByDeviceTableProps {
  data: SessionsByDeviceBreakdownRow[];
  summary: {
    onlineStoreVisitors: { current: number; previous: number };
    sessions: { current: number; previous: number };
  };
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

export function SessionsByDeviceTable({
  data,
  summary,
}: SessionsByDeviceTableProps) {
  if (data.length === 0) return null;

  const visitorsChange = computeChange(
    summary.onlineStoreVisitors.current,
    summary.onlineStoreVisitors.previous,
  );
  const sessionsChange = computeChange(
    summary.sessions.current,
    summary.sessions.previous,
  );

  return (
    <div className={`${CARD_CLASS} overflow-x-auto`}>
      <table className="w-full min-w-full text-left text-[12px]">
        <thead>
          <tr className="border-b border-(--analytics-border) text-(--analytics-t2)">
            <th className="py-2 pr-4 font-semibold">Session device type</th>
            <th className="py-2 pr-4 font-semibold">Online store visitors</th>
            <th className="py-2 pr-4 font-semibold">Sessions</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-(--analytics-border)">
            <td className="py-2 pr-4 align-top font-extrabold text-(--analytics-t1)">
              Summary
            </td>
            <td className="py-2 pr-4 align-top tabular-nums">
              <div className="font-extrabold text-(--analytics-t1)">
                {formatCount(summary.onlineStoreVisitors.current)}
              </div>
              <div className="text-(--analytics-t2)">
                {formatCount(summary.onlineStoreVisitors.previous)}
              </div>
              <div className="mt-1">
                <span className={trendBadgeClass(visitorsChange.trend)}>
                  {trendArrow(visitorsChange.trend)}{" "}
                  {Math.abs(visitorsChange.changePercentage)}%
                </span>
              </div>
            </td>
            <td className="py-2 pr-4 align-top tabular-nums">
              <div className="font-extrabold text-(--analytics-t1)">
                {formatCount(summary.sessions.current)}
              </div>
              <div className="text-(--analytics-t2)">
                {formatCount(summary.sessions.previous)}
              </div>
              <div className="mt-1">
                <span className={trendBadgeClass(sessionsChange.trend)}>
                  {trendArrow(sessionsChange.trend)}{" "}
                  {Math.abs(sessionsChange.changePercentage)}%
                </span>
              </div>
            </td>
          </tr>
          {data.map((row, index) => (
            <tr
              key={row.deviceCategory}
              className="border-b border-(--analytics-border)"
            >
              <td className="py-2 pr-4 align-top">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-(--analytics-t1)">
                    {row.deviceCategory}
                  </span>
                </div>
              </td>
              <td className="py-2 pr-4 align-top tabular-nums">
                <div className="font-semibold text-(--analytics-t1)">
                  {formatCount(row.onlineStoreVisitors.current)}
                </div>
                <div className="text-(--analytics-t2)">
                  {formatCount(row.onlineStoreVisitors.previous)}
                </div>
              </td>
              <td className="py-2 pr-4 align-top tabular-nums">
                <div className="font-semibold text-(--analytics-t1)">
                  {formatCount(row.sessions.current)}
                </div>
                <div className="text-(--analytics-t2)">
                  {formatCount(row.sessions.previous)}
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
