import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  buildChartSeries,
  ChartTooltip,
  resolveFormatter,
  TimeSeriesChart,
} from "./TimeSeriesChart";

describe("buildChartSeries", () => {
  it("maps TimeSeriesData points to chart series points", () => {
    const result = buildChartSeries([
      { date: "Aug 1", currentPeriod: 10, previousPeriod: 5 },
    ]);
    expect(result).toEqual([
      { date: "Aug 1", currentPeriod: 10, previousPeriod: 5 },
    ]);
  });
});

describe("resolveFormatter", () => {
  it("formats currency and percent by key, and falls back to String when omitted", () => {
    expect(resolveFormatter("currency")(1234.5)).toBe("$1,234.50");
    expect(resolveFormatter("percent")(9.876)).toBe("9.9%");
    expect(resolveFormatter()(42)).toBe("42");
  });
});

describe("TimeSeriesChart", () => {
  it("renders the title without crashing given data", () => {
    render(
      <TimeSeriesChart
        title="Sessions over time"
        data={[{ date: "Aug 1", currentPeriod: 10, previousPeriod: 5 }]}
      />,
    );
    expect(screen.getByText("Sessions over time")).toBeInTheDocument();
  });

  it("renders without crashing given an empty series", () => {
    render(<TimeSeriesChart title="Sessions over time" data={[]} />);
    expect(screen.getByText("Sessions over time")).toBeInTheDocument();
  });

  it("renders a headline value, trend badge, and 'vs. previous period' caption for the hero variant", () => {
    render(
      <TimeSeriesChart
        title="Total sales over time"
        data={[{ date: "Aug 1", currentPeriod: 100, previousPeriod: 80 }]}
        formatValue="currency"
        variant="hero"
        headline={{ value: "$60,708.36", changePercentage: 1.8, trend: "up" }}
      />,
    );

    expect(screen.getByText("$60,708.36")).toBeInTheDocument();
    expect(screen.getByText("↑ 1.8%")).toBeInTheDocument();
    expect(screen.getByText("vs. previous period")).toBeInTheDocument();
  });

  it("omits the 'vs. previous period' caption for the compact variant", () => {
    render(
      <TimeSeriesChart
        title="Average order value over time"
        data={[{ date: "Aug 1", currentPeriod: 58, previousPeriod: 55 }]}
        formatValue="currency"
        headline={{ value: "$58.00", changePercentage: 5, trend: "up" }}
      />,
    );

    expect(screen.getByText("$58.00")).toBeInTheDocument();
    expect(screen.queryByText("vs. previous period")).not.toBeInTheDocument();
  });
});

describe("ChartTooltip", () => {
  it("renders nothing when inactive", () => {
    const { container } = render(
      <ChartTooltip
        active={false}
        payload={[]}
        label="Aug 1"
        title="Total sales over time"
        format={(v) => `$${v}`}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders the title, label, current value, previous value, and trend when both series are present", () => {
    render(
      <ChartTooltip
        active
        label="2 PM"
        title="Total sales over time"
        format={(v) => `$${v.toFixed(2)}`}
        payload={[
          { dataKey: "currentPeriod", value: 2007, color: "teal" },
          { dataKey: "previousPeriod", value: 2252, color: "gray" },
        ]}
      />,
    );

    expect(screen.getByText("Total sales over time")).toBeInTheDocument();
    expect(screen.getByText("$2007.00")).toBeInTheDocument();
    expect(screen.getByText("$2252.00")).toBeInTheDocument();
    // (2007-2252)/2252*100 = -10.879...%, rounds to -10.9%, trend "down"
    expect(screen.getByText(/10\.9%/)).toBeInTheDocument();
    expect(screen.getByText(/from comparison/)).toBeInTheDocument();
  });

  it("omits the trend and previous row when there's no previous-period entry", () => {
    render(
      <ChartTooltip
        active
        label="Aug 1"
        title="Sessions over time"
        format={(v) => String(v)}
        payload={[{ dataKey: "currentPeriod", value: 100, color: "teal" }]}
      />,
    );

    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.queryByText(/from comparison/)).not.toBeInTheDocument();
  });
});
