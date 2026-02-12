import { MentionTaskStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const { userId } = getSessionFromRequest(request);
  if (!userId) {
    return NextResponse.json({ code: 401, message: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const task = await prisma.mentionTask.findUnique({
    where: { id },
    select: { id: true, status: true },
  });

  if (!task) {
    return NextResponse.json({ code: 404, message: "任务不存在" }, { status: 404 });
  }

  if (task.status !== MentionTaskStatus.failed) {
    return NextResponse.json({ code: 400, message: "仅失败任务支持重试" }, { status: 400 });
  }

  await prisma.mentionTask.update({
    where: { id },
    data: {
      status: MentionTaskStatus.pending,
      nextRunAt: new Date(),
      result: null,
    },
  });

  return NextResponse.json({ code: 0, data: { retried: true } });
}
