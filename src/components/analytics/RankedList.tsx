import type { NamedValue } from "@/lib/analytics/types";
import { CARD_CLASS, LABEL_CLASS } from "./theme";

export interface RankedListProps {
  title: string;
  items: NamedValue[];
  formatValue?: (value: number) => string;
}

export function RankedList({ title, items, formatValue }: RankedListProps) {
  const format = formatValue ?? ((value: number) => value.toLocaleString());
  const maxAbsValue = Math.max(1, ...items.map((item) => Math.abs(item.value)));

  return (
    <div className={CARD_CLASS}>
      <p className={`${LABEL_CLASS} mb-3`}>{title}</p>
      <ul className="flex flex-col gap-2.5">
        {items.map((item) => (
          <li key={item.name}>
            <div className="mb-1 flex items-center justify-between gap-2 text-[12px]">
              <span className="truncate text-(--analytics-t1)">
                {item.name}
              </span>
              <span
                className={`shrink-0 font-bold tabular-nums ${item.value < 0 ? "text-(--analytics-down)" : "text-(--analytics-t1)"}`}
              >
                {format(item.value)}
              </span>
            </div>
            <div className="h-0.75 overflow-hidden rounded-full bg-(--analytics-border)">
              <div
                className={`h-full rounded-full ${item.value < 0 ? "bg-(--analytics-down)" : "bg-(--analytics-accent)"}`}
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
