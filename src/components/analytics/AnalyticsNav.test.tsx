import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

let mockPathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

import { AnalyticsNav } from "./AnalyticsNav";

describe("AnalyticsNav", () => {
  it("highlights 'Dashboard' as active when on /", () => {
    mockPathname = "/";
    render(<AnalyticsNav />);

    const dashboardLink = screen.getByText("Dashboard");
    const liveViewLink = screen.getByText("Live View");

    expect(dashboardLink).toHaveClass("bg-(--analytics-accent-dim)");
    expect(liveViewLink).not.toHaveClass("bg-(--analytics-accent-dim)");
  });

  it("highlights 'Live View' as active when on /live", () => {
    mockPathname = "/live";
    render(<AnalyticsNav />);

    const dashboardLink = screen.getByText("Dashboard");
    const liveViewLink = screen.getByText("Live View");

    expect(liveViewLink).toHaveClass("bg-(--analytics-accent-dim)");
    expect(dashboardLink).not.toHaveClass("bg-(--analytics-accent-dim)");
  });

  it("renders both links pointing to their correct routes", () => {
    mockPathname = "/";
    render(<AnalyticsNav />);

    expect(screen.getByText("Dashboard")).toHaveAttribute("href", "/");
    expect(screen.getByText("Live View")).toHaveAttribute("href", "/live");
  });
});
