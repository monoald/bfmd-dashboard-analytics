import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(""),
}));

import { DashboardDateFilter } from "./DashboardDateFilter";

describe("DashboardDateFilter", () => {
  it("defaults to 'Today' as active and pushes ?range=7d when 'Last 7 Days' is clicked", () => {
    render(<DashboardDateFilter />);

    const todayButton = screen.getByText("Today");
    expect(todayButton).toHaveClass("border-(--analytics-accent)");

    fireEvent.click(screen.getByText("Last 7 Days"));

    expect(pushMock).toHaveBeenCalledWith("?range=7d");
  });
});
