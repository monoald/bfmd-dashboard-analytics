// Shared Tailwind class fragments for the analytics dashboard's dark-navy/teal
// visual style, so every card component stays visually consistent.

export const CARD_CLASS =
  "relative overflow-hidden bg-(--analytics-surface) border border-(--analytics-border) rounded-(--analytics-radius) px-5 py-[18px]";

export const CARD_GLOW_CLASS =
  "border-(--analytics-accent)/30 shadow-[0_0_40px_-10px_var(--analytics-accent-glow)]";

export const LABEL_CLASS =
  "text-[10px] font-bold uppercase tracking-[0.08em] text-(--analytics-t2)";

export const KPI_VALUE_CLASS =
  "text-[26px] font-extrabold leading-none tracking-[-1.2px] tabular-nums text-(--analytics-t1)";

export const HERO_VALUE_CLASS =
  "text-[30px] font-extrabold leading-none tracking-[-1.4px] tabular-nums text-(--analytics-t1)";

export const CHIP_CLASS =
  "inline-flex items-center gap-1 rounded-md border border-(--analytics-border) bg-(--analytics-surface) px-2.5 py-1 text-[11px] font-medium text-(--analytics-t2)";

// Solid accent fill rather than the softer accent-dim tint used for passive
// indicators (trend badges, etc.) — this is for controls the user actively
// toggles, where the accent-dim border/tint alone was too subtle to read as
// "selected" against the dark theme's surface color. The `!` (important)
// modifiers are required: Tailwind resolves same-specificity utility
// conflicts by their order in the generated stylesheet, not by order in the
// class attribute, so appending these after CHIP_CLASS's own border/bg/text
// utilities doesn't reliably win without forcing it.
export const CHIP_ACTIVE_CLASS =
  "!border-(--analytics-accent) !bg-(--analytics-accent) !text-white font-semibold";

export function trendBadgeClass(trend: "up" | "down"): string {
  const color =
    trend === "up"
      ? "bg-(--analytics-up-dim) text-(--analytics-up)"
      : "bg-(--analytics-down-dim) text-(--analytics-down)";
  return `inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-[1.4] ${color}`;
}

export function trendArrow(trend: "up" | "down"): string {
  return trend === "up" ? "↑" : "↓";
}
