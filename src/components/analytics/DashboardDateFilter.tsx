"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { DateRangeKey } from "@/lib/analytics/types";

const OPTIONS: { key: DateRangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 Days" },
  { key: "30d", label: "Last 30 Days" },
];

export function DashboardDateFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeRange = (searchParams.get("range") as DateRangeKey | null) ?? "today";

  function handleSelect(key: DateRangeKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", key);
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex gap-2">
      {OPTIONS.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => handleSelect(option.key)}
          className={`px-3 py-1.5 rounded-lg text-sm border ${
            activeRange === option.key ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-700 border-gray-200"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
