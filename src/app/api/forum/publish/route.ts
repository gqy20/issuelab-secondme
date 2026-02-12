import { MentionTaskStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { ForumClient } from "@/lib/forum/client";
import { prisma } from "@/lib/prisma";

type PublishBody = {
  threadId?: unknown;
  commentId?: unknown;
  content?: unknown;
};

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseTaskResult(result: string | null) {
  if (!result) return null;
  try {
    return JSON.parse(result) as unknown;
  } catch {
    return { raw: result };
  }
}

export async function POST(request: Request) {
  const { userId } = getSessionFromRequest(request);
  if (!userId) {
    return NextResponse.json({ code: 401, message: "未登录" }, { status: 401 });
  }

  let body: PublishBody;
  try {
    body = (await request.json()) as PublishBody;
  } catch {
    return NextResponse.json({ code: 400, message: "请求体格式错误" }, { status: 400 });
  }

  const threadId = asTrimmedString(body.threadId);
  const commentId = asTrimmedString(body.commentId);
  const content = asTrimmedString(body.content);

  if (!threadId || !commentId || !content) {
    return NextResponse.json(
      { code: 400, message: "threadId/commentId/content 不能为空" },
      { status: 400 },
    );
  }

  if (content.length > 4000) {
    return NextResponse.json({ code: 400, message: "content 不能超过 4000 字" }, { status: 400 });
  }

  const task = await prisma.forumPublishTask.create({
    data: {
      userId,
      threadId,
      commentId,
      content,
      status: MentionTaskStatus.pending,
    },
    select: { id: true },
  });

  try {
    const forumClient = new ForumClient();
    const upstream = await forumClient.reply({ threadId, commentId, content });

    const done = await prisma.forumPublishTask.update({
      where: { id: task.id },
      data: {
        status: MentionTaskStatus.done,
        attempts: 1,
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
      where: { id: task.id },
      data: {
        status: MentionTaskStatus.failed,
        attempts: 1,
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

