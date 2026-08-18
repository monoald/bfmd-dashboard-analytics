import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createSessionCookieValue,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
  verifySessionCookieValue,
} from "./session";

describe("session cookie", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "test-session-secret";
  });

  afterEach(() => {
    delete process.env.SESSION_SECRET;
  });

  it("exposes the expected cookie name and duration", () => {
    expect(SESSION_COOKIE_NAME).toBe("bf_session");
    expect(SESSION_DURATION_SECONDS).toBe(60 * 60 * 24 * 30);
  });

  it("round-trips a valid admin session", () => {
    const now = 1_000_000_000_000;
    const value = createSessionCookieValue("admin", now);
    expect(verifySessionCookieValue(value, now)).toEqual({ role: "admin" });
  });

  it("round-trips a valid viewer session", () => {
    const now = 1_000_000_000_000;
    const value = createSessionCookieValue("viewer", now);
    expect(verifySessionCookieValue(value, now)).toEqual({ role: "viewer" });
  });

  it("rejects a session read after its 30-day expiry", () => {
    const now = 1_000_000_000_000;
    const value = createSessionCookieValue("admin", now);
    const thirtyOneDaysLater = now + 31 * 24 * 60 * 60 * 1000;
    expect(verifySessionCookieValue(value, thirtyOneDaysLater)).toBeNull();
  });

  it("accepts a session just before its expiry", () => {
    const now = 1_000_000_000_000;
    const value = createSessionCookieValue("admin", now);
    const justBeforeExpiry = now + 30 * 24 * 60 * 60 * 1000 - 1000;
    expect(verifySessionCookieValue(value, justBeforeExpiry)).toEqual({
      role: "admin",
    });
  });

  it("rejects a tampered cookie value", () => {
    const now = 1_000_000_000_000;
    const value = createSessionCookieValue("viewer", now);
    const tampered = value.replace("viewer", "admin!");
    expect(verifySessionCookieValue(tampered, now)).toBeNull();
  });

  it("rejects a cookie signed with a different secret", () => {
    const now = 1_000_000_000_000;
    const value = createSessionCookieValue("admin", now);
    process.env.SESSION_SECRET = "a-different-secret";
    expect(verifySessionCookieValue(value, now)).toBeNull();
  });

  it("rejects garbage input", () => {
    expect(verifySessionCookieValue("not-a-session", 1_000_000_000_000)).toBeNull();
  });
});
