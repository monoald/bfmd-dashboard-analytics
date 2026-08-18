import { describe, expect, it } from "vitest";
import { resolveSafeNextPath } from "./safe-redirect";

describe("resolveSafeNextPath", () => {
  it("accepts a same-origin relative path", () => {
    expect(resolveSafeNextPath("/reports/gross-sales")).toBe(
      "/reports/gross-sales",
    );
  });

  it("accepts a relative path with a query string", () => {
    expect(resolveSafeNextPath("/live?range=7d")).toBe("/live?range=7d");
  });

  it("falls back to / for undefined", () => {
    expect(resolveSafeNextPath(undefined)).toBe("/");
  });

  it("falls back to / for an empty string", () => {
    expect(resolveSafeNextPath("")).toBe("/");
  });

  it("falls back to / for a protocol-relative URL (open-redirect attempt)", () => {
    expect(resolveSafeNextPath("//evil.example.com")).toBe("/");
  });

  it("falls back to / for an absolute URL", () => {
    expect(resolveSafeNextPath("https://evil.example.com")).toBe("/");
  });

  it("falls back to / for a non-string value", () => {
    expect(resolveSafeNextPath(42)).toBe("/");
  });
});
