import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyCredentials } from "./credentials";

describe("verifyCredentials", () => {
  beforeEach(() => {
    process.env.ADMIN_USERNAME = "admin-user";
    process.env.ADMIN_PASSWORD = "admin-pass";
    process.env.VIEWER_USERNAME = "viewer-user";
    process.env.VIEWER_PASSWORD = "viewer-pass";
  });

  afterEach(() => {
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.VIEWER_USERNAME;
    delete process.env.VIEWER_PASSWORD;
  });

  it("accepts the admin account", () => {
    expect(verifyCredentials("admin-user", "admin-pass")).toEqual({
      role: "admin",
    });
  });

  it("accepts the viewer account", () => {
    expect(verifyCredentials("viewer-user", "viewer-pass")).toEqual({
      role: "viewer",
    });
  });

  it("rejects a wrong password", () => {
    expect(verifyCredentials("admin-user", "wrong")).toBeNull();
  });

  it("rejects a wrong username", () => {
    expect(verifyCredentials("wrong-user", "admin-pass")).toBeNull();
  });

  it("rejects swapped credentials (admin username with viewer password)", () => {
    expect(verifyCredentials("admin-user", "viewer-pass")).toBeNull();
  });

  it("rejects when the matching env var is unset", () => {
    delete process.env.ADMIN_USERNAME;
    expect(verifyCredentials("admin-user", "admin-pass")).toBeNull();
  });
});
