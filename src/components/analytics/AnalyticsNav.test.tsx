import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

let mockPathname = "/admin/analytics";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

import { AnalyticsNav } from "./AnalyticsNav";

describe("AnalyticsNav", () => {
  it("highlights 'Dashboard' as active when on /admin/analytics", () => {
    mockPathname = "/admin/analytics";
    render(<AnalyticsNav />);

    const dashboardLink = screen.getByText("Dashboard");
    const liveViewLink = screen.getByText("Live View");

    expect(dashboardLink).toHaveClass("bg-(--analytics-accent-dim)");
    expect(liveViewLink).not.toHaveClass("bg-(--analytics-accent-dim)");
  });

  it("highlights 'Live View' as active when on /admin/analytics/live", () => {
    mockPathname = "/admin/analytics/live";
    render(<AnalyticsNav />);

    const dashboardLink = screen.getByText("Dashboard");
    const liveViewLink = screen.getByText("Live View");

    expect(liveViewLink).toHaveClass("bg-(--analytics-accent-dim)");
    expect(dashboardLink).not.toHaveClass("bg-(--analytics-accent-dim)");
  });

  it("renders both links pointing to their correct routes", () => {
    mockPathname = "/admin/analytics";
    render(<AnalyticsNav />);

    expect(screen.getByText("Dashboard")).toHaveAttribute(
      "href",
      "/admin/analytics",
    );
    expect(screen.getByText("Live View")).toHaveAttribute(
      "href",
      "/admin/analytics/live",
    );
  });
});
