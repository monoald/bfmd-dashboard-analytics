"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TimeSeriesData } from "@/lib/analytics/types";
import { CARD_CLASS, LABEL_CLASS } from "./theme";

export type TimeSeriesValueFormat = "currency" | "percent";

const VALUE_FORMATTERS: Record<
  TimeSeriesValueFormat,
  (value: number) => string
> = {
  currency: (value) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value),
  percent: (value) => `${value.toFixed(1)}%`,
};

export interface TimeSeriesChartProps {
  title: string;
  data: TimeSeriesData[];
  // A serializable format key rather than a function prop: Server Components
  // (this chart is rendered from one) can't pass plain functions to Client
  // Components across the RSC boundary.
  formatValue?: TimeSeriesValueFormat;
}

export function resolveFormatter(
  formatValue?: TimeSeriesValueFormat,
): (value: number) => string {
  return formatValue
    ? VALUE_FORMATTERS[formatValue]
    : (value: number) => String(value);
}

export function buildChartSeries(
  data: TimeSeriesData[],
): { date: string; currentPeriod: number; previousPeriod: number }[] {
  return data.map((point) => ({
    date: point.date,
    currentPeriod: point.currentPeriod,
    previousPeriod: point.previousPeriod,
  }));
}

export function TimeSeriesChart({
  title,
  data,
  formatValue,
}: TimeSeriesChartProps) {
  const series = buildChartSeries(data);
  const format = resolveFormatter(formatValue);

  return (
    <div className={CARD_CLASS}>
      <p className={`${LABEL_CLASS} mb-3`}>{title}</p>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={series}>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="var(--analytics-border)"
          />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "var(--analytics-t2)" }}
            stroke="var(--analytics-border)"
          />
          <YAxis
            tickFormatter={format}
            tick={{ fontSize: 10, fill: "var(--analytics-t2)" }}
            stroke="var(--analytics-border)"
          />
          <Tooltip formatter={(value) => format(Number(value))} />
          <Area
            type="monotone"
            dataKey="currentPeriod"
            stroke="var(--analytics-accent)"
            strokeWidth={2}
            fill="var(--analytics-accent)"
            fillOpacity={0.15}
          />
          <Area
            type="monotone"
            dataKey="previousPeriod"
            stroke="var(--analytics-t2)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            fill="transparent"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
