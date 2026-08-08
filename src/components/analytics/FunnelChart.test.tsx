import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FunnelChart } from "./FunnelChart";

describe("FunnelChart", () => {
  it("renders each step's label, percentage, and session count", () => {
    render(
      <FunnelChart
        title="Conversion rate breakdown"
        steps={[
          { step: "Sessions", sessions: 5516, percentage: 100 },
          { step: "Completed checkout", sessions: 552, percentage: 10 },
        ]}
      />,
    );

    expect(screen.getByText("Sessions")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("552")).toBeInTheDocument();
  });
});
