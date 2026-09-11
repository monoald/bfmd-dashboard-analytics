import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { SocialReferrerRevenueTable } from "./SocialReferrerRevenueTable";
import type { NamedValue } from "@/lib/analytics/types";

function row(overrides: Partial<NamedValue> = {}): NamedValue {
  return {
    name: "youtube",
    value: 13806.39,
    previousValue: 3808.69,
    ...overrides,
  };
}

describe("SocialReferrerRevenueTable", () => {
  it("renders nothing when given no rows", () => {
    const { container } = render(<SocialReferrerRevenueTable data={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the requested columns in order", () => {
    render(<SocialReferrerRevenueTable data={[row()]} />);

    const headerRow = screen.getAllByRole("row")[0];
    const headings = within(headerRow)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent);
    expect(headings).toEqual(["Order referrer name", "Total sales"]);
  });

  it("renders a referrer row's name and sales (current bold, previous beneath)", () => {
    render(<SocialReferrerRevenueTable data={[row()]} />);

    const dataRow = screen.getAllByRole("row")[2];
    expect(within(dataRow).getByText("youtube")).toBeInTheDocument();
    expect(within(dataRow).getByText("$13,806.39")).toBeInTheDocument();
    expect(within(dataRow).getByText("$3,808.69")).toBeInTheDocument();
  });

  it("sums sales across referrers for the summary row, with a % change badge", () => {
    const data = [
      row({ name: "youtube", value: 13806.39, previousValue: 3808.69 }),
      row({ name: "facebook", value: 161.13, previousValue: 249.87 }),
      row({ name: "instagram", value: 103.7, previousValue: 71.62 }),
    ];

    render(<SocialReferrerRevenueTable data={data} />);

    const summaryRow = screen.getAllByRole("row")[1];
    expect(within(summaryRow).getByText("Summary")).toBeInTheDocument();
    expect(within(summaryRow).getByText("$14,071.22")).toBeInTheDocument();
    expect(within(summaryRow).getByText("$4,130.18")).toBeInTheDocument();
    // (14071.22 - 4130.18) / 4130.18 * 100 = 240.7%
    expect(within(summaryRow).getByText("↑ 240.7%")).toBeInTheDocument();
  });

  it("defaults a missing previousValue to 0 when summing", () => {
    const data = [
      row({ name: "youtube", value: 100, previousValue: undefined }),
    ];

    render(<SocialReferrerRevenueTable data={data} />);

    const summaryRow = screen.getAllByRole("row")[1];
    expect(within(summaryRow).getByText("$0.00")).toBeInTheDocument();
  });

  it("shows a row-count footer", () => {
    const data = [
      row({ name: "youtube" }),
      row({ name: "facebook" }),
      row({ name: "instagram" }),
    ];

    render(<SocialReferrerRevenueTable data={data} />);

    expect(screen.getByText("3 rows")).toBeInTheDocument();
  });
});
