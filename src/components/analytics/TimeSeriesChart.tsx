"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TimeSeriesData } from "@/lib/analytics/types";

export interface TimeSeriesChartProps {
  title: string;
  data: TimeSeriesData[];
  formatValue?: (value: number) => string;
}

export function buildChartSeries(
  data: TimeSeriesData[]
): { date: string; currentPeriod: number; previousPeriod: number }[] {
  return data.map((point) => ({
    date: point.date,
    currentPeriod: point.currentPeriod,
    previousPeriod: point.previousPeriod,
  }));
}

export function TimeSeriesChart({ title, data, formatValue }: TimeSeriesChartProps) {
  const series = buildChartSeries(data);
  const format = formatValue ?? ((value: number) => String(value));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <p className="text-sm text-gray-500 mb-2">{title}</p>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={series}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={format} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(value) => format(Number(value))} />
          <Area type="monotone" dataKey="currentPeriod" stroke="#2563eb" strokeWidth={2} fill="#2563eb" fillOpacity={0.1} />
          <Area type="monotone" dataKey="previousPeriod" stroke="#2563eb" strokeWidth={2} strokeDasharray="4 4" fill="transparent" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
