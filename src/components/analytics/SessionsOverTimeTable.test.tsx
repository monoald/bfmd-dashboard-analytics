import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { SessionsOverTimeTable } from "./SessionsOverTimeTable";
import type { SessionsOverTimeBreakdownRow } from "@/lib/analytics/types";

function row(
  overrides: Partial<SessionsOverTimeBreakdownRow> = {},
): SessionsOverTimeBreakdownRow {
  return {
    date: "Sep 2",
    onlineStoreVisitors: { current: 4661, previous: 3000 },
    sessions: { current: 5420, previous: 3500 },
    ...overrides,
  };
}

describe("SessionsOverTimeTable", () => {
  it("renders nothing when given no rows", () => {
    const { container } = render(<SessionsOverTimeTable data={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the Date, Online store visitors, and Sessions columns, with the summary row showing current/previous and each detail row showing only its current value", () => {
    render(<SessionsOverTimeTable data={[row()]} />);

    // Single row: the summary total equals the row itself, so each current
    // value appears twice (summary + the one detail row); each previous
    // value appears once (only the summary row shows a previous line —
    // detail rows show a single current value, matching the Shopify
    // reference where per-row previous data is mostly "None").
    expect(screen.getAllByText("Sep 2")).toHaveLength(2);
    expect(screen.getAllByText("4,661")).toHaveLength(2);
    expect(screen.getByText("3,000")).toBeInTheDocument();
    expect(screen.getAllByText("5,420")).toHaveLength(2);
    expect(screen.getByText("3,500")).toBeInTheDocument();

    const headerRow = screen.getAllByRole("row")[0];
    const headings = within(headerRow)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent);
    expect(headings).toEqual(["Date", "Online store visitors", "Sessions"]);
  });

  it("shows a % change badge per column in the summary row, computed from the summed totals", () => {
    const data: SessionsOverTimeBreakdownRow[] = [
      row({
        onlineStoreVisitors: { current: 30, previous: 20 },
        sessions: { current: 150, previous: 100 },
      }),
    ];

    render(<SessionsOverTimeTable data={data} />);

    expect(screen.getByText("% Change")).toBeInTheDocument();
    const summaryRow = screen.getAllByRole("row")[1];
    // Visitors: 30 vs 20 -> +50%. Sessions: 150 vs 100 -> +50%.
    expect(within(summaryRow).getAllByText("↑ 50%")).toHaveLength(2);
  });

  it("sums each column across rows for the summary row", () => {
    const data = [
      row({
        date: "Row A",
        onlineStoreVisitors: { current: 10, previous: 5 },
        sessions: { current: 20, previous: 11 },
      }),
      row({
        date: "Row B",
        onlineStoreVisitors: { current: 15, previous: 8 },
        sessions: { current: 30, previous: 14 },
      }),
    ];

    render(<SessionsOverTimeTable data={data} />);

    const summaryRow = screen.getAllByRole("row")[1]; // [0] is the header row
    expect(within(summaryRow).getByText("25")).toBeInTheDocument(); // visitors current 10+15
    expect(within(summaryRow).getByText("13")).toBeInTheDocument(); // visitors previous 5+8
    expect(within(summaryRow).getByText("50")).toBeInTheDocument(); // sessions current 20+30
    expect(within(summaryRow).getByText("25")).toBeInTheDocument(); // sessions previous 11+14
  });
});
