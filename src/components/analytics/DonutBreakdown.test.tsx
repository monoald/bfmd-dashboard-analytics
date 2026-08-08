import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DonutBreakdown } from "./DonutBreakdown";

describe("DonutBreakdown", () => {
  it("renders the title and a legend entry with percentage per item", () => {
    render(
      <DonutBreakdown
        title="Sessions by device type"
        data={[
          { name: "Mobile", value: 75 },
          { name: "Desktop", value: 25 },
        ]}
      />
    );

    expect(screen.getByText("Sessions by device type")).toBeInTheDocument();
    expect(screen.getByText("Mobile")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
  });
});
