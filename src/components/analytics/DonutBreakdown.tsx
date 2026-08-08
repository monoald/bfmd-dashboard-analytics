"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import type { NamedValue } from "@/lib/analytics/types";
import { CARD_CLASS, LABEL_CLASS } from "./theme";

export interface DonutBreakdownProps {
  title: string;
  data: NamedValue[];
}

const COLORS = [
  "var(--analytics-accent)",
  "var(--analytics-t2)",
  "var(--analytics-amber)",
  "var(--analytics-down)",
  "#8B5CF6",
];

export function DonutBreakdown({ title, data }: DonutBreakdownProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className={CARD_CLASS}>
      <p className={`${LABEL_CLASS} mb-3`}>{title}</p>
      <div className="flex items-center gap-4">
        <ResponsiveContainer width={100} height={100}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={30}
              outerRadius={48}
              paddingAngle={2}
            >
              {data.map((entry, index) => (
                <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <ul className="min-w-0 flex-1 space-y-2">
          {data.map((item, index) => (
            <li key={item.name} className="flex items-center gap-2 text-[11px]">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              />
              <span className="flex-1 truncate text-(--analytics-t2)">
                {item.name}
              </span>
              <span className="font-bold tabular-nums text-(--analytics-t1)">
                {total === 0 ? 0 : Math.round((item.value / total) * 100)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
