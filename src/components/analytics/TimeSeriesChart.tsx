"use client";

import { useId } from "react";
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
import {
  CARD_CLASS,
  CARD_GLOW_CLASS,
  HERO_VALUE_CLASS,
  KPI_VALUE_CLASS,
  LABEL_CLASS,
  trendArrow,
  trendBadgeClass,
} from "./theme";

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

export interface TimeSeriesHeadline {
  value: string;
  changePercentage: number;
  trend: "up" | "down";
}

export interface TimeSeriesChartProps {
  title: string;
  data: TimeSeriesData[];
  // A serializable format key rather than a function prop: Server Components
  // (this chart is rendered from one) can't pass plain functions to Client
  // Components across the RSC boundary.
  formatValue?: TimeSeriesValueFormat;
  headline?: TimeSeriesHeadline;
  variant?: "hero" | "compact";
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
  headline,
  variant = "compact",
}: TimeSeriesChartProps) {
  const series = buildChartSeries(data);
  const format = resolveFormatter(formatValue);
  const gradientId = useId();
  const isHero = variant === "hero";

  return (
    <div className={`${CARD_CLASS} ${isHero ? CARD_GLOW_CLASS : ""}`}>
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <p className={`${LABEL_CLASS} mb-1.5`}>{title}</p>
          {headline && (
            <>
              <p className={isHero ? HERO_VALUE_CLASS : KPI_VALUE_CLASS}>
                {headline.value}
              </p>
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className={trendBadgeClass(headline.trend)}>
                  {trendArrow(headline.trend)}{" "}
                  {Math.abs(headline.changePercentage)}%
                </span>
                {isHero && (
                  <span className="text-[11px] text-(--analytics-t2)">
                    vs. previous period
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={isHero ? 200 : 130}>
        <AreaChart data={series}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--analytics-accent)"
                stopOpacity={0.28}
              />
              <stop
                offset="100%"
                stopColor="var(--analytics-accent)"
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          {isHero && (
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="var(--analytics-border)"
            />
          )}
          {isHero && (
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "var(--analytics-t3)" }}
              stroke="var(--analytics-border)"
              tickLine={false}
            />
          )}
          {isHero && (
            <YAxis
              tickFormatter={format}
              tick={{ fontSize: 10, fill: "var(--analytics-t3)" }}
              stroke="var(--analytics-border)"
              tickLine={false}
              axisLine={false}
              width={48}
            />
          )}
          <Tooltip formatter={(value) => format(Number(value))} />
          <Area
            type="monotone"
            dataKey="currentPeriod"
            stroke="var(--analytics-accent)"
            strokeWidth={2}
            fill={`url(#${gradientId})`}
          />
          <Area
            type="monotone"
            dataKey="previousPeriod"
            stroke="var(--analytics-t2)"
            strokeWidth={1.25}
            strokeDasharray="4 4"
            fill="transparent"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
