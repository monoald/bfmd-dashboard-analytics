import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeToggle } from "./ThemeToggle";

afterEach(() => {
  document.documentElement.classList.remove("dark");
  localStorage.clear();
});

describe("ThemeToggle", () => {
  it("reflects light mode (no 'dark' class) and switches to dark on click", () => {
    render(<ThemeToggle />);

    const button = screen.getByRole("button", { name: "Switch to dark mode" });

    fireEvent.click(button);

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("analytics-theme")).toBe("dark");
    expect(
      screen.getByRole("button", { name: "Switch to light mode" }),
    ).toBeInTheDocument();
  });

  it("reflects dark mode when <html> already has the 'dark' class on mount", () => {
    document.documentElement.classList.add("dark");

    render(<ThemeToggle />);

    const button = screen.getByRole("button", { name: "Switch to light mode" });

    fireEvent.click(button);

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("analytics-theme")).toBe("light");
  });
});
