import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { secondMeRequest } from "@/lib/secondme";

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
  if (!user?.id) {
    return NextResponse.json({ code: 404, message: "用户不存在" }, { status: 404 });
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
    data: { sessionId: session, role: "user", content: message },
  });

  const upstream = await secondMeRequest("/api/secondme/chat/stream", {
    method: "POST",
    accessToken,
    body: JSON.stringify({ message, session_id: session }),
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      {
        code: upstream.status || 502,
        message: "上游聊天服务暂不可用",
      },
      { status: 502 },
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();

  let assistantText = "";
  let sessionId = session;
  let lineBuffer = "";

  const emit = (event: string, payload: unknown) =>
    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(emit("session", { sessionId }));

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          lineBuffer += decoder.decode(value, { stream: true });
          const lines = lineBuffer.split(/\r?\n/);
          lineBuffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;

            const raw = trimmed.slice(5).trim();
            if (!raw || raw === "[DONE]") continue;

            try {
              const payload = JSON.parse(raw) as {
                sessionId?: string;
                data?: { sessionId?: string; reply?: string };
                choices?: Array<{ delta?: { content?: string } }>;
                content?: string;
                reply?: string;
              };

              const maybeSessionId =
                payload.sessionId ?? payload.data?.sessionId ?? sessionId;
              if (maybeSessionId !== sessionId) {
                sessionId = maybeSessionId;
                controller.enqueue(emit("session", { sessionId }));
              }

              const delta =
                payload.choices?.[0]?.delta?.content ??
                payload.data?.reply ??
                payload.reply ??
                payload.content ??
                "";

              if (!delta) continue;
              assistantText += delta;
              controller.enqueue(emit("delta", { text: delta }));
            } catch {
              // Ignore malformed chunks.
            }
          }
        }

        if (!assistantText) {
          assistantText = "未收到上游流式回复。";
          controller.enqueue(emit("delta", { text: assistantText }));
        }

        await prisma.chatMessage.create({
          data: { sessionId, role: "assistant", content: assistantText },
        });

        controller.enqueue(emit("done", { sessionId }));
      } catch (error) {
        controller.enqueue(
          emit("error", {
            message:
              error instanceof Error ? error.message : "聊天流中断，请稍后重试。",
          }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

