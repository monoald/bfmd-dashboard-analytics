"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { resolveRangeSelection } from "@/lib/analytics/date-range";
import type { DateRangeKey } from "@/lib/analytics/types";
import { CustomDateRangePicker } from "./CustomDateRangePicker";
import { CHIP_CLASS } from "./theme";

const OPTIONS: { key: DateRangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 Days" },
  { key: "30d", label: "Last 30 Days" },
];

export function DashboardDateFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeRange = resolveRangeSelection(
    searchParams.get("range") ?? undefined,
    searchParams.get("start") ?? undefined,
    searchParams.get("end") ?? undefined,
  ).rangeKey;

  function handleSelect(key: DateRangeKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", key);
    params.delete("start");
    params.delete("end");
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex gap-1.5">
      {OPTIONS.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => handleSelect(option.key)}
          className={`${CHIP_CLASS} cursor-pointer ${
            activeRange === option.key
              ? "border-(--analytics-accent) bg-(--analytics-accent-dim) text-(--analytics-accent)"
              : ""
          }`}
        >
          {option.label}
        </button>
      ))}
      <CustomDateRangePicker />
    </div>
  );
}
