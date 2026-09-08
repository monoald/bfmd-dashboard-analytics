"use client";

import { useState } from "react";
import { addIsoMonths, formatIsoMonthLabel } from "@/lib/analytics/format";
import type { CohortRow } from "@/lib/analytics/types";
import { CARD_CLASS, LABEL_CLASS } from "./theme";

export interface CustomerCohortTableProps {
  rows: CohortRow[];
  variant?: "full" | "preview";
}

interface HoveredCell {
  rowIndex: number;
  monthIndex: number;
}

export function CustomerCohortTable({
  rows,
  variant = "full",
}: CustomerCohortTableProps) {
  const [hovered, setHovered] = useState<HoveredCell | null>(null);

  const visibleRows = variant === "preview" ? rows.slice(-4) : rows;
  const widestRow = Math.max(
    0,
    ...visibleRows.map((row) => row.retentionByMonth.length),
  );
  const columnCount = variant === "preview" ? Math.min(widestRow, 3) : widestRow;
  const maxValue = Math.max(
    0,
    ...visibleRows.flatMap((row) => row.retentionByMonth),
  );

  function cellBackground(value: number): string {
    if (maxValue === 0) return "transparent";
    const intensity = 6 + (value / maxValue) * 80;
    return `color-mix(in srgb, var(--analytics-accent) ${intensity}%, transparent)`;
  }

  return (
    <div className={`${CARD_CLASS} overflow-x-auto`}>
      <p className={LABEL_CLASS}>Customer cohort analysis</p>
      {variant === "full" && (
        <p className="mt-1 mb-3 text-[12px] text-(--analytics-t2)">
          Returning purchase rates, with customers grouped by month of
          first purchase
        </p>
      )}
      <table className="mt-3 w-full min-w-full border-collapse text-left text-[12px]">
        <thead>
          <tr>
            <th className="py-2 pr-4 font-semibold text-(--analytics-t2)">
              Cohort
            </th>
            {columnCount > 0 && (
              <th
                colSpan={columnCount}
                className="py-2 text-center font-semibold text-(--analytics-t2)"
              >
                Months
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, rowIndex) => (
            <tr key={row.cohortMonth}>
              <td className="whitespace-nowrap py-1 pr-4 text-(--analytics-t1)">
                {formatIsoMonthLabel(row.cohortMonth)}
              </td>
              {Array.from({ length: columnCount }, (_, colIndex) => {
                const monthIndex = colIndex + 1;
                const value = row.retentionByMonth[colIndex];
                if (value === undefined) {
                  return <td key={monthIndex} className="p-1" />;
                }
                const isHovered =
                  hovered?.rowIndex === rowIndex &&
                  hovered?.monthIndex === monthIndex;
                return (
                  <td
                    key={monthIndex}
                    className="relative p-1 text-center tabular-nums text-(--analytics-t1)"
                    style={{ backgroundColor: cellBackground(value) }}
                    tabIndex={0}
                    onMouseEnter={() => setHovered({ rowIndex, monthIndex })}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered({ rowIndex, monthIndex })}
                    onBlur={() => setHovered(null)}
                  >
                    {value}%
                    {isHovered && (
                      <div className="absolute bottom-full left-1/2 z-10 mb-1 w-48 -translate-x-1/2 rounded-md border border-(--analytics-border) bg-(--analytics-surface) p-2 text-left shadow-lg">
                        <p className="text-[11px] font-semibold text-(--analytics-t1)">
                          Month {monthIndex} ·{" "}
                          {formatIsoMonthLabel(row.cohortMonth)} cohort
                        </p>
                        <p className="mt-1 text-[11px] text-(--analytics-t2)">
                          Customers who returned to purchase from you in{" "}
                          {formatIsoMonthLabel(
                            addIsoMonths(row.cohortMonth, monthIndex),
                          )}
                        </p>
                      </div>
                    )}
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
