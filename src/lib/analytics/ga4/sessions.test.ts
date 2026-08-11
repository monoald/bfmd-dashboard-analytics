import { describe, expect, it, vi } from "vitest";
import type { ResolvedDateRange } from "../types";

vi.mock("./client", () => ({ runGa4Report: vi.fn() }));

import { runGa4Report } from "./client";
import {
  getSessionsByDevice,
  getSessionsByLocation,
  getSessionsOverTime,
} from "./sessions";

const range: ResolvedDateRange = {
  key: "7d",
  interval: "day",
  current: { start: new Date("2026-08-01"), end: new Date("2026-08-07") },
  previous: { start: new Date("2026-07-25"), end: new Date("2026-07-31") },
};

describe("getSessionsOverTime", () => {
  it("fetches current and previous sessions by date and aligns them into a TimeSeriesData series, zero-filling days GA4 didn't return", async () => {
    vi.mocked(runGa4Report)
      .mockResolvedValueOnce([
        { dimensionValues: ["20260801"], metricValues: [100] },
      ])
      .mockResolvedValueOnce([
        { dimensionValues: ["20260725"], metricValues: [80] },
      ]);

    const result = await getSessionsOverTime(range);

    // range spans Aug 1-7 (current) / Jul 25-31 (previous), 7 days each —
    // GA4 only returned one active day per period, the rest must be
    // zero-filled rather than dropped.
    expect(result).toHaveLength(7);
    expect(result[0]).toEqual({
      date: "Aug 1",
      currentPeriod: 100,
      previousPeriod: 80,
    });
    expect(result[1]).toEqual({
      date: "Aug 2",
      currentPeriod: 0,
      previousPeriod: 0,
    });
    expect(result[6]).toEqual({
      date: "Aug 7",
      currentPeriod: 0,
      previousPeriod: 0,
    });
  });
});

describe("getSessionsByDevice", () => {
  it("maps rows to NamedValue sorted by sessions descending, with previousValue joined by device name", async () => {
    vi.mocked(runGa4Report)
      .mockResolvedValueOnce([
        { dimensionValues: ["desktop"], metricValues: [10] },
        { dimensionValues: ["mobile"], metricValues: [50] },
      ])
      .mockResolvedValueOnce([
        { dimensionValues: ["desktop"], metricValues: [8] },
        { dimensionValues: ["mobile"], metricValues: [60] },
      ]);

    const result = await getSessionsByDevice(range);

    expect(result).toEqual([
      { name: "mobile", value: 50, previousValue: 60 },
      { name: "desktop", value: 10, previousValue: 8 },
    ]);
  });

  it("defaults previousValue to 0 when a device is absent from the previous period", async () => {
    vi.mocked(runGa4Report)
      .mockResolvedValueOnce([
        { dimensionValues: ["tablet"], metricValues: [5] },
      ])
      .mockResolvedValueOnce([]);

    const result = await getSessionsByDevice(range);

    expect(result).toEqual([{ name: "tablet", value: 5, previousValue: 0 }]);
  });
});

describe("getSessionsByLocation", () => {
  it("joins country, region, and city, sorts descending, and caps at 10 rows", async () => {
    vi.mocked(runGa4Report).mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => ({
        dimensionValues: ["United States", `Region${i}`, `City${i}`],
        metricValues: [12 - i],
      })),
    );

    const result = await getSessionsByLocation(range);

    expect(result).toHaveLength(10);
    expect(result[0]).toEqual({
      name: "United States · Region0 · City0",
      value: 12,
      previousValue: 12,
    });
  });

  it("attaches previousValue by matching the country · region · city name across periods, defaulting to 0 when absent previously", async () => {
    vi.mocked(runGa4Report)
      .mockResolvedValueOnce([
        {
          dimensionValues: ["United States", "Florida", "Miami"],
          metricValues: [342],
        },
        {
          dimensionValues: ["United States", "Illinois", "Chicago"],
          metricValues: [100],
        },
      ])
      .mockResolvedValueOnce([
        {
          dimensionValues: ["United States", "Florida", "Miami"],
          metricValues: [265],
        },
      ]);

    const result = await getSessionsByLocation(range);

    expect(result).toEqual([
      {
        name: "United States · Florida · Miami",
        value: 342,
        previousValue: 265,
      },
      {
        name: "United States · Illinois · Chicago",
        value: 100,
        previousValue: 0,
      },
    ]);
  });

  it("distinguishes same-named cities in different countries", async () => {
    vi.mocked(runGa4Report)
      .mockResolvedValueOnce([
        {
          dimensionValues: ["United States", "Georgia", "Springfield"],
          metricValues: [50],
        },
        {
          dimensionValues: ["Australia", "Victoria", "Springfield"],
          metricValues: [30],
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await getSessionsByLocation(range);

    expect(result).toEqual([
      {
        name: "United States · Georgia · Springfield",
        value: 50,
        previousValue: 0,
      },
      {
        name: "Australia · Victoria · Springfield",
        value: 30,
        previousValue: 0,
      },
    ]);
  });
});
