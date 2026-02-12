import { NextResponse } from "next/server";
import { clearAuthCookies } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ code: 0, data: { ok: true } });
  clearAuthCookies(response);
  return response;
}
