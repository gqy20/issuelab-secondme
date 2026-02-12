import { NextResponse } from "next/server";
import { MentionTaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ForumClient } from "@/lib/forum/client";
import { assertCronAuth } from "@/lib/cron-auth";
import { generateForumReply } from "@/lib/orchestrator/generateForumReply";
import { buildFallbackForumReply, sanitizeForumErrorMessage } from "@/lib/forum/defaults";

export const runtime = "nodejs";

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 3;

function nextRetryAt(attempts: number) {
  const minutes = Math.min(2 ** attempts, 30);
  return new Date(Date.now() + minutes * 60 * 1000);
}

export async function GET(request: Request) {
  try {
    assertCronAuth(request);

    const now = new Date();
    const forumClient = new ForumClient();
    const tasks = await prisma.mentionTask.findMany({
      where: {
        status: { in: [MentionTaskStatus.pending, MentionTaskStatus.failed] },
        attempts: { lt: MAX_ATTEMPTS },
        nextRunAt: { lte: now },
      },
      orderBy: { createdAt: "asc" },
      take: BATCH_SIZE,
    });

    let processed = 0;
    let succeeded = 0;

    for (const task of tasks) {
      const lock = await prisma.mentionTask.updateMany({
        where: {
          id: task.id,
          status: { in: [MentionTaskStatus.pending, MentionTaskStatus.failed] },
          nextRunAt: { lte: now },
        },
        data: { status: MentionTaskStatus.running },
      });
      if (lock.count === 0) continue;

      processed += 1;
      try {
        const attempts = task.attempts + 1;
        let resultPayload: Record<string, unknown>;
        let replyText = "";

        try {
          const result = await generateForumReply(task.content);
          replyText = result.text;
          resultPayload = {
            text: result.text,
            synthesis: result.synthesis,
            evaluation: result.evaluation,
            fallback: false,
          };
        } catch (generationError) {
          replyText = buildFallbackForumReply();
          resultPayload = {
            text: replyText,
            fallback: true,
            generationError: sanitizeForumErrorMessage(generationError),
          };
        }

        await forumClient.reply({
          threadId: task.threadId,
          commentId: task.commentId,
          content: replyText,
        });

        await prisma.mentionTask.update({
          where: { id: task.id },
          data: {
            status: MentionTaskStatus.done,
            attempts,
            result: JSON.stringify(resultPayload),
          },
        });
        succeeded += 1;
      } catch (error) {
        const attempts = task.attempts + 1;
        await prisma.mentionTask.update({
          where: { id: task.id },
          data: {
            status: MentionTaskStatus.failed,
            attempts,
            nextRunAt: nextRetryAt(attempts),
            result: JSON.stringify({
              error: sanitizeForumErrorMessage(error),
            }),
          },
        });
      }
    }

    return NextResponse.json({
      code: 0,
      data: {
        fetched: tasks.length,
        processed,
        succeeded,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "forum-dispatch failed";
    const status = message === "Unauthorized cron request" ? 401 : 500;
    return NextResponse.json({ code: status, message }, { status });
  }
}
