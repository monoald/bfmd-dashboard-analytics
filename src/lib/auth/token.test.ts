import { describe, expect, it } from "vitest";
import { sign, verify } from "./token";

describe("sign/verify", () => {
  it("round-trips a signed value", () => {
    const token = sign("viewer:123456", "secret-a");
    expect(verify(token, "secret-a")).toBe("viewer:123456");
  });

  it("rejects a token signed with a different secret", () => {
    const token = sign("viewer:123456", "secret-a");
    expect(verify(token, "secret-b")).toBeNull();
  });

  it("rejects a tampered value with an untouched signature", () => {
    const token = sign("viewer:123456", "secret-a");
    const [, signature] = token.split(".");
    const tampered = `admin:123456.${signature}`;
    expect(verify(tampered, "secret-a")).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const token = sign("viewer:123456", "secret-a");
    const [value, signature] = token.split(".");
    const flippedChar = signature[0] === "0" ? "1" : "0";
    const tampered = `${value}.${flippedChar}${signature.slice(1)}`;
    expect(verify(tampered, "secret-a")).toBeNull();
  });

  it("rejects a malformed token with no separator", () => {
    expect(verify("not-a-valid-token", "secret-a")).toBeNull();
  });

  it("rejects a token with a non-hex signature", () => {
    expect(verify("viewer:123456.not-hex!!", "secret-a")).toBeNull();
  });
});
