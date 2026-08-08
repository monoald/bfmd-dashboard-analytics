import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SummaryMetricCard } from "./SummaryMetricCard";

describe("SummaryMetricCard", () => {
  it("renders title, value, and a green upward change", () => {
    render(
      <SummaryMetricCard title="Gross sales" value="$74,800.00" changePercentage={26} trend="up" sparklineData={[1, 2, 3]} />
    );

    expect(screen.getByText("Gross sales")).toBeInTheDocument();
    expect(screen.getByText("$74,800.00")).toBeInTheDocument();
    const change = screen.getByText("+26%");
    expect(change).toHaveClass("text-green-600");
  });

  it("renders a red downward change", () => {
    render(
      <SummaryMetricCard title="AOV" value="$60.75" changePercentage={-6} trend="down" sparklineData={[3, 2, 1]} />
    );

    const change = screen.getByText("-6%");
    expect(change).toHaveClass("text-red-600");
  });
});
