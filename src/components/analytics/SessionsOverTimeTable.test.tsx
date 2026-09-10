import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { SessionsOverTimeTable } from "./SessionsOverTimeTable";
import type {
  SessionsOverTimeBreakdownRow,
  SessionsSummary,
} from "@/lib/analytics/types";

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

function summary(overrides: Partial<SessionsSummary> = {}): SessionsSummary {
  return {
    onlineStoreVisitors: { current: 4661, previous: 3000 },
    sessions: { current: 5420, previous: 3500 },
    ...overrides,
  };
}

describe("SessionsOverTimeTable", () => {
  it("renders nothing when given no rows", () => {
    const { container } = render(
      <SessionsOverTimeTable data={[]} summary={summary()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the Date, Online store visitors, and Sessions columns, with the summary row showing current/previous and each detail row showing only its current value", () => {
    render(<SessionsOverTimeTable data={[row()]} summary={summary()} />);

    // Single row: the summary prop mirrors the row itself, so each current
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

  it("shows a % change badge per column in the summary row, computed from the summary prop", () => {
    render(
      <SessionsOverTimeTable
        data={[row()]}
        summary={summary({
          onlineStoreVisitors: { current: 30, previous: 20 },
          sessions: { current: 150, previous: 100 },
        })}
      />,
    );

    expect(screen.getByText("% Change")).toBeInTheDocument();
    const summaryRow = screen.getAllByRole("row")[1];
    // Visitors: 30 vs 20 -> +50%. Sessions: 150 vs 100 -> +50%.
    expect(within(summaryRow).getAllByText("↑ 50%")).toHaveLength(2);
  });

  // Regression test for the bug this `summary` prop fixes: GA4's "sessions"
  // metric attributes a session to every dateHour bucket it was active in, so
  // a session spanning an hour boundary gets counted in two rows — summing
  // the rows shown in `data` would silently inflate the total (confirmed
  // against a live property: dateHour-summed 158 vs. the true 155 for the
  // same day). The summary row must render the caller-supplied whole-period
  // total verbatim, not a sum it computes itself from `data`.
  it("renders the summary prop's totals as-is, even when they differ from a naive sum of the rows", () => {
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
    // Naive per-row sums would be visitors 25/13, sessions 50/25 — deliberately
    // use different totals here to prove they come from `summary`, not `data`.
    const wholePeriodSummary = summary({
      onlineStoreVisitors: { current: 22, previous: 12 },
      sessions: { current: 45, previous: 23 },
    });

    render(<SessionsOverTimeTable data={data} summary={wholePeriodSummary} />);

    const summaryRow = screen.getAllByRole("row")[1]; // [0] is the header row
    expect(within(summaryRow).getByText("22")).toBeInTheDocument();
    expect(within(summaryRow).getByText("12")).toBeInTheDocument();
    expect(within(summaryRow).getByText("45")).toBeInTheDocument();
    expect(within(summaryRow).getByText("23")).toBeInTheDocument();
    expect(within(summaryRow).queryByText("25")).not.toBeInTheDocument();
    expect(within(summaryRow).queryByText("50")).not.toBeInTheDocument();
  });
});
