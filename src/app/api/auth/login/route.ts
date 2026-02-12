import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { setOauthStateCookie } from "@/lib/auth";

export async function GET() {
  const oauthUrl = process.env.SECONDME_OAUTH_URL?.trim();
  const clientId = process.env.SECONDME_CLIENT_ID?.trim();
  const redirectUri = process.env.SECONDME_REDIRECT_URI?.trim();

  if (!oauthUrl || !clientId || !redirectUri) {
    return NextResponse.json(
      { code: 500, message: "缺少 OAuth 配置" },
      { status: 500 },
    );
  }

  const state = randomUUID();
  const url = new URL(oauthUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "user.info user.info.shades chat note.add");
  url.searchParams.set("state", state);

  const response = NextResponse.redirect(url.toString());
  setOauthStateCookie(response, state);
  return response;
}
