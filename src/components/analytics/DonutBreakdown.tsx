"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { Info } from "lucide-react";
import { computeChange } from "@/lib/analytics/normalize";
import type { NamedValue } from "@/lib/analytics/types";
import { CARD_CLASS, LABEL_CLASS, trendArrow, trendBadgeClass } from "./theme";

export type DonutValueFormat = "number" | "currency";

const VALUE_FORMATTERS: Record<DonutValueFormat, (value: number) => string> = {
  number: (value) => value.toLocaleString(),
  currency: (value) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value),
};

export interface DonutBreakdownProps {
  title: string;
  data: NamedValue[];
  // A serializable format key rather than a function prop: Server Components
  // (this chart is rendered from one) can't pass plain functions to Client
  // Components across the RSC boundary.
  formatValue?: DonutValueFormat;
}

const COLORS = [
  "var(--analytics-accent)",
  "var(--analytics-t2)",
  "var(--analytics-amber)",
  "var(--analytics-down)",
  "#8B5CF6",
];

const DONUT_SIZE = 140;

export function DonutBreakdown({
  title,
  data,
  formatValue = "number",
}: DonutBreakdownProps) {
  const format = VALUE_FORMATTERS[formatValue];
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const hasComparison =
    data.length > 0 && data.every((item) => item.previousValue !== undefined);
  const totalChange = hasComparison
    ? computeChange(
        total,
        data.reduce((sum, item) => sum + (item.previousValue ?? 0), 0),
      )
    : null;

  return (
    <div className={`${CARD_CLASS} flex h-full flex-col`}>
      <div className="mb-3.5 flex items-start justify-between gap-2">
        <p className={LABEL_CLASS}>{title}</p>
        <span
          title="Based on GA4 session counts — treat as an estimate."
          className="shrink-0 text-(--analytics-t2)"
        >
          <Info className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="flex flex-1 items-center gap-6">
        <div
          className="relative shrink-0"
          style={{ width: DONUT_SIZE, height: DONUT_SIZE }}
        >
          <ResponsiveContainer width={DONUT_SIZE} height={DONUT_SIZE}>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={40}
                outerRadius={64}
                paddingAngle={2}
              >
                {data.map((entry, index) => (
                  <Cell
                    key={entry.name}
                    fill={COLORS[index % COLORS.length]}
                    stroke="var(--analytics-surface)"
                    strokeWidth={2}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
            <p className="text-[20px] font-extrabold leading-none tabular-nums text-(--analytics-t1)">
              {format(total)}
            </p>
            {totalChange && (
              <span className={trendBadgeClass(totalChange.trend)}>
                {trendArrow(totalChange.trend)}{" "}
                {Math.abs(totalChange.changePercentage)}%
              </span>
            )}
          </div>
        </div>
        <ul className="min-w-0 flex-1 space-y-4">
          {data.map((item, index) => {
            const change =
              item.previousValue !== undefined
                ? computeChange(item.value, item.previousValue)
                : null;
            return (
              <li
                key={item.name}
                className="flex items-center gap-2 text-[13px]"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span className="flex-1 truncate text-(--analytics-t2)">
                  {item.name}
                </span>
                <span className="font-bold tabular-nums text-(--analytics-t1)">
                  {format(item.value)}
                </span>
                {change && (
                  <span className={trendBadgeClass(change.trend)}>
                    {trendArrow(change.trend)}{" "}
                    {Math.abs(change.changePercentage)}%
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
