import type { NamedValue } from "@/lib/analytics/types";
import { CARD_CLASS, LABEL_CLASS } from "./theme";

export interface RankedListProps {
  title: string;
  items: NamedValue[];
  formatValue?: (value: number) => string;
  // "ranked" (default): a proportional bar under each item, for top-N lists
  // (locations, products, referrers). "breakdown": divider rows with the
  // last item highlighted as a total, matching a financial line-item list.
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

  const maxAbsValue = Math.max(1, ...items.map((item) => Math.abs(item.value)));

  return (
    <div className={CARD_CLASS}>
      <p className={`${LABEL_CLASS} mb-3.5`}>{title}</p>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.name}>
            <div className="mb-1 flex items-center justify-between gap-2 text-[12px]">
              <span className="truncate text-(--analytics-t1)">
                {item.name}
              </span>
              <span
                className={`shrink-0 font-bold tabular-nums ${valueColorClass(item)}`}
              >
                {format(item.value)}
              </span>
            </div>
            <div className="h-0.75 overflow-hidden rounded-full bg-(--analytics-border)">
              <div
                className={`h-full rounded-full ${item.value < 0 ? "bg-(--analytics-down)" : "bg-gradient-to-r from-(--analytics-accent) to-(--analytics-accent)/50"}`}
                style={{
                  width: `${(Math.abs(item.value) / maxAbsValue) * 100}%`,
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
