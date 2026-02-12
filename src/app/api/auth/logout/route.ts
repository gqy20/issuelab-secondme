import { NextResponse } from "next/server";
import { clearAuthCookies } from "@/lib/auth";

export async function POST(request: Request) {
  const response = NextResponse.json({ code: 0, data: { ok: true } });
  clearAuthCookies(response);
  return response;
}

