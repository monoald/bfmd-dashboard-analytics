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
});
