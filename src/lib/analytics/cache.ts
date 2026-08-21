import { unstable_cache } from "next/cache";
import type { ResolvedDateRange } from "./types";

export function withRangeCache<T>(
  fn: (range: ResolvedDateRange) => Promise<T>,
  keyPrefix: string,
): (range: ResolvedDateRange) => Promise<T> {
  const shortCache = unstable_cache(fn, [keyPrefix, "today"], {
    revalidate: 300,
  });
  const longCache = unstable_cache(fn, [keyPrefix, "range"], {
    revalidate: 3600,
  });
  return (range: ResolvedDateRange) =>
    range.key === "today" ? shortCache(range) : longCache(range);
}

export function withFixedCache<T>(
  fn: (range: ResolvedDateRange) => Promise<T>,
  keyPrefix: string,
  revalidateSeconds: number,
): (range: ResolvedDateRange) => Promise<T> {
  return unstable_cache(fn, [keyPrefix], { revalidate: revalidateSeconds });
}

export function withCache<Args extends unknown[], T>(
  fn: (...args: Args) => Promise<T>,
  keyParts: string[],
  revalidateSeconds: number,
): (...args: Args) => Promise<T> {
  return unstable_cache(fn, keyParts, { revalidate: revalidateSeconds });
}
