import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readJsonSafe, secondMeRequest } from "@/lib/secondme";

type NoteBody = { content?: string };

export async function POST(request: Request) {
  const { accessToken, userId } = getSessionFromRequest(request);
  if (!accessToken || !userId) {
    return NextResponse.json({ code: 401, message: "未登录" }, { status: 401 });
  }

  const body = (await request.json()) as NoteBody;
  const content = body.content?.trim();
  if (!content) {
    return NextResponse.json({ code: 400, message: "笔记不能为空" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { secondmeUserId: userId },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ code: 404, message: "用户不存在" }, { status: 404 });
  }
  if (!user.id) {
    return NextResponse.json({ code: 500, message: "用户数据异常" }, { status: 500 });
  }

  const upstream = await secondMeRequest("/api/secondme/note/add", {
    method: "POST",
    accessToken,
    body: JSON.stringify({ content }),
  });
  const payload = await readJsonSafe(upstream);

  await prisma.userNote.create({
    data: { userId: user.id, content },
  });

  if (!upstream.ok) {
    return NextResponse.json({
      code: 0,
      data: { saved: true, source: "local" },
      message: "上游笔记服务暂不可用，已本地保存",
    });
  }

  return NextResponse.json(payload ?? { code: 0, data: { saved: true } });
}
