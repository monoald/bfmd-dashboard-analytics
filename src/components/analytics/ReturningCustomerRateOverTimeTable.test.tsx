import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ReturningCustomerRateOverTimeTable } from "./ReturningCustomerRateOverTimeTable";
import type { ReturningCustomerRateBreakdownRow } from "@/lib/analytics/types";

function row(
  overrides: Partial<ReturningCustomerRateBreakdownRow> = {},
): ReturningCustomerRateBreakdownRow {
  return {
    currentDateLabel: "Sep 2, 2026, 12:00 AM",
    previousDateLabel: "Aug 8, 2026, 12:00 AM",
    returningCustomers: { current: 12, previous: 20 },
    customers: { current: 23, previous: 30 },
    returningCustomerRate: { current: 52.17, previous: 66.66 },
    ...overrides,
  };
}

const summary = {
  returningCustomers: { current: 466, previous: 417 },
  customers: { current: 949, previous: 803 },
  returningCustomerRate: { current: 49.1, previous: 51.93 },
};

describe("ReturningCustomerRateOverTimeTable", () => {
  it("renders nothing when given no rows", () => {
    const { container } = render(
      <ReturningCustomerRateOverTimeTable data={[]} summary={summary} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the three Shopify-parity columns with a Date header", () => {
    render(
      <ReturningCustomerRateOverTimeTable data={[row()]} summary={summary} />,
    );

    const headerRow = screen.getAllByRole("row")[0];
    const headings = within(headerRow)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent);
    expect(headings).toEqual([
      "Date",
      "Returning customers",
      "Customers",
      "Returning customer rate",
    ]);
  });

  it("renders the summary row from the summary prop, not by summing the detail rows", () => {
    render(
      <ReturningCustomerRateOverTimeTable
        data={[row(), row()]}
        summary={summary}
      />,
    );

    const summaryRow = screen.getAllByRole("row")[1];
    // summary prop's 466/949/49.1% must win over 2x the detail rows' 12/23
    expect(within(summaryRow).getByText("466")).toBeInTheDocument();
    expect(within(summaryRow).getByText("417")).toBeInTheDocument();
    expect(within(summaryRow).getByText("949")).toBeInTheDocument();
    expect(within(summaryRow).getByText("803")).toBeInTheDocument();
    expect(within(summaryRow).getByText("49.1%")).toBeInTheDocument();
    expect(within(summaryRow).getByText("51.9%")).toBeInTheDocument();
    expect(screen.queryByText("24")).not.toBeInTheDocument();
  });

  it("shows a % change badge per column in the summary row, computed from the summary prop", () => {
    render(<ReturningCustomerRateOverTimeTable data={[row()]} summary={summary} />);

    expect(screen.getByText("% Change")).toBeInTheDocument();
    const summaryRow = screen.getAllByRole("row")[1];
    // Returning customers: 466 vs 417 -> +11.8% (rounds to 11.8, up)
    // Customers: 949 vs 803 -> +18.2%
    // Rate: 49.1 vs 51.93 -> -5.4%
    expect(within(summaryRow).getByText(/11\.8%/)).toBeInTheDocument();
    expect(within(summaryRow).getByText(/18\.2%/)).toBeInTheDocument();
    expect(within(summaryRow).getByText(/5\.4%/)).toBeInTheDocument();
  });

  it("shows the summary row's date labels derived from the last detail row (most-recent-first order)", () => {
    const data = [
      row({ currentDateLabel: "Sep 2, 2026, 11:00 PM", previousDateLabel: "Aug 8, 2026, 11:00 PM" }),
      row({ currentDateLabel: "Sep 2, 2026, 12:00 AM", previousDateLabel: "Aug 8, 2026, 12:00 AM" }),
    ];

    render(<ReturningCustomerRateOverTimeTable data={data} summary={summary} />);

    const summaryRow = screen.getAllByRole("row")[1];
    expect(within(summaryRow).getByText("Sep 2, 2026")).toBeInTheDocument();
    expect(within(summaryRow).getByText("Aug 8, 2026")).toBeInTheDocument();
  });

  it("renders each detail row's current/previous values stacked, per column", () => {
    render(<ReturningCustomerRateOverTimeTable data={[row()]} summary={summary} />);

    expect(screen.getByText("Sep 2, 2026, 12:00 AM")).toBeInTheDocument();
    expect(screen.getByText("Aug 8, 2026, 12:00 AM")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText("23")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText("52.2%")).toBeInTheDocument();
    expect(screen.getByText("66.7%")).toBeInTheDocument();
  });
});
