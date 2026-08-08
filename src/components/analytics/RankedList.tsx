import { computeChange } from "@/lib/analytics/normalize";
import type { NamedValue } from "@/lib/analytics/types";
import { CARD_CLASS, LABEL_CLASS, trendArrow, trendBadgeClass } from "./theme";

export interface RankedListProps {
  title: string;
  items: NamedValue[];
  formatValue?: (value: number) => string;
  // "ranked" (default): a proportional bar under each item, for top-N lists
  // (locations, products, referrers) — renders a period-over-period
  // comparison (two bars + % change) when items carry `previousValue`.
  // "breakdown": divider rows with the last item highlighted as a total,
  // matching a financial line-item list.
  variant?: "ranked" | "breakdown";
}

function valueColorClass(item: NamedValue): string {
  if (item.value < 0) return "text-(--analytics-down)";
  if (item.name.toLowerCase().includes("net")) return "text-(--analytics-up)";
  return "text-(--analytics-t1)";
}

function BreakdownList({
  title,
  items,
  format,
}: Required<Omit<RankedListProps, "variant" | "formatValue">> & {
  format: (value: number) => string;
}) {
  return (
    <div className={CARD_CLASS}>
      <p className={`${LABEL_CLASS} mb-3.5`}>{title}</p>
      <ul>
        {items.map((item, index) => {
          const isTotal = index === items.length - 1;
          return (
            <li
              key={item.name}
              className={`flex items-center justify-between gap-2.5 py-2.5 text-[12px] ${
                isTotal
                  ? "mt-1 border-t border-(--analytics-border) pt-2.5"
                  : "border-b border-(--analytics-border)"
              }`}
            >
              <span
                className={
                  isTotal
                    ? "text-[13px] font-extrabold text-(--analytics-t1)"
                    : "text-(--analytics-t2)"
                }
              >
                {item.name}
              </span>
              <span
                className={`tabular-nums ${valueColorClass(item)} ${
                  isTotal ? "text-[14px] font-extrabold" : "font-semibold"
                }`}
              >
                {format(item.value)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ComparisonBar({
  widthPercent,
  colorClass,
}: {
  widthPercent: number;
  colorClass: string;
}) {
  return (
    <div className="h-0.75 flex-1 overflow-hidden rounded-full bg-(--analytics-border)">
      <div
        className={`h-full rounded-full ${colorClass}`}
        style={{ width: `${widthPercent}%` }}
      />
    </div>
  );
}

export function RankedList({
  title,
  items,
  formatValue,
  variant = "ranked",
}: RankedListProps) {
  const format = formatValue ?? ((value: number) => value.toLocaleString());

  if (variant === "breakdown") {
    return <BreakdownList title={title} items={items} format={format} />;
  }

  const maxAbsValue = Math.max(
    1,
    ...items.flatMap((item) => [
      Math.abs(item.value),
      Math.abs(item.previousValue ?? 0),
    ]),
  );

  return (
    <div className={CARD_CLASS}>
      <p className={`${LABEL_CLASS} mb-3.5`}>{title}</p>
      <ul className="flex flex-col gap-3">
        {items.map((item) => {
          const hasComparison = item.previousValue !== undefined;
          const change = hasComparison
            ? computeChange(item.value, item.previousValue!)
            : null;

          return (
            <li key={item.name}>
              <p className="mb-1 truncate text-[12px] text-(--analytics-t1)">
                {item.name}
              </p>
              <div className="flex items-center gap-2">
                <ComparisonBar
                  widthPercent={(Math.abs(item.value) / maxAbsValue) * 100}
                  colorClass={
                    item.value < 0
                      ? "bg-(--analytics-down)"
                      : "bg-(--analytics-accent)"
                  }
                />
                <span
                  className={`shrink-0 text-[12px] font-bold tabular-nums ${valueColorClass(item)}`}
                >
                  {format(item.value)}
                </span>
                {change && (
                  <span className={trendBadgeClass(change.trend)}>
                    {trendArrow(change.trend)}{" "}
                    {Math.abs(change.changePercentage)}%
                  </span>
                )}
              </div>
              {hasComparison && (
                <div className="mt-1 flex items-center gap-2">
                  <ComparisonBar
                    widthPercent={
                      (Math.abs(item.previousValue!) / maxAbsValue) * 100
                    }
                    colorClass="bg-(--analytics-t2)/50"
                  />
                  <span className="shrink-0 text-[12px] tabular-nums text-(--analytics-t2)">
                    {format(item.previousValue!)}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
