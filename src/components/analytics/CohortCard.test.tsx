import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const getCustomerCohortAnalysisCardMock = vi.fn();
vi.mock("@/lib/analytics/actions", () => ({
  getCustomerCohortAnalysisCard: () => getCustomerCohortAnalysisCardMock(),
}));

import { CohortCard } from "./CohortCard";

describe("CohortCard", () => {
  it("renders an error card when the fetch settles to an Error", async () => {
    getCustomerCohortAnalysisCardMock.mockResolvedValue(
      new Error("Unable to load data for this card. Please try again later."),
    );

    render(await CohortCard({ variant: "full" }));

    expect(screen.getByText("Customer cohort analysis")).toBeInTheDocument();
    expect(
      screen.getByText(/Unable to load data for this card/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders the table unlinked for variant 'full'", async () => {
    getCustomerCohortAnalysisCardMock.mockResolvedValue([
      { cohortMonth: "2026-06", cohortSize: 2, retentionByMonth: [50] },
    ]);

    render(await CohortCard({ variant: "full" }));

    expect(screen.getByText("Customer cohort analysis")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("wraps the table in a link to the full report, preserving the range query, for variant 'preview'", async () => {
    getCustomerCohortAnalysisCardMock.mockResolvedValue([
      { cohortMonth: "2026-06", cohortSize: 2, retentionByMonth: [50] },
    ]);

    render(await CohortCard({ variant: "preview", rangeQuery: "range=7d" }));

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "/reports/customer-cohort-analysis?range=7d",
    );
  });
});
