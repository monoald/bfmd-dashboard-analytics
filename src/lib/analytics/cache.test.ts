import { describe, expect, it, vi } from "vitest";
import type { ResolvedDateRange } from "./types";

vi.mock("next/cache", () => ({
  unstable_cache: vi.fn((fn: unknown) => fn),
}));

import { unstable_cache } from "next/cache";
import { withFixedCache, withRangeCache } from "./cache";

const todayRange: ResolvedDateRange = {
  key: "today",
  interval: "hour",
  current: { start: new Date(), end: new Date() },
  previous: { start: new Date(), end: new Date() },
};

const sevenDayRange: ResolvedDateRange = {
  ...todayRange,
  key: "7d",
  interval: "day",
};

describe("withRangeCache", () => {
  it("wraps the function with a 300s cache keyed 'today' and a 3600s cache keyed 'range'", async () => {
    const fn = vi.fn().mockResolvedValue("result");
    withRangeCache(fn, "test-prefix");

    expect(unstable_cache).toHaveBeenCalledWith(fn, ["test-prefix", "today"], {
      revalidate: 300,
    });
    expect(unstable_cache).toHaveBeenCalledWith(fn, ["test-prefix", "range"], {
      revalidate: 3600,
    });
  });

  it("calls the underlying function for both today and longer ranges", async () => {
    const fn = vi.fn().mockResolvedValue("result");
    const cached = withRangeCache(fn, "test-prefix");

    await cached(todayRange);
    await cached(sevenDayRange);

    expect(fn).toHaveBeenCalledWith(todayRange);
    expect(fn).toHaveBeenCalledWith(sevenDayRange);
  });
});

describe("withFixedCache", () => {
  it("wraps the function with the given fixed revalidate time regardless of range", () => {
    const fn = vi.fn().mockResolvedValue("result");
    withFixedCache(fn, "fixed-prefix", 14400);

    expect(unstable_cache).toHaveBeenCalledWith(fn, ["fixed-prefix"], {
      revalidate: 14400,
    });
  });
});
