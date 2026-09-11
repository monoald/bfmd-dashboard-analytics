import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { SessionsByLocationTable } from "./SessionsByLocationTable";
import type { SessionsByLocationBreakdownRow } from "@/lib/analytics/types";

function row(
  overrides: Partial<SessionsByLocationBreakdownRow> = {},
): SessionsByLocationBreakdownRow {
  return {
    country: "United States",
    region: "Illinois",
    city: "Chicago",
    onlineStoreVisitors: { current: 98, previous: 74 },
    sessions: { current: 112, previous: 83 },
    ...overrides,
  };
}

const summary = {
  onlineStoreVisitors: { current: 5232, previous: 4661 },
  sessions: { current: 5888, previous: 5420 },
};

describe("SessionsByLocationTable", () => {
  it("renders nothing when given no rows", () => {
    const { container } = render(
      <SessionsByLocationTable data={[]} summary={summary} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the requested columns in order", () => {
    render(<SessionsByLocationTable data={[row()]} summary={summary} />);

    const headerRow = screen.getAllByRole("row")[0];
    const headings = within(headerRow)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent);
    expect(headings).toEqual([
      "Session country",
      "Session region",
      "Session city",
      "Online store visitors",
      "Sessions",
    ]);
  });

  it("renders a location row's country, region, city, visitors, and sessions (current bold, previous beneath)", () => {
    render(<SessionsByLocationTable data={[row()]} summary={summary} />);

    const dataRow = screen.getAllByRole("row")[2];
    expect(within(dataRow).getByText("United States")).toBeInTheDocument();
    expect(within(dataRow).getByText("Illinois")).toBeInTheDocument();
    expect(within(dataRow).getByText("Chicago")).toBeInTheDocument();
    expect(within(dataRow).getByText("98")).toBeInTheDocument();
    expect(within(dataRow).getByText("74")).toBeInTheDocument();
    expect(within(dataRow).getByText("112")).toBeInTheDocument();
    expect(within(dataRow).getByText("83")).toBeInTheDocument();
  });

  // Same overcounting risk as SessionsByDeviceBreakdownRow (see its
  // comment): a visitor active from more than one city in the period would
  // be double-counted if the summary row summed the detail rows.
  it("renders the summary row from the summary prop, not by summing the detail rows", () => {
    const data = [
      row({
        country: "United States",
        region: "Illinois",
        city: "Chicago",
        onlineStoreVisitors: { current: 100, previous: 50 },
        sessions: { current: 200, previous: 100 },
      }),
      row({
        country: "United States",
        region: "California",
        city: "Los Angeles",
        onlineStoreVisitors: { current: 50, previous: 50 },
        sessions: { current: 60, previous: 60 },
      }),
    ];

    render(<SessionsByLocationTable data={data} summary={summary} />);

    const summaryRow = screen.getAllByRole("row")[1];
    expect(within(summaryRow).getByText("Summary")).toBeInTheDocument();
    expect(within(summaryRow).getByText("5,232")).toBeInTheDocument();
    expect(within(summaryRow).getByText("4,661")).toBeInTheDocument();
    expect(within(summaryRow).getByText("5,888")).toBeInTheDocument();
    expect(within(summaryRow).getByText("5,420")).toBeInTheDocument();
    expect(within(summaryRow).queryByText("150")).not.toBeInTheDocument();
    expect(within(summaryRow).queryByText("260")).not.toBeInTheDocument();
  });

  it("shows a % change badge on the summary row for both columns, computed from the summary prop", () => {
    render(<SessionsByLocationTable data={[row()]} summary={summary} />);

    const summaryRow = screen.getAllByRole("row")[1];
    // visitors: 5232 vs 4661 -> +12.3%; sessions: 5888 vs 5420 -> +8.6%
    expect(within(summaryRow).getByText("↑ 12.3%")).toBeInTheDocument();
    expect(within(summaryRow).getByText("↑ 8.6%")).toBeInTheDocument();
  });
});
