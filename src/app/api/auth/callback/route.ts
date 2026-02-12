import { NextResponse } from "next/server";
import {
  clearOauthStateCookie,
  readOauthStateFromRequest,
  setAuthCookies,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readJsonSafe } from "@/lib/secondme";

type TokenPayload = {
  access_token?: string;
  accessToken?: string;
  refresh_token?: string;
  refreshToken?: string;
  expires_in?: number;
  expiresIn?: number;
  user_id?: string;
  userId?: string;
  token?: {
    access_token?: string;
    accessToken?: string;
    refresh_token?: string;
    refreshToken?: string;
    expires_in?: number;
    expiresIn?: number;
    user_id?: string;
    userId?: string;
  };
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const incomingState = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL("/?error=oauth_denied", request.url));
  }
  if (!code) {
    return NextResponse.redirect(new URL("/?error=missing_code", request.url));
  }

  const savedState = readOauthStateFromRequest(request);
  if (!savedState || savedState !== incomingState) {
    console.warn("OAuth state 校验失败，可能来自 WebView 场景");
  }

  const tokenEndpoint = process.env.SECONDME_TOKEN_ENDPOINT?.trim();
  const clientId = process.env.SECONDME_CLIENT_ID?.trim();
  const clientSecret = process.env.SECONDME_CLIENT_SECRET?.trim();
  const redirectUri = process.env.SECONDME_REDIRECT_URI?.trim();

  if (!tokenEndpoint || !clientId || !clientSecret || !redirectUri) {
    return NextResponse.redirect(new URL("/?error=missing_env", request.url));
  }

  const tokenResponse = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
    cache: "no-store",
  });

  const tokenJson = await readJsonSafe(tokenResponse);
  const rawData =
    tokenJson && typeof tokenJson === "object" && "data" in tokenJson
      ? (tokenJson as { data?: TokenPayload }).data
      : (tokenJson as TokenPayload | null);

  const tokenBag = rawData?.token ?? rawData;
  const accessToken = tokenBag?.access_token ?? tokenBag?.accessToken;
  const refreshToken = tokenBag?.refresh_token ?? tokenBag?.refreshToken ?? "";
  const userId = tokenBag?.user_id ?? tokenBag?.userId ?? "local-user";
  const expiresIn = tokenBag?.expires_in ?? tokenBag?.expiresIn ?? 7200;

  if (!accessToken) {
    const reason =
      tokenJson &&
      typeof tokenJson === "object" &&
      "message" in tokenJson &&
      typeof (tokenJson as { message?: unknown }).message === "string"
        ? (tokenJson as { message: string }).message
        : `token_endpoint_status_${tokenResponse.status}`;
    console.error("OAuth token exchange failed", {
      status: tokenResponse.status,
      response: tokenJson,
    });
    return NextResponse.redirect(
      new URL(`/?error=token_failed&reason=${encodeURIComponent(reason)}`, request.url),
    );
  }

  await prisma.user.upsert({
    where: { secondmeUserId: userId },
    create: {
      secondmeUserId: userId,
      accessToken,
      refreshToken,
      tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
    },
    update: {
      accessToken,
      refreshToken,
      tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
    },
  });

  const response = NextResponse.redirect(new URL("/", request.url));
  setAuthCookies(response, { userId, accessToken });
  clearOauthStateCookie(response);
  return response;
}
