import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ForumClient } from "@/lib/forum/client";
import { assertCronAuth } from "@/lib/cron-auth";
import { isLowValueForumContent } from "@/lib/forum/defaults";

export const runtime = "nodejs";

const DEFAULT_CURSOR_ID = "default";

function mentionMatched(content: string, mentionTarget: string) {
  const normalizedContent = content.toLowerCase();
  const normalizedTarget = mentionTarget.toLowerCase();
  return normalizedContent.includes(normalizedTarget);
}

export async function GET(request: Request) {
  try {
    assertCronAuth(request);

    const mentionTarget = process.env.FORUM_MENTION_TARGET?.trim() || "@secondme";
    const cursor = await prisma.forumCursor.upsert({
      where: { id: DEFAULT_CURSOR_ID },
      create: { id: DEFAULT_CURSOR_ID },
      update: {},
      select: { id: true, lastSeenAt: true },
    });

    const forumClient = new ForumClient();
    const comments = await forumClient.listMentions(cursor.lastSeenAt.toISOString(), mentionTarget);

    let enqueued = 0;
    let skippedLowValue = 0;
    let newestSeenAt = cursor.lastSeenAt;

    for (const comment of comments) {
      if (!mentionMatched(comment.content, mentionTarget)) continue;
      if (isLowValueForumContent(comment.content, mentionTarget)) {
        skippedLowValue += 1;
        continue;
      }
      const dedupeKey = `${comment.threadId}:${comment.id}:${mentionTarget}`;

      await prisma.mentionTask.upsert({
        where: { dedupeKey },
        create: {
          dedupeKey,
          threadId: comment.threadId,
          commentId: comment.id,
          authorId: comment.authorId,
          content: comment.content,
          status: "pending",
        },
        update: {},
      });
      enqueued += 1;

      if (comment.createdAt) {
        const dt = new Date(comment.createdAt);
        if (!Number.isNaN(dt.getTime()) && dt > newestSeenAt) {
          newestSeenAt = dt;
        }
      }
    }

    if (newestSeenAt > cursor.lastSeenAt) {
      await prisma.forumCursor.update({
        where: { id: DEFAULT_CURSOR_ID },
        data: { lastSeenAt: newestSeenAt },
      });
    }

    return NextResponse.json({
      code: 0,
      data: {
        cursor: newestSeenAt.toISOString(),
        fetched: comments.length,
        enqueued,
        skippedLowValue,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "forum-poll failed";
    const status = message === "Unauthorized cron request" ? 401 : 500;
    return NextResponse.json({ code: status, message }, { status });
  }
}
