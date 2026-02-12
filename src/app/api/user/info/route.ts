import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { secondMeRequest, readJsonSafe } from "@/lib/secondme";

export async function GET(request: Request) {
  const { accessToken, userId } = getSessionFromRequest(request);
  if (!accessToken || !userId) {
    return NextResponse.json({ code: 401, message: "未登录" }, { status: 401 });
  }

  const upstream = await secondMeRequest("/api/secondme/user/info", {
    method: "GET",
    accessToken,
  });
  const payload = await readJsonSafe(upstream);
  if (!upstream.ok) {
    return NextResponse.json(payload ?? { code: upstream.status }, {
      status: upstream.status,
    });
  }
  return NextResponse.json(payload ?? { code: 0, data: {} });
}

