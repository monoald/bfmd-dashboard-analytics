import { Sparkline } from "./Sparkline";
import { CARD_CLASS, LABEL_CLASS, VALUE_CLASS, trendBadgeClass } from "./theme";

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
  const trendSign = trend === "up" ? "↑" : "↓";

  return (
    <div className={`${CARD_CLASS} flex flex-col gap-2`}>
      <p className={LABEL_CLASS}>{title}</p>
      <div className="flex items-start justify-between gap-2">
        <p className={VALUE_CLASS}>{value}</p>
        <span
          className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${trendBadgeClass(trend)}`}
        >
          {trendSign} {Math.abs(changePercentage)}%
        </span>
      </div>
      <Sparkline data={sparklineData} />
    </div>
  );
}
