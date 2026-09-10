import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { TotalSalesBreakdownTable } from "./TotalSalesBreakdownTable";
import type { SalesOverTimeBreakdownRow } from "@/lib/analytics/types";

function row(
  overrides: Partial<SalesOverTimeBreakdownRow> = {},
): SalesOverTimeBreakdownRow {
  return {
    currentDateLabel: "Sep 2, 2026, 12:00 AM",
    previousDateLabel: "Aug 8, 2026, 12:00 AM",
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

describe("TotalSalesBreakdownTable", () => {
  it("renders nothing when given no rows", () => {
    const { container } = render(<TotalSalesBreakdownTable data={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the requested columns, dropping Orders and Additional fees, with an Hour header", () => {
    render(<TotalSalesBreakdownTable data={[row()]} />);

    const headerRow = screen.getAllByRole("row")[0];
    const headings = within(headerRow)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent);
    expect(headings).toEqual([
      "Hour",
      "Gross Sales",
      "Discounts",
      "Sales Reversal",
      "Net Sales",
      "Shipping Charges",
      "Returning Fees",
      "Taxes",
      "Total Sales",
    ]);
  });

  it("renders every column's current/previous values for a single row (appearing twice: once as the row, once as the summary total)", () => {
    render(<TotalSalesBreakdownTable data={[row()]} />);

    expect(screen.getAllByText("$1,953.34")).toHaveLength(2);
    expect(screen.getAllByText("-$516.99")).toHaveLength(2);
    expect(screen.getAllByText("-$32.50")).toHaveLength(2);
    expect(screen.getAllByText("$1,403.85")).toHaveLength(2);
    expect(screen.getAllByText("$45.00")).toHaveLength(2);
    expect(screen.getAllByText("$33.25")).toHaveLength(2);
    expect(screen.getAllByText("$1,482.10")).toHaveLength(2);
    // Returning Fees: always $0.00 (WC has no fee data) for both current and
    // previous, shown in both the summary row and the one detail row.
    expect(screen.getAllByText("$0.00")).toHaveLength(4);
  });

  it("sums each column across rows for the summary row", () => {
    const data = [
      row({
        currentDateLabel: "Row A",
        grossSales: { current: 100, previous: 50 },
        totalSales: { current: 90, previous: 40 },
      }),
      row({
        currentDateLabel: "Row B",
        grossSales: { current: 200, previous: 150 },
        totalSales: { current: 180, previous: 130 },
      }),
    ];

    render(<TotalSalesBreakdownTable data={data} />);

    const summaryRow = screen.getAllByRole("row")[1];
    expect(within(summaryRow).getByText("$300.00")).toBeInTheDocument();
    expect(within(summaryRow).getByText("$200.00")).toBeInTheDocument();
    expect(within(summaryRow).getByText("$270.00")).toBeInTheDocument();
    expect(within(summaryRow).getByText("$170.00")).toBeInTheDocument();
  });

  it("shows a date-only summary heading derived from the last row (WC returns hour rows in descending order)", () => {
    const data = [
      row({
        currentDateLabel: "Sep 2, 2026, 11:00 PM",
        previousDateLabel: "Aug 8, 2026, 11:00 PM",
      }),
      row({
        currentDateLabel: "Sep 2, 2026, 12:00 AM",
        previousDateLabel: "Aug 8, 2026, 12:00 AM",
      }),
    ];

    render(<TotalSalesBreakdownTable data={data} />);

    const summaryRow = screen.getAllByRole("row")[1];
    expect(within(summaryRow).getByText("Sep 2, 2026")).toBeInTheDocument();
    expect(within(summaryRow).getByText("Aug 8, 2026")).toBeInTheDocument();
  });

  it("shows a % change badge per column in the summary row", () => {
    const data = [
      row({
        grossSales: { current: 150, previous: 100 },
        totalSales: { current: 150, previous: 100 },
      }),
    ];

    render(<TotalSalesBreakdownTable data={data} />);

    expect(screen.getByText("% Change")).toBeInTheDocument();
    const summaryRow = screen.getAllByRole("row")[1];
    expect(within(summaryRow).getAllByText("↑ 50%")).toHaveLength(2);
  });
});
