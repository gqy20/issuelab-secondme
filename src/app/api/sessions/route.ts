import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { userId } = getSessionFromRequest(request);
  if (!userId) {
    return NextResponse.json({ code: 401, message: "未登录" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { secondmeUserId: userId },
    select: {
      id: true,
      chatSessions: {
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          updatedAt: true,
        },
      },
    },
  });

  return NextResponse.json({
    code: 0,
    data: { sessions: user?.chatSessions ?? [] },
  });
}

