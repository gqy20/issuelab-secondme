import { MentionTaskStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { userId } = getSessionFromRequest(request);
  if (!userId) {
    return NextResponse.json({ code: 401, message: "未登录" }, { status: 401 });
  }

  const url = new URL(request.url);
  const range = (url.searchParams.get("range") ?? "24h").toLowerCase();
  const hours = range === "7d" ? 24 * 7 : 24;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const [total, pending, running, done, failed] = await Promise.all([
    prisma.mentionTask.count({ where: { createdAt: { gte: since } } }),
    prisma.mentionTask.count({ where: { createdAt: { gte: since }, status: MentionTaskStatus.pending } }),
    prisma.mentionTask.count({ where: { createdAt: { gte: since }, status: MentionTaskStatus.running } }),
    prisma.mentionTask.count({ where: { createdAt: { gte: since }, status: MentionTaskStatus.done } }),
    prisma.mentionTask.count({ where: { createdAt: { gte: since }, status: MentionTaskStatus.failed } }),
  ]);

  return NextResponse.json({
    code: 0,
    data: {
      range,
      since,
      total,
      pending,
      running,
      done,
      failed,
    },
  });
}
