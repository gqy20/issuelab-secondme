import { MentionTaskStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

function parseTaskResult(result: string | null) {
  if (!result) return null;
  try {
    return JSON.parse(result) as unknown;
  } catch {
    return { raw: result };
  }
}

function asStatus(value: string | null) {
  if (!value) return null;
  if (value === MentionTaskStatus.pending) return MentionTaskStatus.pending;
  if (value === MentionTaskStatus.running) return MentionTaskStatus.running;
  if (value === MentionTaskStatus.done) return MentionTaskStatus.done;
  if (value === MentionTaskStatus.failed) return MentionTaskStatus.failed;
  return null;
}

export async function GET(request: Request) {
  const { userId } = getSessionFromRequest(request);
  if (!userId) {
    return NextResponse.json({ code: 401, message: "未登录" }, { status: 401 });
  }

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSizeRaw = Number(url.searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSizeRaw));
  const q = (url.searchParams.get("q") ?? "").trim();
  const status = asStatus(url.searchParams.get("status"));

  const where = {
    userId,
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { threadId: { contains: q, mode: "insensitive" as const } },
            { commentId: { contains: q, mode: "insensitive" as const } },
            { content: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.forumPublishTask.count({ where }),
    prisma.forumPublishTask.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        status: true,
        threadId: true,
        commentId: true,
        content: true,
        attempts: true,
        nextRunAt: true,
        result: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  return NextResponse.json({
    code: 0,
    data: {
      page,
      pageSize,
      total,
      items: rows.map((row) => ({
        ...row,
        result: parseTaskResult(row.result),
      })),
    },
  });
}

