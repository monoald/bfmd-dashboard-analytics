import { describe, expect, it } from "vitest";
import { computeChange } from "./normalize";

describe("computeChange", () => {
  it("computes a positive change", () => {
    expect(computeChange(120, 100)).toEqual({ value: 120, changePercentage: 20, trend: "up" });
  });

  it("computes a negative change", () => {
    expect(computeChange(80, 100)).toEqual({ value: 80, changePercentage: -20, trend: "down" });
  });

  it("treats a zero previous value with positive current as a 100% increase", () => {
    expect(computeChange(50, 0)).toEqual({ value: 50, changePercentage: 100, trend: "up" });
  });

  it("treats zero vs. zero as no change", () => {
    expect(computeChange(0, 0)).toEqual({ value: 0, changePercentage: 0, trend: "up" });
  });

  it("rounds to one decimal place", () => {
    expect(computeChange(103, 100).changePercentage).toBe(3);
  });
});
