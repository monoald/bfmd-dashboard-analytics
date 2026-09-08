import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ConversionRateOverTimeTable } from "./ConversionRateOverTimeTable";
import type { ConversionRateOverTimeBreakdownRow } from "@/lib/analytics/types";

function row(
  overrides: Partial<ConversionRateOverTimeBreakdownRow> = {},
): ConversionRateOverTimeBreakdownRow {
  return {
    date: "Sep 2",
    sessions: { current: 100, previous: 80 },
    addedToCart: { current: 26, previous: 23 },
    reachedCheckout: { current: 15, previous: 12 },
    completedCheckout: { current: 10, previous: 6 },
    conversionRate: { current: 10, previous: 7.5 },
    ...overrides,
  };
}

describe("ConversionRateOverTimeTable", () => {
  it("renders nothing when given no rows", () => {
    const { container } = render(<ConversionRateOverTimeTable data={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the Date, funnel-count, and Conversion rate columns, with the summary row showing current/previous and each detail row showing only its current value", () => {
    render(<ConversionRateOverTimeTable data={[row()]} />);

    expect(screen.getAllByText("Sep 2")).toHaveLength(2);
    expect(screen.getAllByText("100")).toHaveLength(2);
    expect(screen.getByText("80")).toBeInTheDocument();
    expect(screen.getAllByText("26")).toHaveLength(2);
    expect(screen.getByText("23")).toBeInTheDocument();
    expect(screen.getAllByText("15")).toHaveLength(2);
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getAllByText("10")).toHaveLength(2);
    expect(screen.getByText("6")).toBeInTheDocument();
    // Single row: the summary's weighted conversionRate equals the row's
    // own rate (10/100 = 10.0%), so "10.0%" appears twice (summary +
    // detail); previous (6/80 = 7.5%) only appears once, in the summary.
    expect(screen.getAllByText("10.0%")).toHaveLength(2);
    expect(screen.getByText("7.5%")).toBeInTheDocument();

    const headerRow = screen.getAllByRole("row")[0];
    const headings = within(headerRow)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent);
    expect(headings).toEqual([
      "Date",
      "Sessions",
      "Added to cart",
      "Reached checkout",
      "Completed checkout",
      "Conversion rate",
    ]);
  });

  it("computes the summary row's conversion rate from summed sessions/completedCheckout, not by averaging or summing the per-row rate values", () => {
    // Row A: 10 sessions, 1 completed -> 10% rate. Row B: 90 sessions, 90
    // completed -> 100% rate. Naive average = (10+100)/2 = 55%. Naive sum =
    // 110% (nonsensical). Weighted = (1+90) / (10+90) = 91%.
    const data: ConversionRateOverTimeBreakdownRow[] = [
      row({
        date: "Row A",
        sessions: { current: 10, previous: 0 },
        completedCheckout: { current: 1, previous: 0 },
        conversionRate: { current: 10, previous: 0 },
      }),
      row({
        date: "Row B",
        sessions: { current: 90, previous: 0 },
        completedCheckout: { current: 90, previous: 0 },
        conversionRate: { current: 100, previous: 0 },
      }),
    ];

    render(<ConversionRateOverTimeTable data={data} />);

    const summaryRow = screen.getAllByRole("row")[1];
    expect(within(summaryRow).getByText("91.0%")).toBeInTheDocument();
    expect(within(summaryRow).queryByText("55.0%")).not.toBeInTheDocument();
    expect(within(summaryRow).queryByText("110.0%")).not.toBeInTheDocument();
  });

  it("sums the funnel-count columns across rows for the summary row", () => {
    // Chosen so every column total below is distinct — sessions {40,21},
    // addedToCart {16,9}, reachedCheckout {8,5}, completedCheckout {4,2} —
    // so each getByText call is unambiguous.
    const data = [
      row({
        date: "Row A",
        sessions: { current: 20, previous: 11 },
        addedToCart: { current: 8, previous: 5 },
        reachedCheckout: { current: 4, previous: 3 },
        completedCheckout: { current: 2, previous: 1 },
      }),
      row({
        date: "Row B",
        sessions: { current: 20, previous: 10 },
        addedToCart: { current: 8, previous: 4 },
        reachedCheckout: { current: 4, previous: 2 },
        completedCheckout: { current: 2, previous: 1 },
      }),
    ];

    render(<ConversionRateOverTimeTable data={data} />);

    const summaryRow = screen.getAllByRole("row")[1];
    expect(within(summaryRow).getByText("40")).toBeInTheDocument(); // sessions
    expect(within(summaryRow).getByText("21")).toBeInTheDocument(); // sessions previous
    expect(within(summaryRow).getByText("16")).toBeInTheDocument(); // addedToCart
    expect(within(summaryRow).getByText("9")).toBeInTheDocument(); // addedToCart previous
    expect(within(summaryRow).getByText("8")).toBeInTheDocument(); // reachedCheckout
    expect(within(summaryRow).getByText("5")).toBeInTheDocument(); // reachedCheckout previous
    expect(within(summaryRow).getByText("4")).toBeInTheDocument(); // completedCheckout
    expect(within(summaryRow).getByText("2")).toBeInTheDocument(); // completedCheckout previous
  });
});
