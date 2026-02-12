import { MentionTaskStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { ForumClient } from "@/lib/forum/client";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

function parseTaskResult(result: string | null) {
  if (!result) return null;
  try {
    return JSON.parse(result) as unknown;
  } catch {
    return { raw: result };
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const { userId } = getSessionFromRequest(request);
  if (!userId) {
    return NextResponse.json({ code: 401, message: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const task = await prisma.forumPublishTask.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      status: true,
      attempts: true,
      threadId: true,
      commentId: true,
      content: true,
    },
  });

  if (!task || task.userId !== userId) {
    return NextResponse.json({ code: 404, message: "任务不存在" }, { status: 404 });
  }

  if (task.status !== MentionTaskStatus.failed) {
    return NextResponse.json({ code: 400, message: "仅失败任务支持重试" }, { status: 400 });
  }

  const attempt = task.attempts + 1;

  try {
    const forumClient = new ForumClient();
    const upstream = await forumClient.reply({
      threadId: task.threadId,
      commentId: task.commentId,
      content: task.content,
    });

    const done = await prisma.forumPublishTask.update({
      where: { id },
      data: {
        status: MentionTaskStatus.done,
        attempts: attempt,
        result: JSON.stringify({ upstream }),
      },
      select: {
        id: true,
        status: true,
        attempts: true,
        result: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      code: 0,
      data: {
        ...done,
        result: parseTaskResult(done.result),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "论坛提交失败";

    const failed = await prisma.forumPublishTask.update({
      where: { id },
      data: {
        status: MentionTaskStatus.failed,
        attempts: attempt,
        nextRunAt: new Date(),
        result: JSON.stringify({ error: message }),
      },
      select: {
        id: true,
        status: true,
        attempts: true,
        result: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(
      {
        code: 502,
        message,
        data: {
          ...failed,
          result: parseTaskResult(failed.result),
        },
      },
      { status: 502 },
    );
  }
}

