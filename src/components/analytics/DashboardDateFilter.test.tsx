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
    expect(todayButton).toHaveClass("border-(--analytics-accent)");

    fireEvent.click(screen.getByText("Last 7 Days"));

    expect(pushMock).toHaveBeenCalledWith("?range=7d");
  });

  it("highlights 'Today' when range=custom has invalid start/end params, matching the data that actually renders", () => {
    mockSearchParams = new URLSearchParams(
      "range=custom&start=bogus&end=2026-07-15",
    );
    render(<DashboardDateFilter />);

    const todayButton = screen.getByText("Today");
    expect(todayButton).toHaveClass("border-(--analytics-accent)");
  });
});
