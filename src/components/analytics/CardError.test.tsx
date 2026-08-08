import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CardError } from "./CardError";

describe("CardError", () => {
  it("renders the card title and the error message", () => {
    render(<CardError title="Sessions over time" message="GA4 quota exceeded" />);

    expect(screen.getByText("Sessions over time")).toBeInTheDocument();
    expect(screen.getByText(/GA4 quota exceeded/)).toBeInTheDocument();
  });
});
