import { Sparkline } from "./Sparkline";
import {
  CARD_CLASS,
  KPI_VALUE_CLASS,
  LABEL_CLASS,
  trendArrow,
  trendBadgeClass,
} from "./theme";

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
  return (
    <div className={`${CARD_CLASS} flex flex-col gap-2.5`}>
      <p className={LABEL_CLASS}>{title}</p>
      <div className="flex items-start justify-between gap-2">
        <p className={KPI_VALUE_CLASS}>{value}</p>
        <span className={trendBadgeClass(trend)}>
          {trendArrow(trend)} {Math.abs(changePercentage)}%
        </span>
      </div>
      <Sparkline data={sparklineData} />
    </div>
  );
}
