import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { OrdersOverTimeTable } from "./OrdersOverTimeTable";
import type { OrdersOverTimeBreakdownRow } from "@/lib/analytics/types";

function row(
  overrides: Partial<OrdersOverTimeBreakdownRow> = {},
): OrdersOverTimeBreakdownRow {
  return {
    currentDateLabel: "Sep 2, 2026, 12:00 AM",
    previousDateLabel: "Aug 8, 2026, 12:00 AM",
    orders: { current: 24, previous: 33 },
    itemsPerOrder: { current: 2.2, previous: 2.1 },
    averageOrderValue: { current: 59.84, previous: 56.21 },
    reversedQuantity: { current: 0, previous: -5 },
    ...overrides,
  };
}

describe("OrdersOverTimeTable", () => {
  it("renders nothing when given no rows", () => {
    const { container } = render(<OrdersOverTimeTable data={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the four Shopify-parity columns with an Hour header", () => {
    render(<OrdersOverTimeTable data={[row()]} />);

    const headerRow = screen.getAllByRole("row")[0];
    const headings = within(headerRow)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent);
    expect(headings).toEqual([
      "Hour",
      "Orders",
      "Quantity ordered per order",
      "Average order value",
      "Reversed quantity",
    ]);
  });

  it("sums orders and reversed quantity across rows for the summary row", () => {
    const data = [
      row({ orders: { current: 10, previous: 5 }, reversedQuantity: { current: -2, previous: 0 } }),
      row({ orders: { current: 20, previous: 15 }, reversedQuantity: { current: -3, previous: -1 } }),
    ];

    render(<OrdersOverTimeTable data={data} />);

    const summaryRow = screen.getAllByRole("row")[1];
    expect(within(summaryRow).getByText("30")).toBeInTheDocument();
    expect(within(summaryRow).getByText("20")).toBeInTheDocument();
    expect(within(summaryRow).getByText("-5")).toBeInTheDocument();
    expect(within(summaryRow).getByText("-1")).toBeInTheDocument();
  });

  it("computes the summary row's itemsPerOrder/averageOrderValue as a weighted rate, not a plain average of the per-row rates", () => {
    // Row A: 10 orders at 2.0 items/order = 20 items. Row B: 2 orders at 5.0
    // items/order = 10 items. Plain average of rates = (2+5)/2 = 3.5, but
    // the true period rate is 30 items / 12 orders = 2.5 — same anti-pattern
    // already avoided in RevenueBreakdownTable's AOV summary.
    const data = [
      row({
        orders: { current: 10, previous: 0 },
        itemsPerOrder: { current: 2.0, previous: 0 },
        averageOrderValue: { current: 40, previous: 0 },
      }),
      row({
        orders: { current: 2, previous: 0 },
        itemsPerOrder: { current: 5.0, previous: 0 },
        averageOrderValue: { current: 100, previous: 0 },
      }),
    ];

    render(<OrdersOverTimeTable data={data} />);

    const summaryRow = screen.getAllByRole("row")[1];
    // itemsPerOrder: (10*2 + 2*5) / 12 = 2.5
    expect(within(summaryRow).getByText("2.5")).toBeInTheDocument();
    // AOV: (10*40 + 2*100) / 12 = 50
    expect(within(summaryRow).getByText("$50.00")).toBeInTheDocument();
  });

  it("shows a % change badge per column in the summary row", () => {
    const data = [
      row({
        orders: { current: 30, previous: 20 },
        reversedQuantity: { current: -6, previous: -4 },
      }),
    ];

    render(<OrdersOverTimeTable data={data} />);

    expect(screen.getByText("% Change")).toBeInTheDocument();
    const summaryRow = screen.getAllByRole("row")[1];
    // Orders: 30 vs 20 -> +50%. Reversed quantity: -6 vs -4 is a 50% *more
    // negative* swing -> down trend, same 50% magnitude.
    expect(within(summaryRow).getByText("↑ 50%")).toBeInTheDocument();
    expect(within(summaryRow).getByText("↓ 50%")).toBeInTheDocument();
  });

  it("shows a date-only summary heading derived from the last row (WC returns hour rows in descending order)", () => {
    const data = [
      row({ currentDateLabel: "Sep 2, 2026, 11:00 PM", previousDateLabel: "Aug 8, 2026, 11:00 PM" }),
      row({ currentDateLabel: "Sep 2, 2026, 12:00 AM", previousDateLabel: "Aug 8, 2026, 12:00 AM" }),
    ];

    render(<OrdersOverTimeTable data={data} />);

    const summaryRow = screen.getAllByRole("row")[1];
    expect(within(summaryRow).getByText("Sep 2, 2026")).toBeInTheDocument();
    expect(within(summaryRow).getByText("Aug 8, 2026")).toBeInTheDocument();
  });

  it("renders each detail row's current/previous values stacked, per column", () => {
    render(<OrdersOverTimeTable data={[row()]} />);

    // Single row: summary total equals the row itself, so values (besides
    // the date labels, which the summary strips to date-only) appear twice.
    expect(screen.getByText("Sep 2, 2026, 12:00 AM")).toBeInTheDocument();
    expect(screen.getByText("Aug 8, 2026, 12:00 AM")).toBeInTheDocument();
    expect(screen.getAllByText("24")).toHaveLength(2);
    expect(screen.getAllByText("33")).toHaveLength(2);
    expect(screen.getAllByText("2.2")).toHaveLength(2);
    expect(screen.getAllByText("2.1")).toHaveLength(2);
    expect(screen.getAllByText("$59.84")).toHaveLength(2);
    expect(screen.getAllByText("$56.21")).toHaveLength(2);
    expect(screen.getAllByText("0")).toHaveLength(2);
    expect(screen.getAllByText("-5")).toHaveLength(2);
  });
});
