import { describe, expect, it } from "vitest";
import { formatCurrency, formatPercent } from "./format";

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
