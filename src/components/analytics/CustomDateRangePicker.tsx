"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Popover } from "@base-ui/react/popover";
import { DayPicker, type DateRange } from "react-day-picker";
import { formatShortDate } from "@/lib/analytics/format";
import {
  buildRangeQueryParams,
  resolveRangeSelection,
} from "@/lib/analytics/date-range";
import type { DateRangeKey } from "@/lib/analytics/types";
import { CHIP_CLASS } from "./theme";

interface NamedPreset {
  key: DateRangeKey;
  label: string;
}

const NAMED_PRESETS: NamedPreset[] = [
  { key: "yesterday", label: "Yesterday" },
  { key: "mtd", label: "Month to date" },
  { key: "last-month", label: "Last month" },
  { key: "ytd", label: "Year to date" },
  { key: "last-year", label: "Last year" },
  { key: "90d", label: "Last 90 days" },
];

// Restyled entirely via `classNames` mapped to this app's --analytics-* theme
// tokens (see AGENTS.md: react-day-picker v10 renamed several v8/v9
// classNames keys, e.g. table -> month_grid, day_selected -> selected,
// nav_button -> button_previous/button_next). No default stylesheet is
// imported, so every visible style comes from this map.
const DAY_PICKER_CLASS_NAMES = {
  months: "flex gap-4",
  month: "relative flex flex-col gap-1",
  month_caption:
    "flex h-8 items-center justify-center text-[12px] font-semibold text-(--analytics-t1)",
  caption_label: "text-[12px] font-semibold text-(--analytics-t1)",
  button_previous:
    "absolute left-0 top-0 inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-(--analytics-t2) hover:text-(--analytics-accent) disabled:pointer-events-none disabled:opacity-30",
  button_next:
    "absolute right-0 top-0 inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-(--analytics-t2) hover:text-(--analytics-accent) disabled:pointer-events-none disabled:opacity-30",
  month_grid: "w-full border-collapse",
  weekdays: "",
  weekday:
    "p-1 text-[10px] font-medium uppercase tracking-wide text-(--analytics-t2)",
  week: "",
  day: "p-0 text-center align-middle",
  day_button:
    "mx-auto flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-[12px] text-(--analytics-t1) transition-colors hover:bg-(--analytics-accent-dim)",
  selected: "bg-(--analytics-accent-dim)",
  range_middle: "bg-(--analytics-accent-dim)",
  range_start:
    "rounded-l-full [&>button]:bg-(--analytics-accent) [&>button]:text-white [&>button]:hover:bg-(--analytics-accent)",
  range_end:
    "rounded-r-full [&>button]:bg-(--analytics-accent) [&>button]:text-white [&>button]:hover:bg-(--analytics-accent)",
  today: "[&>button]:font-bold",
  outside: "opacity-40",
};

interface DraftRange {
  from?: Date;
  to?: Date;
}

export function CustomDateRangePicker() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [draftRange, setDraftRange] = useState<DraftRange | undefined>();

  const { rangeKey, customRange } = resolveRangeSelection(
    searchParams.get("range") ?? undefined,
    searchParams.get("start") ?? undefined,
    searchParams.get("end") ?? undefined,
  );

  const activePreset = NAMED_PRESETS.find((preset) => preset.key === rangeKey);
  const isActive = rangeKey === "custom" || activePreset !== undefined;
  const triggerLabel =
    rangeKey === "custom" && customRange
      ? `${formatShortDate(customRange.start)} – ${formatShortDate(customRange.end)}`
      : (activePreset?.label ?? "Custom");

  function navigateTo(
    nextRangeKey: DateRangeKey,
    nextCustomRange?: { start: Date; end: Date },
  ) {
    const params = new URLSearchParams(searchParams.toString());
    const query = new URLSearchParams(
      buildRangeQueryParams(nextRangeKey, nextCustomRange),
    );
    params.set("range", query.get("range")!);
    if (query.has("start")) {
      params.set("start", query.get("start")!);
      params.set("end", query.get("end")!);
    } else {
      params.delete("start");
      params.delete("end");
    }
    router.push(`?${params.toString()}`);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) return;
    if (rangeKey === "custom" && customRange) {
      setShowCalendar(true);
      setDraftRange({ from: customRange.start, to: customRange.end });
    } else {
      setShowCalendar(false);
      setDraftRange(undefined);
    }
  }

  function handlePresetClick(key: DateRangeKey) {
    navigateTo(key);
    setOpen(false);
  }

  function handleApply() {
    if (draftRange?.from && draftRange?.to) {
      navigateTo("custom", { start: draftRange.from, end: draftRange.to });
    }
    setOpen(false);
  }

  function handleCancel() {
    setOpen(false);
  }

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger
        className={`${CHIP_CLASS} cursor-pointer ${
          isActive
            ? "border-(--analytics-accent) bg-(--analytics-accent-dim) text-(--analytics-accent)"
            : ""
        }`}
      >
        {triggerLabel}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={6}>
          <Popover.Popup className="flex overflow-hidden rounded-(--analytics-radius) border border-(--analytics-border) bg-(--analytics-surface) text-(--analytics-t1) shadow-lg">
            <ul className="w-40 shrink-0 space-y-0.5 border-r border-(--analytics-border) p-1.5">
              {NAMED_PRESETS.map((preset) => (
                <li key={preset.key}>
                  <button
                    type="button"
                    onClick={() => handlePresetClick(preset.key)}
                    className={`w-full cursor-pointer rounded-md px-2.5 py-1.5 text-left text-[12px] hover:bg-(--analytics-accent-dim) ${
                      rangeKey === preset.key
                        ? "bg-(--analytics-accent-dim) text-(--analytics-accent)"
                        : "text-(--analytics-t2)"
                    }`}
                  >
                    {preset.label}
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => setShowCalendar(true)}
                  className={`w-full cursor-pointer rounded-md px-2.5 py-1.5 text-left text-[12px] hover:bg-(--analytics-accent-dim) ${
                    showCalendar || rangeKey === "custom"
                      ? "bg-(--analytics-accent-dim) text-(--analytics-accent)"
                      : "text-(--analytics-t2)"
                  }`}
                >
                  Custom range
                </button>
              </li>
            </ul>
            {showCalendar && (
              <div className="p-3">
                <div className="mb-2 flex items-center gap-2 text-[12px] text-(--analytics-t2)">
                  <span>
                    {draftRange?.from
                      ? formatShortDate(draftRange.from)
                      : "Start date"}
                  </span>
                  <span>&rarr;</span>
                  <span>
                    {draftRange?.to
                      ? formatShortDate(draftRange.to)
                      : "End date"}
                  </span>
                </div>
                <DayPicker
                  mode="range"
                  numberOfMonths={2}
                  navLayout="around"
                  selected={draftRange as DateRange | undefined}
                  onSelect={setDraftRange}
                  classNames={DAY_PICKER_CLASS_NAMES}
                />
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className={`${CHIP_CLASS} cursor-pointer`}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleApply}
                    disabled={!draftRange?.from || !draftRange?.to}
                    className={`${CHIP_CLASS} cursor-pointer border-(--analytics-accent) bg-(--analytics-accent-dim) text-(--analytics-accent) disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
