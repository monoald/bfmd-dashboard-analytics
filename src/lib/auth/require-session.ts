import { cookies } from "next/headers";
import type { Role } from "./credentials";
import { SESSION_COOKIE_NAME, verifySessionCookieValue } from "./session";

export async function requireSession(): Promise<{ role: Role }> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = cookieValue ? verifySessionCookieValue(cookieValue) : null;

  if (!session) {
    throw new Error("Not authenticated");
  }

  return session;
}
