"use client";

import { Line, LineChart, ResponsiveContainer } from "recharts";

export interface SparklineProps {
  data: number[];
}

export function Sparkline({ data }: SparklineProps) {
  if (data.length < 2) return null;

  const points = data.map((value, index) => ({ index, value }));
  return (
    <ResponsiveContainer width={80} height={32}>
      <LineChart data={points}>
        <Line
          type="monotone"
          dataKey="value"
          stroke="#2563eb"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
