import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { RevenueBreakdownTable } from "./RevenueBreakdownTable";
import type { RevenueBreakdownRow } from "@/lib/analytics/types";

describe("RevenueBreakdownTable", () => {
  it("renders nothing when given no rows", () => {
    const { container } = render(<RevenueBreakdownTable data={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a per-row breakdown across gross sales, discounts, orders, and AOV", () => {
    const data: RevenueBreakdownRow[] = [
      {
        currentDateLabel: "Sep 2, 2026, 12:00 AM",
        previousDateLabel: "Sep 1, 2026, 12:00 AM",
        grossSales: { current: 1953.34, previous: 2151.34 },
        discounts: { current: -516.99, previous: -684.02 },
        orders: { current: 24, previous: 24 },
        averageOrderValue: { current: 59.84, previous: 61.13 },
      },
    ];

    render(<RevenueBreakdownTable data={data} />);

    expect(screen.getByText("Sep 2, 2026, 12:00 AM")).toBeInTheDocument();
    expect(screen.getByText("Sep 1, 2026, 12:00 AM")).toBeInTheDocument();
    // With a single row, the summary total equals the row itself, so each
    // value legitimately appears twice (summary + the one detail row).
    expect(screen.getAllByText("$1,953.34")).toHaveLength(2);
    expect(screen.getAllByText("$2,151.34")).toHaveLength(2);
    expect(screen.getAllByText("-$516.99")).toHaveLength(2);
    expect(screen.getAllByText("-$684.02")).toHaveLength(2);
    expect(screen.getAllByText("24")).toHaveLength(4);
    expect(screen.getAllByText("$59.84")).toHaveLength(2);
    expect(screen.getAllByText("$61.13")).toHaveLength(2);
  });

  it("shows a date-only (no time) summary heading derived from the first row's label", () => {
    const data: RevenueBreakdownRow[] = [
      {
        currentDateLabel: "Sep 2, 2026, 12:00 AM",
        previousDateLabel: "Sep 1, 2026, 12:00 AM",
        grossSales: { current: 100, previous: 100 },
        discounts: { current: 0, previous: 0 },
        orders: { current: 1, previous: 1 },
        averageOrderValue: { current: 100, previous: 100 },
      },
    ];

    render(<RevenueBreakdownTable data={data} />);

    expect(screen.getByText("Sep 2, 2026")).toBeInTheDocument();
    expect(screen.getByText("Sep 1, 2026")).toBeInTheDocument();
  });

  it("derives the summary heading from the period's actual start (the last row), not the first — WC returns hour rows in descending order", () => {
    // Regression test: rows come back most-recent-hour-first (matches
    // salesOverTime/aovOverTime elsewhere), so data[0] is 11 PM, not
    // midnight — using it for the summary date produced a visible
    // off-by-one-day bug (confirmed live: "Sep 3" shown instead of "Sep 2"
    // for a range that only covers Sep 2).
    const data: RevenueBreakdownRow[] = [
      {
        currentDateLabel: "Sep 2, 2026, 11:00 PM",
        previousDateLabel: "Sep 1, 2026, 11:00 PM",
        grossSales: { current: 0, previous: 0 },
        discounts: { current: 0, previous: 0 },
        orders: { current: 0, previous: 0 },
        averageOrderValue: { current: 0, previous: 0 },
      },
      {
        currentDateLabel: "Sep 2, 2026, 12:00 AM",
        previousDateLabel: "Sep 1, 2026, 12:00 AM",
        grossSales: { current: 100, previous: 100 },
        discounts: { current: 0, previous: 0 },
        orders: { current: 1, previous: 1 },
        averageOrderValue: { current: 100, previous: 100 },
      },
    ];

    render(<RevenueBreakdownTable data={data} />);

    const summaryRow = screen.getAllByRole("row")[1];
    expect(within(summaryRow).getByText("Sep 2, 2026")).toBeInTheDocument();
    expect(within(summaryRow).getByText("Sep 1, 2026")).toBeInTheDocument();
    expect(screen.getByText("% Change")).toBeInTheDocument();
  });

  it("computes the summary row's average order value from weighted totals, not a plain average of the per-row AOV values", () => {
    // Row A: 1 order at $10 AOV. Row B: 9 orders at $100 AOV.
    // Weighted AOV = (1*10 + 9*100) / (1+9) = 910/10 = $91 — not the plain
    // average of the two AOVs, (10+100)/2 = $55.
    const data: RevenueBreakdownRow[] = [
      {
        currentDateLabel: "Row A",
        previousDateLabel: "Row A",
        grossSales: { current: 10, previous: 0 },
        discounts: { current: 0, previous: 0 },
        orders: { current: 1, previous: 0 },
        averageOrderValue: { current: 10, previous: 0 },
      },
      {
        currentDateLabel: "Row B",
        previousDateLabel: "Row B",
        grossSales: { current: 900, previous: 0 },
        discounts: { current: 0, previous: 0 },
        orders: { current: 9, previous: 0 },
        averageOrderValue: { current: 100, previous: 0 },
      },
    ];

    render(<RevenueBreakdownTable data={data} />);

    expect(screen.getByText("$91.00")).toBeInTheDocument();
    expect(screen.queryByText("$55.00")).not.toBeInTheDocument();
  });

  it("sums gross sales, discounts, and orders across rows for the summary row", () => {
    const data: RevenueBreakdownRow[] = [
      {
        currentDateLabel: "Row A",
        previousDateLabel: "Row A",
        grossSales: { current: 100, previous: 50 },
        discounts: { current: -10, previous: -5 },
        orders: { current: 2, previous: 1 },
        averageOrderValue: { current: 50, previous: 50 },
      },
      {
        currentDateLabel: "Row B",
        previousDateLabel: "Row B",
        grossSales: { current: 200, previous: 150 },
        discounts: { current: -20, previous: -15 },
        orders: { current: 3, previous: 2 },
        averageOrderValue: { current: 66.67, previous: 75 },
      },
    ];

    render(<RevenueBreakdownTable data={data} />);

    const summaryRow = screen.getAllByRole("row")[1]; // [0] is the <thead> header row
    expect(within(summaryRow).getByText("$300.00")).toBeInTheDocument();
    expect(within(summaryRow).getByText("$200.00")).toBeInTheDocument();
    expect(within(summaryRow).getByText("-$30.00")).toBeInTheDocument();
    expect(within(summaryRow).getByText("-$20.00")).toBeInTheDocument();
    expect(within(summaryRow).getByText("5")).toBeInTheDocument();
    expect(within(summaryRow).getByText("3")).toBeInTheDocument();
  });
});
