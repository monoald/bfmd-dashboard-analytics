"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyCredentials } from "./credentials";
import {
  createSessionCookieValue,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
} from "./session";
import { resolveSafeNextPath } from "./safe-redirect";

export async function login(
  _prevState: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = resolveSafeNextPath(formData.get("next"));

  const account = verifyCredentials(username, password);
  if (!account) {
    return { error: "Invalid username or password" };
  }

  const cookieStore = await cookies();
  cookieStore.set(
    SESSION_COOKIE_NAME,
    createSessionCookieValue(account.role),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_DURATION_SECONDS,
    },
  );

  redirect(next);
}
