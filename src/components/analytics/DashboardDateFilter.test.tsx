import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const pushMock = vi.fn();
let mockSearchParams = new URLSearchParams("");

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => mockSearchParams,
}));

import { DashboardDateFilter } from "./DashboardDateFilter";

describe("DashboardDateFilter", () => {
  it("defaults to 'Today' as active and pushes ?range=7d when 'Last 7 Days' is clicked", () => {
    mockSearchParams = new URLSearchParams("");
    render(<DashboardDateFilter />);

    const todayButton = screen.getByText("Today");
    expect(todayButton).toHaveClass("!bg-(--analytics-accent)");
    expect(todayButton).toHaveAttribute("aria-pressed", "true");

    const sevenDayButton = screen.getByText("Last 7 Days");
    expect(sevenDayButton).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(sevenDayButton);

    expect(pushMock).toHaveBeenCalledWith("?range=7d");
  });

  it("highlights 'Today' when range=custom has invalid start/end params, matching the data that actually renders", () => {
    mockSearchParams = new URLSearchParams(
      "range=custom&start=bogus&end=2026-07-15",
    );
    render(<DashboardDateFilter />);

    const todayButton = screen.getByText("Today");
    expect(todayButton).toHaveClass("!bg-(--analytics-accent)");
  });
});
