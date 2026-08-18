import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { sign } from "@/lib/auth/token";
import { verifySessionCookieValue, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { GET } from "./route";

const SECRET = "wp-shared-secret";

function requestWithToken(token: string | null): NextRequest {
  const url = token
    ? `http://localhost/api/auth/magic-link?token=${encodeURIComponent(token)}`
    : "http://localhost/api/auth/magic-link";
  return new NextRequest(url);
}

describe("GET /api/auth/magic-link", () => {
  beforeEach(() => {
    process.env.WP_MAGIC_LINK_SECRET = SECRET;
    process.env.SESSION_SECRET = "session-secret";
  });

  afterEach(() => {
    delete process.env.WP_MAGIC_LINK_SECRET;
    delete process.env.SESSION_SECRET;
  });

  it("mints a viewer session and redirects to / for a valid token", () => {
    const token = sign(String(Math.floor(Date.now() / 1000) + 300), SECRET);
    const response = GET(requestWithToken(token));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/");

    const cookie = response.cookies.get(SESSION_COOKIE_NAME);
    expect(cookie).toBeDefined();
    expect(verifySessionCookieValue(cookie!.value)).toEqual({
      role: "viewer",
    });
  });

  it("redirects to /login without setting a cookie for an expired token", () => {
    const token = sign(String(Math.floor(Date.now() / 1000) - 10), SECRET);
    const response = GET(requestWithToken(token));

    expect(response.headers.get("location")).toBe("http://localhost/login");
    expect(response.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it("redirects to /login for a tampered token", () => {
    const token = sign(String(Math.floor(Date.now() / 1000) + 300), SECRET);
    const tampered = token.slice(0, -1) + (token.endsWith("0") ? "1" : "0");
    const response = GET(requestWithToken(tampered));

    expect(response.headers.get("location")).toBe("http://localhost/login");
    expect(response.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it("redirects to /login when the token query param is missing", () => {
    const response = GET(requestWithToken(null));

    expect(response.headers.get("location")).toBe("http://localhost/login");
    expect(response.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it("redirects to /login when WP_MAGIC_LINK_SECRET is not configured", () => {
    delete process.env.WP_MAGIC_LINK_SECRET;
    const token = sign(String(Math.floor(Date.now() / 1000) + 300), "any-secret");
    const response = GET(requestWithToken(token));

    expect(response.headers.get("location")).toBe("http://localhost/login");
  });
});
