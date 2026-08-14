import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NewVsReturningBar } from "./NewVsReturningBar";

describe("NewVsReturningBar", () => {
  it("renders the title, both counts, and a bar with proportional segment widths", () => {
    render(
      <NewVsReturningBar
        title="New vs returning customers"
        newCount={323}
        returningCount={377}
      />,
    );

    expect(screen.getByText("New vs returning customers")).toBeInTheDocument();
    expect(screen.getByText("323")).toBeInTheDocument();
    expect(screen.getByText("377")).toBeInTheDocument();

    const newSegment = screen.getByTestId("new-segment");
    const returningSegment = screen.getByTestId("returning-segment");
    // 323 / 700 = 46.14...%, 377 / 700 = 53.85...%
    expect(newSegment).toHaveStyle({ width: "46.14285714285714%" });
    expect(returningSegment).toHaveStyle({ width: "53.85714285714286%" });
  });

  it("renders a full-width single segment when one count is zero", () => {
    render(
      <NewVsReturningBar
        title="New vs returning"
        newCount={10}
        returningCount={0}
      />,
    );

    expect(screen.getByTestId("new-segment")).toHaveStyle({ width: "100%" });
    expect(screen.getByTestId("returning-segment")).toHaveStyle({
      width: "0%",
    });
  });

  it("renders an empty bar without dividing by zero when both counts are zero", () => {
    render(
      <NewVsReturningBar
        title="New vs returning"
        newCount={0}
        returningCount={0}
      />,
    );

    expect(screen.getByTestId("new-segment")).toHaveStyle({ width: "0%" });
    expect(screen.getByTestId("returning-segment")).toHaveStyle({
      width: "0%",
    });
  });
});
