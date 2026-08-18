import { NextRequest, NextResponse } from "next/server";
import { verifyMagicLinkToken } from "@/lib/auth/magic-link";
import {
  createSessionCookieValue,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
} from "@/lib/auth/session";

export function GET(request: NextRequest): NextResponse {
  const token = request.nextUrl.searchParams.get("token");
  const secret = process.env.WP_MAGIC_LINK_SECRET;
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (!token || !secret || !verifyMagicLinkToken(token, secret, nowSeconds)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set(SESSION_COOKIE_NAME, createSessionCookieValue("viewer"), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
  return response;
}
