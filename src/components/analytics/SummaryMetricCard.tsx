import { Sparkline } from "./Sparkline";

export interface SummaryMetricCardProps {
  title: string;
  value: string;
  changePercentage: number;
  trend: "up" | "down";
  sparklineData: number[];
}

export function SummaryMetricCard({
  title,
  value,
  changePercentage,
  trend,
  sparklineData,
}: SummaryMetricCardProps) {
  const trendColor = trend === "up" ? "text-green-600" : "text-red-600";
  const trendSign = trend === "up" ? "+" : "-";

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-500">{title}</p>
        <p className="text-2xl font-semibold">{value}</p>
        <p className={`text-sm ${trendColor}`}>
          {trendSign}
          {Math.abs(changePercentage)}%
        </p>
      </div>
      <Sparkline data={sparklineData} />
    </div>
  );
}
