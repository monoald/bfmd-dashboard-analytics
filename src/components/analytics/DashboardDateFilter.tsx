"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { DateRangeKey } from "@/lib/analytics/types";
import { CHIP_CLASS } from "./theme";

const OPTIONS: { key: DateRangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 Days" },
  { key: "30d", label: "Last 30 Days" },
];

export function DashboardDateFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeRange =
    (searchParams.get("range") as DateRangeKey | null) ?? "today";

  function handleSelect(key: DateRangeKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", key);
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
    </div>
  );
}
