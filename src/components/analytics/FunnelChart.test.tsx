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

  it("renders the headline value and trend badge when provided", () => {
    render(
      <FunnelChart
        title="Conversion rate breakdown"
        steps={[{ step: "Sessions", sessions: 2740, percentage: 100 }]}
        headline={{ value: "10%", changePercentage: 22, trend: "up" }}
      />,
    );

    expect(screen.getByText("10%")).toBeInTheDocument();
    expect(screen.getByText(/22%/)).toBeInTheDocument();
  });

  it("renders a per-step trend when previousSessions is present, and omits it otherwise", () => {
    render(
      <FunnelChart
        title="Conversion rate breakdown"
        steps={[
          {
            step: "Sessions",
            sessions: 2740,
            previousSessions: 3914,
            percentage: 100,
          },
          { step: "Completed checkout", sessions: 274, percentage: 10 },
        ]}
      />,
    );

    expect(screen.getByText(/30%/)).toBeInTheDocument();
    expect(screen.getAllByText(/[↑↓]/)).toHaveLength(1);
  });
});
