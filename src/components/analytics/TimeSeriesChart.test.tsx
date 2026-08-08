import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { buildChartSeries, TimeSeriesChart } from "./TimeSeriesChart";

describe("buildChartSeries", () => {
  it("maps TimeSeriesData points to chart series points", () => {
    const result = buildChartSeries([{ date: "Aug 1", currentPeriod: 10, previousPeriod: 5 }]);
    expect(result).toEqual([{ date: "Aug 1", currentPeriod: 10, previousPeriod: 5 }]);
  });
});

describe("TimeSeriesChart", () => {
  it("renders the title without crashing given data", () => {
    render(<TimeSeriesChart title="Sessions over time" data={[{ date: "Aug 1", currentPeriod: 10, previousPeriod: 5 }]} />);
    expect(screen.getByText("Sessions over time")).toBeInTheDocument();
  });

  it("renders without crashing given an empty series", () => {
    render(<TimeSeriesChart title="Sessions over time" data={[]} />);
    expect(screen.getByText("Sessions over time")).toBeInTheDocument();
  });
});
