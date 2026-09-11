import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { SalesByProductTable } from "./SalesByProductTable";
import type { SalesByProductBreakdownRow } from "@/lib/analytics/types";

function row(
  overrides: Partial<SalesByProductBreakdownRow> = {},
): SalesByProductBreakdownRow {
  return {
    productId: 1,
    productTitle: "Cocoa Flavanols",
    productVendor: "Black Forest Supplements",
    productType: "Simple",
    netItemsSold: { current: 1149, previous: 1125 },
    grossSales: null,
    discounts: null,
    salesReversals: null,
    netSales: { current: 45602.51, previous: 44346.79 },
    taxes: null,
    totalSales: null,
    ...overrides,
  };
}

describe("SalesByProductTable", () => {
  it("renders nothing when given no rows", () => {
    const { container } = render(<SalesByProductTable data={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the requested columns in order", () => {
    render(<SalesByProductTable data={[row()]} />);

    const headerRow = screen.getAllByRole("row")[0];
    const headings = within(headerRow)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent);
    expect(headings).toEqual([
      "Product Title",
      "Product Vendor",
      "Product Type",
      "Net Items Sold",
      "Gross Sales",
      "Discounts",
      "Sales Reversals",
      "Net Sales",
      "Taxes",
      "Total Sales",
    ]);
  });

  it("renders a product row's title, vendor, type, item count, and net sales", () => {
    render(<SalesByProductTable data={[row()]} />);

    const dataRow = screen.getAllByRole("row")[2];
    expect(within(dataRow).getByText("Cocoa Flavanols")).toBeInTheDocument();
    expect(
      within(dataRow).getByText("Black Forest Supplements"),
    ).toBeInTheDocument();
    expect(within(dataRow).getByText("Simple")).toBeInTheDocument();
    expect(within(dataRow).getByText("1,149")).toBeInTheDocument();
    expect(within(dataRow).getByText("$45,602.51")).toBeInTheDocument();
  });

  it("renders an em dash for columns WC's products report doesn't expose (gross sales, discounts, sales reversals, taxes, total sales)", () => {
    render(<SalesByProductTable data={[row()]} />);

    const dataRow = screen.getAllByRole("row")[2];
    expect(within(dataRow).getAllByText("—")).toHaveLength(5);
  });

  it("sums Net Items Sold and Net Sales across products for the summary row, with a % change badge", () => {
    const data = [
      row({
        netItemsSold: { current: 100, previous: 50 },
        netSales: { current: 1000, previous: 500 },
      }),
      row({
        productId: 2,
        productTitle: "Magnesium Sleep Aid",
        netItemsSold: { current: 50, previous: 50 },
        netSales: { current: 500, previous: 500 },
      }),
    ];

    render(<SalesByProductTable data={data} />);

    const summaryRow = screen.getAllByRole("row")[1];
    expect(within(summaryRow).getByText("Summary")).toBeInTheDocument();
    expect(within(summaryRow).getByText("150")).toBeInTheDocument();
    expect(within(summaryRow).getByText("100")).toBeInTheDocument();
    expect(within(summaryRow).getByText("$1,500.00")).toBeInTheDocument();
    expect(within(summaryRow).getByText("$1,000.00")).toBeInTheDocument();
    // Both Net Items Sold and Net Sales doubled (100→150, 1000→1500), so
    // both summary badges read the same 50% up change.
    expect(within(summaryRow).getAllByText("↑ 50%")).toHaveLength(2);
  });

  it("shows an em dash rather than $0.00 in the summary row for unavailable columns", () => {
    render(<SalesByProductTable data={[row(), row({ productId: 2 })]} />);

    const summaryRow = screen.getAllByRole("row")[1];
    expect(within(summaryRow).getAllByText("—")).toHaveLength(5);
    expect(within(summaryRow).queryByText("$0.00")).not.toBeInTheDocument();
  });
});
