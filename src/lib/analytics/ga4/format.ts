import type { TimeSeriesData } from "../types";

export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatBucketLabel(
  rawDate: string,
  interval: "hour" | "day",
): string {
  if (interval === "hour") {
    const hour = Number(rawDate.slice(8, 10));
    const period = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${hour12} ${period}`;
  }

  const month = Number(rawDate.slice(4, 6));
  const day = Number(rawDate.slice(6, 8));
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${monthNames[month - 1]} ${day}`;
}

export function alignSeries(
  currentMap: Map<string, number>,
  previousMap: Map<string, number>,
  interval: "hour" | "day",
): TimeSeriesData[] {
  const currentKeys = [...currentMap.keys()].sort();
  const previousKeys = [...previousMap.keys()].sort();
  const bucketCount = Math.max(currentKeys.length, previousKeys.length);

  const series: TimeSeriesData[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const currentKey = currentKeys[i];
    const previousKey = previousKeys[i];
    const labelSource = currentKey ?? previousKey;
    series.push({
      date: formatBucketLabel(labelSource, interval),
      currentPeriod: currentKey ? currentMap.get(currentKey)! : 0,
      previousPeriod: previousKey ? previousMap.get(previousKey)! : 0,
    });
  }
  return series;
}
