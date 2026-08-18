import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";
import {
  createSessionCookieValue,
  SESSION_COOKIE_NAME,
  verifySessionCookieValue,
} from "@/lib/auth/session";
import { verify } from "@/lib/auth/token";

function requestTo(path: string, cookieValue?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookieValue) headers.cookie = `${SESSION_COOKIE_NAME}=${cookieValue}`;
  return new NextRequest(`http://localhost${path}`, { headers });
}

describe("proxy", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "proxy-test-secret";
  });

  afterEach(() => {
    delete process.env.SESSION_SECRET;
  });

  it("redirects an unauthenticated request to /login with the original path and query as next", () => {
    const response = proxy(requestTo("/reports/gross-sales?range=7d"));

    expect(response.headers.get("location")).not.toBeNull();
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe(
      "/reports/gross-sales?range=7d",
    );
  });

  it("redirects an authenticated request to /login back to /", () => {
    const cookieValue = createSessionCookieValue("admin");
    const response = proxy(requestTo("/login", cookieValue));

    expect(response.headers.get("location")).toBe("http://localhost/");
  });

  it("passes an unauthenticated request to /login through unchanged", () => {
    const response = proxy(requestTo("/login"));

    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
  });

  it("passes an authenticated request through and refreshes the session cookie with a later expiry", () => {
    const oldCookieValue = createSessionCookieValue(
      "viewer",
      Date.now() - 29 * 24 * 60 * 60 * 1000,
    );
    const response = proxy(requestTo("/", oldCookieValue));

    expect(response.headers.get("location")).toBeNull();
    const refreshed = response.cookies.get(SESSION_COOKIE_NAME);
    expect(refreshed).toBeDefined();
    expect(verifySessionCookieValue(refreshed!.value)).toEqual({
      role: "viewer",
    });
    expect(refreshed!.value).not.toBe(oldCookieValue);

    const oldPayload = verify(oldCookieValue, process.env.SESSION_SECRET!);
    const newPayload = verify(refreshed!.value, process.env.SESSION_SECRET!);
    const oldExpiry = Number(oldPayload!.split(":")[1]);
    const newExpiry = Number(newPayload!.split(":")[1]);
    expect(newExpiry).toBeGreaterThan(oldExpiry);
  });
});
