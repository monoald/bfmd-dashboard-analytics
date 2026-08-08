import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RankedList } from "./RankedList";

describe("RankedList", () => {
  it("renders each item's name and formatted value in list order", () => {
    render(
      <RankedList
        title="Total sales by product"
        items={[
          { name: "Cocoa Flavanols", value: 23678.06 },
          { name: "Magnesium Sleep Aid", value: 5134.49 },
        ]}
        formatValue={(v) => `$${v.toFixed(2)}`}
      />,
    );

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Cocoa Flavanols");
    expect(rows[0]).toHaveTextContent("$23678.06");
  });

  it("highlights the last row as a bold total and colors negative values in the breakdown variant", () => {
    render(
      <RankedList
        title="Total sales breakdown"
        variant="breakdown"
        items={[
          { name: "Gross sales", value: 79290.33 },
          { name: "Discounts", value: -20539.97 },
          { name: "Net sales", value: 57496.29 },
          { name: "Total sales", value: 60708.36 },
        ]}
        formatValue={(v) => `$${v.toFixed(2)}`}
      />,
    );

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(4);

    const discountsValue = screen.getByText("$-20539.97");
    expect(discountsValue).toHaveClass("text-(--analytics-down)");

    const netSalesValue = screen.getByText("$57496.29");
    expect(netSalesValue).toHaveClass("text-(--analytics-up)");

    const totalRow = rows[rows.length - 1];
    expect(totalRow).toHaveTextContent("Total sales");
    expect(screen.getByText("Total sales")).toHaveClass("font-extrabold");
  });

  it("renders a period-over-period comparison bar and % change when items carry previousValue", () => {
    render(
      <RankedList
        title="Total sales by product"
        items={[
          { name: "Cocoa Flavanols", value: 14500, previousValue: 33300 },
        ]}
        formatValue={(v) => `$${(v / 1000).toFixed(1)}K`}
      />,
    );

    expect(screen.getByText("$14.5K")).toBeInTheDocument();
    expect(screen.getByText("$33.3K")).toBeInTheDocument();
    expect(screen.getByText(/56\.5%/)).toBeInTheDocument();
  });

  it("does not render a comparison row when previousValue is absent", () => {
    render(
      <RankedList
        title="Sessions by location"
        items={[{ name: "Miami", value: 342 }]}
      />,
    );

    expect(screen.getByText("342")).toBeInTheDocument();
    expect(screen.queryByText(/[↑↓]/)).not.toBeInTheDocument();
  });
});
