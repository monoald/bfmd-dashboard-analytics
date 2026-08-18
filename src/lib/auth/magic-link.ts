import { verify } from "./token";

export function verifyMagicLinkToken(
  token: string,
  secret: string,
  nowSeconds: number,
): boolean {
  const value = verify(token, secret);
  if (!value) return false;

  const expiresAt = Number(value);
  if (!Number.isFinite(expiresAt)) return false;

  return expiresAt > nowSeconds;
}
