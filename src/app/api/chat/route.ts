import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readJsonSafe, secondMeRequest } from "@/lib/secondme";

type ChatBody = {
  message?: string;
  sessionId?: string;
};

export async function POST(request: Request) {
  const { accessToken, userId } = getSessionFromRequest(request);
  if (!accessToken || !userId) {
    return NextResponse.json({ code: 401, message: "未登录" }, { status: 401 });
  }

  const body = (await request.json()) as ChatBody;
  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ code: 400, message: "消息不能为空" }, { status: 400 });
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

  const session =
    body.sessionId ??
    (
      await prisma.chatSession.create({
        data: { userId: user.id, title: message.slice(0, 24) },
        select: { id: true },
      })
    ).id;

  await prisma.chatMessage.create({
    data: {
      sessionId: session,
      role: "user",
      content: message,
    },
  });

  const upstream = await secondMeRequest("/api/secondme/chat", {
    method: "POST",
    accessToken,
    body: JSON.stringify({ message, session_id: session }),
  });
  const payload = await readJsonSafe(upstream);

  const assistantMessage =
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    (payload as { data?: { reply?: string } }).data?.reply
      ? (payload as { data: { reply: string } }).data.reply
      : "已收到消息，后续会接入真实流式回复。";

  await prisma.chatMessage.create({
    data: {
      sessionId: session,
      role: "assistant",
      content: assistantMessage,
    },
  });

  if (!upstream.ok) {
    return NextResponse.json(
      {
        code: upstream.status,
        message: "上游聊天服务暂不可用",
        data: { sessionId: session, reply: assistantMessage },
      },
      { status: 200 },
    );
  }

  return NextResponse.json(
    payload ?? { code: 0, data: { sessionId: session, reply: assistantMessage } },
  );
}
