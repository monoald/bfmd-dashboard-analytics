"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import type { NamedValue } from "@/lib/analytics/types";

export interface DonutBreakdownProps {
  title: string;
  data: NamedValue[];
}

const COLORS = ["#2563eb", "#7c3aed", "#0891b2", "#db2777", "#ea580c"];

export function DonutBreakdown({ title, data }: DonutBreakdownProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <p className="text-sm text-gray-500 mb-2">{title}</p>
      <div className="flex items-center gap-4">
        <ResponsiveContainer width={140} height={140}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={65}>
              {data.map((entry, index) => (
                <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <ul className="text-sm space-y-1">
          {data.map((item, index) => (
            <li key={item.name} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
              <span>{item.name}</span>
              <span className="text-gray-400">{total === 0 ? 0 : Math.round((item.value / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
