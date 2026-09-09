import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { GrossSalesOverTimeTable } from "./GrossSalesOverTimeTable";
import type { SalesOverTimeBreakdownRow } from "@/lib/analytics/types";

function row(
  overrides: Partial<SalesOverTimeBreakdownRow> = {},
): SalesOverTimeBreakdownRow {
  return {
    currentDateLabel: "Sep 2, 2026",
    previousDateLabel: "Sep 1, 2026",
    orders: { current: 24, previous: 20 },
    grossSales: { current: 1953.34, previous: 2151.34 },
    discounts: { current: -516.99, previous: -684.02 },
    salesReversals: { current: -32.5, previous: -10 },
    netSales: { current: 1403.85, previous: 1457.32 },
    shippingCharges: { current: 45, previous: 50 },
    duties: { current: 0, previous: 0 },
    additionalFees: { current: 0, previous: 0 },
    taxes: { current: 33.25, previous: 34.9 },
    totalSales: { current: 1482.1, previous: 1542.22 },
    ...overrides,
  };
}

describe("GrossSalesOverTimeTable", () => {
  it("renders nothing when given no rows", () => {
    const { container } = render(<GrossSalesOverTimeTable data={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a single Gross sales column with a Date header", () => {
    render(<GrossSalesOverTimeTable data={[row()]} />);

    const headerRow = screen.getAllByRole("row")[0];
    const headings = within(headerRow)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent);
    expect(headings).toEqual(["Date", "Gross sales"]);

    expect(screen.getAllByText("Sep 2, 2026")).toHaveLength(2);
    expect(screen.getAllByText("Sep 1, 2026")).toHaveLength(2);
    expect(screen.getAllByText("$1,953.34")).toHaveLength(2);
    expect(screen.getAllByText("$2,151.34")).toHaveLength(2);
  });

  it("shows a date-only (no time) summary heading derived from the last row's label", () => {
    const data: SalesOverTimeBreakdownRow[] = [
      row({
        currentDateLabel: "Sep 2, 2026, 12:00 AM",
        previousDateLabel: "Sep 1, 2026, 12:00 AM",
      }),
    ];

    render(<GrossSalesOverTimeTable data={data} />);

    expect(screen.getByText("Sep 2, 2026")).toBeInTheDocument();
    expect(screen.getByText("Sep 1, 2026")).toBeInTheDocument();
  });

  it("derives the summary heading from the period's actual start (the last row), not the first — WC returns hour rows in descending order", () => {
    const data: SalesOverTimeBreakdownRow[] = [
      row({
        currentDateLabel: "Sep 2, 2026, 11:00 PM",
        previousDateLabel: "Sep 1, 2026, 11:00 PM",
      }),
      row({
        currentDateLabel: "Sep 2, 2026, 12:00 AM",
        previousDateLabel: "Sep 1, 2026, 12:00 AM",
      }),
    ];

    render(<GrossSalesOverTimeTable data={data} />);

    const summaryRow = screen.getAllByRole("row")[1];
    expect(within(summaryRow).getByText("Sep 2, 2026")).toBeInTheDocument();
    expect(within(summaryRow).getByText("Sep 1, 2026")).toBeInTheDocument();
  });

  it("sums gross sales across rows for the summary row", () => {
    const data = [
      row({
        currentDateLabel: "Row A",
        grossSales: { current: 100, previous: 50 },
      }),
      row({
        currentDateLabel: "Row B",
        grossSales: { current: 200, previous: 150 },
      }),
    ];

    render(<GrossSalesOverTimeTable data={data} />);

    const summaryRow = screen.getAllByRole("row")[1]; // [0] is the header row
    expect(within(summaryRow).getByText("$300.00")).toBeInTheDocument();
    expect(within(summaryRow).getByText("$200.00")).toBeInTheDocument();
  });

  it("shows a % change badge in the summary row, computed from the summed totals", () => {
    const data: SalesOverTimeBreakdownRow[] = [
      row({
        grossSales: { current: 150, previous: 100 },
      }),
    ];

    render(<GrossSalesOverTimeTable data={data} />);

    expect(screen.getByText("% Change")).toBeInTheDocument();
    const summaryRow = screen.getAllByRole("row")[1];
    expect(within(summaryRow).getByText("↑ 50%")).toBeInTheDocument();
  });
});
