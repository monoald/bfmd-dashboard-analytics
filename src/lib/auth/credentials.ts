import { timingSafeEqual } from "crypto";

export type Role = "admin" | "viewer";

interface Account {
  role: Role;
  username: string | undefined;
  password: string | undefined;
}

function getAccounts(): Account[] {
  return [
    {
      role: "admin",
      username: process.env.ADMIN_USERNAME,
      password: process.env.ADMIN_PASSWORD,
    },
    {
      role: "viewer",
      username: process.env.VIEWER_USERNAME,
      password: process.env.VIEWER_PASSWORD,
    },
  ];
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return timingSafeEqual(aBuffer, bBuffer);
}

export function verifyCredentials(
  username: string,
  password: string,
): { role: Role } | null {
  for (const account of getAccounts()) {
    if (!account.username || !account.password) continue;
    if (
      safeEqual(username, account.username) &&
      safeEqual(password, account.password)
    ) {
      return { role: account.role };
    }
  }
  return null;
}
