import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DonutBreakdown } from "./DonutBreakdown";

describe("DonutBreakdown", () => {
  it("renders the title and a legend entry with the formatted value per item", () => {
    render(
      <DonutBreakdown
        title="Sessions by device type"
        data={[
          { name: "Mobile", value: 75 },
          { name: "Desktop", value: 25 },
        ]}
      />,
    );

    expect(screen.getByText("Sessions by device type")).toBeInTheDocument();
    expect(screen.getByText("Mobile")).toBeInTheDocument();
    expect(screen.getByText("75")).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
  });

  it("renders the total and its trend in the center of the donut when every item has a previousValue", () => {
    const { container } = render(
      <DonutBreakdown
        title="Sessions by device type"
        data={[
          { name: "Mobile", value: 3300, previousValue: 3000 },
          { name: "Desktop", value: 1100, previousValue: 1000 },
        ]}
      />,
    );

    const centerOverlay = container.querySelector(".pointer-events-none");
    expect(centerOverlay).toHaveTextContent("4,400");
    expect(centerOverlay).toHaveTextContent("10%");
  });

  it("omits the center trend when any item is missing a previousValue, while still showing trends for items that have one", () => {
    const { container } = render(
      <DonutBreakdown
        title="Sessions by device type"
        data={[
          { name: "Mobile", value: 3300, previousValue: 3000 },
          { name: "Desktop", value: 1100 },
        ]}
      />,
    );

    const centerOverlay = container.querySelector(".pointer-events-none");
    expect(centerOverlay).toHaveTextContent("4,400");
    expect(centerOverlay?.querySelector("span")).toBeNull();
    expect(screen.getByText("Mobile").closest("li")).toHaveTextContent("10%");
  });

  it("formats values as currency and renders a per-row trend when requested", () => {
    render(
      <DonutBreakdown
        title="Total sales by sales channel"
        formatValue="currency"
        data={[
          { name: "Online Store", value: 800, previousValue: 800 },
          { name: "Buy Button", value: 200, previousValue: 100 },
        ]}
      />,
    );

    expect(screen.getByText("$800.00")).toBeInTheDocument();
    expect(screen.getByText("$200.00")).toBeInTheDocument();
    // total: (1000-900)/900*100 = 11.1%; Buy Button row: (200-100)/100*100 = 100%
    expect(screen.getByText(/11\.1%/)).toBeInTheDocument();
    expect(screen.getByText(/100%/)).toBeInTheDocument();
  });
});
