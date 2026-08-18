import { sign, verify } from "./token";
import type { Role } from "./credentials";

export const SESSION_COOKIE_NAME = "bf_session";
export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30;

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET environment variable is not set");
  }
  return secret;
}

function isRole(value: string): value is Role {
  return value === "admin" || value === "viewer";
}

export function createSessionCookieValue(
  role: Role,
  now: number = Date.now(),
): string {
  const expiresAt = now + SESSION_DURATION_SECONDS * 1000;
  return sign(`${role}:${expiresAt}`, getSecret());
}

export function verifySessionCookieValue(
  value: string,
  now: number = Date.now(),
): { role: Role } | null {
  const payload = verify(value, getSecret());
  if (!payload) return null;

  const separatorIndex = payload.indexOf(":");
  if (separatorIndex === -1) return null;

  const role = payload.slice(0, separatorIndex);
  const expiresAt = Number(payload.slice(separatorIndex + 1));

  if (!isRole(role)) return null;
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;

  return { role };
}
