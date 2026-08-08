// Shared Tailwind class fragments for the analytics dashboard's dark-navy/teal
// visual style, so every card component stays visually consistent.

export const CARD_CLASS =
  "bg-(--analytics-surface) border border-(--analytics-border) rounded-(--analytics-radius) p-5";

export const LABEL_CLASS =
  "text-[10px] font-bold uppercase tracking-wider text-(--analytics-t2)";

export const VALUE_CLASS =
  "text-2xl font-extrabold tracking-tight tabular-nums text-(--analytics-t1)";

export function trendBadgeClass(trend: "up" | "down"): string {
  return trend === "up"
    ? "bg-(--analytics-up-dim) text-(--analytics-up)"
    : "bg-(--analytics-down-dim) text-(--analytics-down)";
}
