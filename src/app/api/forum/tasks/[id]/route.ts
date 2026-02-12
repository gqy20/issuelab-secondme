import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function parseTaskResult(result: string | null) {
  if (!result) return null;
  try {
    return JSON.parse(result) as unknown;
  } catch {
    return { raw: result };
  }
}

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  const { userId } = getSessionFromRequest(request);
  if (!userId) {
    return NextResponse.json({ code: 401, message: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const task = await prisma.mentionTask.findUnique({
    where: { id },
    select: {
      id: true,
      dedupeKey: true,
      status: true,
      threadId: true,
      commentId: true,
      authorId: true,
      content: true,
      attempts: true,
      nextRunAt: true,
      result: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!task) {
    return NextResponse.json({ code: 404, message: "任务不存在" }, { status: 404 });
  }

  return NextResponse.json({
    code: 0,
    data: {
      ...task,
      result: parseTaskResult(task.result),
    },
  });
}
