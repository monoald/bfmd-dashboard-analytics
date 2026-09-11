import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { SessionsByDeviceTable } from "./SessionsByDeviceTable";
import type { SessionsByDeviceBreakdownRow } from "@/lib/analytics/types";

function row(
  overrides: Partial<SessionsByDeviceBreakdownRow> = {},
): SessionsByDeviceBreakdownRow {
  return {
    deviceCategory: "Mobile",
    onlineStoreVisitors: { current: 3753, previous: 3310 },
    sessions: { current: 4252, previous: 3911 },
    ...overrides,
  };
}

const summary = {
  onlineStoreVisitors: { current: 5232, previous: 4661 },
  sessions: { current: 5888, previous: 5420 },
};

describe("SessionsByDeviceTable", () => {
  it("renders nothing when given no rows", () => {
    const { container } = render(
      <SessionsByDeviceTable data={[]} summary={summary} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the requested columns in order", () => {
    render(<SessionsByDeviceTable data={[row()]} summary={summary} />);

    const headerRow = screen.getAllByRole("row")[0];
    const headings = within(headerRow)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent);
    expect(headings).toEqual([
      "Session device type",
      "Online store visitors",
      "Sessions",
    ]);
  });

  it("renders a device row's name, visitors, and sessions (current bold, previous beneath)", () => {
    render(<SessionsByDeviceTable data={[row()]} summary={summary} />);

    const dataRow = screen.getAllByRole("row")[2];
    expect(within(dataRow).getByText("Mobile")).toBeInTheDocument();
    expect(within(dataRow).getByText("3,753")).toBeInTheDocument();
    expect(within(dataRow).getByText("3,310")).toBeInTheDocument();
    expect(within(dataRow).getByText("4,252")).toBeInTheDocument();
    expect(within(dataRow).getByText("3,911")).toBeInTheDocument();
  });

  // GA4's totalUsers double-counts a user across device rows if they visit
  // via more than one device in the period (same overcounting class as
  // SessionsSummary's documented dateHour case) — confirmed live: summing
  // this store's device breakdown gave 67 previous-period visitors, but the
  // real whole-period total was 66. The summary row must use the passed-in
  // whole-period `summary` prop, never sum the detail rows.
  it("renders the summary row from the summary prop, not by summing the detail rows", () => {
    const data = [
      row({
        deviceCategory: "Mobile",
        onlineStoreVisitors: { current: 100, previous: 50 },
        sessions: { current: 200, previous: 100 },
      }),
      row({
        deviceCategory: "Desktop",
        onlineStoreVisitors: { current: 50, previous: 50 },
        sessions: { current: 60, previous: 60 },
      }),
    ];

    render(<SessionsByDeviceTable data={data} summary={summary} />);

    const summaryRow = screen.getAllByRole("row")[1];
    expect(within(summaryRow).getByText("Summary")).toBeInTheDocument();
    expect(within(summaryRow).getByText("5,232")).toBeInTheDocument();
    expect(within(summaryRow).getByText("4,661")).toBeInTheDocument();
    expect(within(summaryRow).getByText("5,888")).toBeInTheDocument();
    expect(within(summaryRow).getByText("5,420")).toBeInTheDocument();
    // Detail rows sum to 150/260 (visitors/sessions), which must NOT appear
    // anywhere in the summary row.
    expect(within(summaryRow).queryByText("150")).not.toBeInTheDocument();
    expect(within(summaryRow).queryByText("260")).not.toBeInTheDocument();
  });

  it("shows a % change badge on the summary row for both columns, computed from the summary prop", () => {
    render(<SessionsByDeviceTable data={[row()]} summary={summary} />);

    const summaryRow = screen.getAllByRole("row")[1];
    // visitors: 5232 vs 4661 -> +12.3%; sessions: 5888 vs 5420 -> +8.6%
    expect(within(summaryRow).getByText("↑ 12.3%")).toBeInTheDocument();
    expect(within(summaryRow).getByText("↑ 8.6%")).toBeInTheDocument();
  });

  it("shows a row-count footer", () => {
    const data = [
      row({ deviceCategory: "Mobile" }),
      row({ deviceCategory: "Desktop" }),
      row({ deviceCategory: "Tablet" }),
      row({ deviceCategory: "Other" }),
    ];

    render(<SessionsByDeviceTable data={data} summary={summary} />);

    expect(screen.getByText("4 rows")).toBeInTheDocument();
  });

  it("gives each device row a colored dot, cycling through the shared DonutBreakdown color palette by row order", () => {
    const data = [
      row({ deviceCategory: "Mobile" }),
      row({ deviceCategory: "Desktop" }),
    ];

    const { container } = render(
      <SessionsByDeviceTable data={data} summary={summary} />,
    );

    const dots = container.querySelectorAll(
      "tbody tr:not(:first-child) span.rounded-full",
    );
    expect(dots).toHaveLength(2);
    expect(dots[0]).toHaveStyle({ backgroundColor: "var(--analytics-accent)" });
    expect(dots[1]).toHaveStyle({ backgroundColor: "var(--analytics-t2)" });
  });
});
