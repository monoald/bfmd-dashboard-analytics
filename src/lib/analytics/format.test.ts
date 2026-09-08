import { describe, expect, it } from "vitest";
import {
  addIsoMonths,
  dateToIsoMonth,
  formatCurrency,
  formatIsoMonthLabel,
  formatPercent,
  formatShortDate,
  formatWcIntervalLabel,
  isoMonthsBetween,
  wcDateToIsoMonth,
} from "./format";

describe("formatCurrency", () => {
  it("formats a number as USD currency", () => {
    expect(formatCurrency(1234.5)).toBe("$1,234.50");
  });

  it("formats a negative number with a leading minus sign", () => {
    expect(formatCurrency(-20539.97)).toBe("-$20,539.97");
  });
});

describe("formatPercent", () => {
  it("formats a number to one decimal place with a percent sign", () => {
    expect(formatPercent(9.876)).toBe("9.9%");
  });

  it("pads whole numbers to one decimal place", () => {
    expect(formatPercent(10)).toBe("10.0%");
  });
});

describe("formatShortDate", () => {
  it("formats a date as 'Mon D, YYYY'", () => {
    expect(formatShortDate(new Date(2026, 7, 9))).toBe("Aug 9, 2026");
  });
});

describe("formatWcIntervalLabel", () => {
  it("formats a space-separated WC date_start without time when includeTime is false", () => {
    expect(
      formatWcIntervalLabel("2026-09-02 23:00:00", false),
    ).toBe("Sep 2, 2026");
  });

  it("formats a space-separated WC date_start with time when includeTime is true", () => {
    expect(formatWcIntervalLabel("2026-09-02 23:00:00", true)).toBe(
      "Sep 2, 2026, 11:00 PM",
    );
  });

  it("handles midnight as 12:00 AM, not 0:00 AM", () => {
    expect(formatWcIntervalLabel("2026-09-02 00:00:00", true)).toBe(
      "Sep 2, 2026, 12:00 AM",
    );
  });

  it("handles noon as 12:00 PM, not 0:00 PM", () => {
    expect(formatWcIntervalLabel("2026-09-02 12:00:00", true)).toBe(
      "Sep 2, 2026, 12:00 PM",
    );
  });

  it("also accepts a 'T'-separated ISO-style date string", () => {
    expect(formatWcIntervalLabel("2026-09-02T05:30:00", true)).toBe(
      "Sep 2, 2026, 5:30 AM",
    );
  });

  // Parses the string's own digits rather than constructing a Date object,
  // so this never depends on the current process's timezone (see the
  // comment on formatWcIntervalLabel for why that matters here).
  it("does not reinterpret the string through the local timezone", () => {
    const original = process.env.TZ;
    process.env.TZ = "Pacific/Kiritimati"; // UTC+14, about as extreme as it gets
    try {
      expect(formatWcIntervalLabel("2026-09-02 23:00:00", true)).toBe(
        "Sep 2, 2026, 11:00 PM",
      );
    } finally {
      process.env.TZ = original;
    }
  });

  it("returns the original string unchanged if it doesn't match the expected format", () => {
    expect(formatWcIntervalLabel("not-a-date", true)).toBe("not-a-date");
  });
});

describe("dateToIsoMonth", () => {
  it("formats a UTC date as YYYY-MM", () => {
    expect(dateToIsoMonth(new Date(Date.UTC(2026, 8, 8)))).toBe("2026-09");
  });

  it("pads single-digit months", () => {
    expect(dateToIsoMonth(new Date(Date.UTC(2026, 0, 15)))).toBe("2026-01");
  });
});

describe("addIsoMonths", () => {
  it("adds a positive delta within the same year", () => {
    expect(addIsoMonths("2026-06", 3)).toBe("2026-09");
  });

  it("subtracts a delta within the same year", () => {
    expect(addIsoMonths("2026-09", -3)).toBe("2026-06");
  });

  it("rolls over into the next year", () => {
    expect(addIsoMonths("2026-09", 4)).toBe("2027-01");
  });

  it("rolls back into the previous year", () => {
    expect(addIsoMonths("2026-01", -1)).toBe("2025-12");
  });

  it("rolls back a full year", () => {
    expect(addIsoMonths("2026-01", -12)).toBe("2025-01");
  });
});

describe("isoMonthsBetween", () => {
  it("counts whole months between two iso months", () => {
    expect(isoMonthsBetween("2026-01", "2026-09")).toBe(8);
  });

  it("returns 0 for the same month", () => {
    expect(isoMonthsBetween("2026-09", "2026-09")).toBe(0);
  });

  it("spans a year boundary", () => {
    expect(isoMonthsBetween("2025-09", "2026-09")).toBe(12);
  });
});

describe("formatIsoMonthLabel", () => {
  it("formats an iso month as 'Mon YYYY'", () => {
    expect(formatIsoMonthLabel("2026-01")).toBe("Jan 2026");
    expect(formatIsoMonthLabel("2025-12")).toBe("Dec 2025");
  });
});

describe("wcDateToIsoMonth", () => {
  it("extracts the iso month from a space-separated WC date string", () => {
    expect(wcDateToIsoMonth("2026-06-15 10:30:00")).toBe("2026-06");
  });

  it("extracts the iso month from a T-separated WC date string", () => {
    expect(wcDateToIsoMonth("2026-06-15T10:30:00")).toBe("2026-06");
  });

  it("returns null for an unparseable string", () => {
    expect(wcDateToIsoMonth("not a date")).toBeNull();
  });
});
