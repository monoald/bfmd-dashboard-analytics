import { describe, expect, it } from "vitest";
import { sign } from "./token";
import { verifyMagicLinkToken } from "./magic-link";

const SECRET = "wp-shared-secret";

describe("verifyMagicLinkToken", () => {
  it("accepts a token that has not expired yet", () => {
    const nowSeconds = 1_700_000_000;
    const token = sign(String(nowSeconds + 300), SECRET);
    expect(verifyMagicLinkToken(token, SECRET, nowSeconds)).toBe(true);
  });

  it("rejects a token at exactly its expiry (no grace period)", () => {
    const nowSeconds = 1_700_000_000;
    const token = sign(String(nowSeconds), SECRET);
    expect(verifyMagicLinkToken(token, SECRET, nowSeconds)).toBe(false);
  });

  it("rejects an expired token", () => {
    const nowSeconds = 1_700_000_000;
    const token = sign(String(nowSeconds - 1), SECRET);
    expect(verifyMagicLinkToken(token, SECRET, nowSeconds)).toBe(false);
  });

  it("rejects a token signed with the wrong secret", () => {
    const nowSeconds = 1_700_000_000;
    const token = sign(String(nowSeconds + 300), SECRET);
    expect(verifyMagicLinkToken(token, "wrong-secret", nowSeconds)).toBe(
      false,
    );
  });

  it("rejects a non-numeric payload", () => {
    const token = sign("not-a-timestamp", SECRET);
    expect(verifyMagicLinkToken(token, SECRET, 1_700_000_000)).toBe(false);
  });

  it("rejects a malformed token", () => {
    expect(verifyMagicLinkToken("garbage", SECRET, 1_700_000_000)).toBe(
      false,
    );
  });
});
