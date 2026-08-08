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
      />
    );

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Cocoa Flavanols");
    expect(rows[0]).toHaveTextContent("$23678.06");
  });
});
