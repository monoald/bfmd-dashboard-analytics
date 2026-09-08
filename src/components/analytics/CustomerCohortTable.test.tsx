import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CustomerCohortTable } from "./CustomerCohortTable";
import type { CohortRow } from "@/lib/analytics/types";

function row(overrides: Partial<CohortRow> = {}): CohortRow {
  return {
    cohortMonth: "2026-01",
    cohortSize: 10,
    retentionByMonth: [20, 15, 10],
    ...overrides,
  };
}

describe("CustomerCohortTable", () => {
  it("renders one row per cohort with its formatted month label", () => {
    render(
      <CustomerCohortTable
        rows={[
          row({ cohortMonth: "2026-01" }),
          row({ cohortMonth: "2026-02" }),
        ]}
      />,
    );

    expect(screen.getByText("Jan 2026")).toBeInTheDocument();
    expect(screen.getByText("Feb 2026")).toBeInTheDocument();
  });

  it("renders a blank cell for columns beyond a shorter row's data", () => {
    render(
      <CustomerCohortTable
        rows={[
          row({ cohortMonth: "2026-01", retentionByMonth: [20, 15, 10] }),
          row({ cohortMonth: "2026-03", retentionByMonth: [5] }),
        ]}
      />,
    );

    expect(screen.getByText("20%")).toBeInTheDocument();
    expect(screen.getByText("5%")).toBeInTheDocument();
  });

  it("shows a tooltip naming the month and cohort only while a cell is hovered", () => {
    render(
      <CustomerCohortTable
        rows={[row({ cohortMonth: "2026-01", retentionByMonth: [42] })]}
      />,
    );

    expect(
      screen.queryByText("Month 1 · Jan 2026 cohort"),
    ).not.toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByText("42%"));

    expect(screen.getByText("Month 1 · Jan 2026 cohort")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Customers who returned to purchase from you in Feb 2026",
      ),
    ).toBeInTheDocument();

    fireEvent.mouseLeave(screen.getByText("42%"));

    expect(
      screen.queryByText("Month 1 · Jan 2026 cohort"),
    ).not.toBeInTheDocument();
  });

  it("preview variant shows only the last 4 rows and at most 3 columns", () => {
    const rows = [
      row({ cohortMonth: "2026-01", retentionByMonth: [1, 2, 3, 4, 5] }),
      row({ cohortMonth: "2026-02", retentionByMonth: [1, 2, 3, 4] }),
      row({ cohortMonth: "2026-03", retentionByMonth: [1, 2, 3] }),
      row({ cohortMonth: "2026-04", retentionByMonth: [1, 2] }),
      row({ cohortMonth: "2026-05", retentionByMonth: [1] }),
    ];

    render(<CustomerCohortTable rows={rows} variant="preview" />);

    expect(screen.queryByText("Jan 2026")).not.toBeInTheDocument();
    expect(screen.getByText("Feb 2026")).toBeInTheDocument();
    expect(screen.getByText("May 2026")).toBeInTheDocument();
    expect(screen.queryByText("4%")).not.toBeInTheDocument();
  });
});
