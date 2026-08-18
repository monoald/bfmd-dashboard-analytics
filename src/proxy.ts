// src/proxy.ts
import { NextRequest, NextResponse } from "next/server";
import {
  createSessionCookieValue,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
  verifySessionCookieValue,
} from "@/lib/auth/session";

const LOGIN_PATH = "/login";

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  };
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = cookieValue ? verifySessionCookieValue(cookieValue) : null;

  if (pathname === LOGIN_PATH) {
    if (session) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (!session) {
    const loginUrl = new URL(LOGIN_PATH, request.url);
    loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.next();
  response.cookies.set(
    SESSION_COOKIE_NAME,
    createSessionCookieValue(session.role),
    sessionCookieOptions(),
  );
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
