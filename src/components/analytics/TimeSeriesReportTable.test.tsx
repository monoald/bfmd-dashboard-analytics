import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimeSeriesReportTable } from "./TimeSeriesReportTable";

describe("TimeSeriesReportTable", () => {
  it("renders nothing when given an empty series", () => {
    const { container } = render(
      <TimeSeriesReportTable data={[]} formatValue={(v) => `$${v}`} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders one row per bucket with current, previous, and change, plus a totals footer", () => {
    render(
      <TimeSeriesReportTable
        data={[
          { date: "Aug 1", currentPeriod: 100, previousPeriod: 80 },
          { date: "Aug 2", currentPeriod: 50, previousPeriod: 90 },
        ]}
        formatValue={(v) => `$${v.toFixed(2)}`}
      />,
    );

    expect(screen.getByText("Aug 1")).toBeInTheDocument();
    expect(screen.getByText("$100.00")).toBeInTheDocument();
    expect(screen.getByText("$80.00")).toBeInTheDocument();
    // (100-80)/80*100 = 25%
    expect(screen.getByText(/25%/)).toBeInTheDocument();

    expect(screen.getByText("Aug 2")).toBeInTheDocument();
    expect(screen.getByText("$50.00")).toBeInTheDocument();
    expect(screen.getByText("$90.00")).toBeInTheDocument();
    // (50-90)/90*100 = -44.444...%, rounds to -44.4%
    expect(screen.getByText(/44\.4%/)).toBeInTheDocument();

    // totals: current 150, previous 170 -> (150-170)/170*100 = -11.76...%, rounds to -11.8%
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("$150.00")).toBeInTheDocument();
    expect(screen.getByText("$170.00")).toBeInTheDocument();
    expect(screen.getByText(/11\.8%/)).toBeInTheDocument();
  });

  it("shows an averaged footer labeled 'Average' when aggregate is 'average'", () => {
    render(
      <TimeSeriesReportTable
        aggregate="average"
        data={[
          { date: "Aug 1", currentPeriod: 10, previousPeriod: 8 },
          { date: "Aug 2", currentPeriod: 20, previousPeriod: 4 },
        ]}
        formatValue={(v) => `$${v.toFixed(2)}`}
      />,
    );

    // average current: (10+20)/2 = 15, average previous: (8+4)/2 = 6
    expect(screen.getByText("Average")).toBeInTheDocument();
    expect(screen.queryByText("Total")).not.toBeInTheDocument();
    expect(screen.getByText("$15.00")).toBeInTheDocument();
    expect(screen.getByText("$6.00")).toBeInTheDocument();
    // sums (30, 12) must not appear anywhere in the footer
    expect(screen.queryByText("$30.00")).not.toBeInTheDocument();
    expect(screen.queryByText("$12.00")).not.toBeInTheDocument();
  });

  it("uses totalOverride for the footer instead of summing or averaging the series, when provided", () => {
    render(
      <TimeSeriesReportTable
        data={[
          { date: "Aug 1", currentPeriod: 0, previousPeriod: 0 },
          { date: "Aug 2", currentPeriod: 82, previousPeriod: 44 },
        ]}
        formatValue={(v) => `${v}%`}
        totalOverride={{ current: 90, previous: 45 }}
      />,
    );

    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
    expect(screen.getByText("45%")).toBeInTheDocument();
    // Naive sum (0+82=82) and average (82/2=41) must not appear in the
    // footer — "82%" should only be the Aug 2 row's own value (1 match).
    expect(screen.getAllByText("82%")).toHaveLength(1);
    expect(screen.queryByText("41%")).not.toBeInTheDocument();
  });
});
