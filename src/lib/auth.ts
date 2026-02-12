import type { NextResponse } from "next/server";

export const AUTH_USER_COOKIE = "secondme_user_id";
export const AUTH_TOKEN_COOKIE = "secondme_access_token";
const AUTH_STATE_COOKIE = "secondme_oauth_state";

function readCookieFromHeader(cookieHeader: string | null, key: string) {
  if (!cookieHeader) return null;
  const chunk = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${key}=`));
  if (!chunk) return null;
  return decodeURIComponent(chunk.slice(key.length + 1));
}

export function getSessionFromRequest(request: Request) {
  const cookieHeader = request.headers.get("cookie");
  return {
    userId: readCookieFromHeader(cookieHeader, AUTH_USER_COOKIE),
    accessToken: readCookieFromHeader(cookieHeader, AUTH_TOKEN_COOKIE),
  };
}

export function readOauthStateFromRequest(request: Request) {
  const cookieHeader = request.headers.get("cookie");
  return readCookieFromHeader(cookieHeader, AUTH_STATE_COOKIE);
}

export function setAuthCookies(
  response: NextResponse,
  values: { userId: string; accessToken: string },
) {
  response.cookies.set(AUTH_USER_COOKIE, values.userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });
  response.cookies.set(AUTH_TOKEN_COOKIE, values.accessToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 2,
  });
}

export function setOauthStateCookie(response: NextResponse, state: string) {
  response.cookies.set(AUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 10,
  });
}

export function clearOauthStateCookie(response: NextResponse) {
  response.cookies.delete(AUTH_STATE_COOKIE);
}

export function clearAuthCookies(response: NextResponse) {
  response.cookies.delete(AUTH_USER_COOKIE);
  response.cookies.delete(AUTH_TOKEN_COOKIE);
}

