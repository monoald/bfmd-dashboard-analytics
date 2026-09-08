import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { TotalSalesOverTimeTable } from "./TotalSalesOverTimeTable";
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

describe("TotalSalesOverTimeTable", () => {
  it("renders nothing when given no rows", () => {
    const { container } = render(<TotalSalesOverTimeTable data={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders every Shopify-parity column across a row's current/previous values", () => {
    render(<TotalSalesOverTimeTable data={[row()]} />);

    // Single row: summary total equals the row itself, so values (including
    // the date labels, shared by both the summary and the one detail row)
    // appear twice.
    expect(screen.getAllByText("Sep 2, 2026")).toHaveLength(2);
    expect(screen.getAllByText("Sep 1, 2026")).toHaveLength(2);
    expect(screen.getAllByText("24")).toHaveLength(2);
    expect(screen.getAllByText("$1,953.34")).toHaveLength(2);
    expect(screen.getAllByText("-$516.99")).toHaveLength(2);
    expect(screen.getAllByText("-$32.50")).toHaveLength(2);
    expect(screen.getAllByText("$1,403.85")).toHaveLength(2);
    expect(screen.getAllByText("$45.00")).toHaveLength(2);
    // duties + additionalFees, each $0.00 for both current and previous,
    // shown in both the summary row and the one detail row: 2 cols * 2
    // periods * 2 rows.
    expect(screen.getAllByText("$0.00")).toHaveLength(8);
    expect(screen.getAllByText("$33.25")).toHaveLength(2);
    expect(screen.getAllByText("$1,482.10")).toHaveLength(2);

    const headerRow = screen.getAllByRole("row")[0];
    const headings = within(headerRow)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent);
    expect(headings).toEqual([
      "Date",
      "Orders",
      "Gross sales",
      "Discounts",
      "Sales reversals",
      "Net sales",
      "Shipping charges",
      "Duties",
      "Additional fees",
      "Taxes",
      "Total sales",
    ]);
  });

  it("shows a date-only (no time) summary heading derived from the last row's label", () => {
    const data: SalesOverTimeBreakdownRow[] = [
      row({
        currentDateLabel: "Sep 2, 2026, 12:00 AM",
        previousDateLabel: "Sep 1, 2026, 12:00 AM",
      }),
    ];

    render(<TotalSalesOverTimeTable data={data} />);

    expect(screen.getByText("Sep 2, 2026")).toBeInTheDocument();
    expect(screen.getByText("Sep 1, 2026")).toBeInTheDocument();
  });

  it("derives the summary heading from the period's actual start (the last row), not the first — WC returns hour rows in descending order", () => {
    // Regression test: rows come back most-recent-hour-first (matches
    // RevenueBreakdownTable/salesOverTime elsewhere), so data[0] is 11 PM,
    // not midnight. Using it for the summary date both shows the wrong day
    // and duplicates the first detail row's exact label.
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

    render(<TotalSalesOverTimeTable data={data} />);

    const summaryRow = screen.getAllByRole("row")[1];
    expect(within(summaryRow).getByText("Sep 2, 2026")).toBeInTheDocument();
    expect(within(summaryRow).getByText("Sep 1, 2026")).toBeInTheDocument();
  });

  it("sums each column across rows for the summary row", () => {
    const data = [
      row({
        currentDateLabel: "Row A",
        orders: { current: 2, previous: 1 },
        totalSales: { current: 100, previous: 50 },
      }),
      row({
        currentDateLabel: "Row B",
        orders: { current: 3, previous: 2 },
        totalSales: { current: 200, previous: 150 },
      }),
    ];

    render(<TotalSalesOverTimeTable data={data} />);

    const summaryRow = screen.getAllByRole("row")[1]; // [0] is the header row
    expect(within(summaryRow).getByText("5")).toBeInTheDocument();
    expect(within(summaryRow).getByText("3")).toBeInTheDocument();
    expect(within(summaryRow).getByText("$300.00")).toBeInTheDocument();
    expect(within(summaryRow).getByText("$200.00")).toBeInTheDocument();
  });
});
