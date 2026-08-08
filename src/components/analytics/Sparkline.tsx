"use client";

import { Line, LineChart, ResponsiveContainer } from "recharts";

export interface SparklineProps {
  data: number[];
}

export function Sparkline({ data }: SparklineProps) {
  if (data.length < 2) return null;

  const points = data.map((value, index) => ({ index, value }));
  return (
    <ResponsiveContainer width="100%" height={36}>
      <LineChart data={points}>
        <Line
          type="monotone"
          dataKey="value"
          stroke="var(--analytics-accent)"
          strokeWidth={1.5}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
