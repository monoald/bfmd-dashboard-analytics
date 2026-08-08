import type { ChangeMetric } from "./types";

export function computeChange(current: number, previous: number): ChangeMetric {
  if (previous === 0) {
    return {
      value: current,
      changePercentage: current === 0 ? 0 : 100,
      trend: current >= 0 ? "up" : "down",
    };
  }

  const changePercentage = Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
  return {
    value: current,
    changePercentage,
    trend: changePercentage >= 0 ? "up" : "down",
  };
}
