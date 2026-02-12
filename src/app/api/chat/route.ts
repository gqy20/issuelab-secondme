import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { secondMeRequest } from "@/lib/secondme";
import {
  callCoach,
  callEvaluate,
  callSynthesize,
  type JsonRecord,
  type PathType,
} from "@/lib/system-agents/runtime";

export const runtime = "nodejs";

type ChatBody = {
  message?: string;
  sessionId?: string;
};

type StreamPayload = {
  sessionId?: string;
  data?: { sessionId?: string; reply?: string };
  choices?: Array<{ delta?: { content?: string } }>;
  content?: string;
  reply?: string;
};

function shouldRunSystemAgents() {
  return process.env.SYSTEM_AGENT_ENABLED?.trim() !== "false";
}

function stringifyJson(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
}

function getDebateRounds() {
  const raw = Number(process.env.SYSTEM_AGENT_DEBATE_ROUNDS ?? "10");
  if (!Number.isFinite(raw) || raw < 1) return 10;
  if (raw > 10) return 10;
  return Math.floor(raw);
}

async function requestSecondMeReply(params: {
  accessToken: string;
  message: string;
  sessionId?: string;
}): Promise<{ sessionId?: string; text: string }> {
  const upstream = await secondMeRequest("/api/secondme/chat/stream", {
    method: "POST",
    accessToken: params.accessToken,
    body: JSON.stringify({
      message: params.message,
      ...(params.sessionId ? { session_id: params.sessionId } : {}),
    }),
  });

  if (!upstream.ok || !upstream.body) {
    throw new Error(`SecondMe request failed: ${upstream.status}`);
  }

  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();
  let lineBuffer = "";
  let text = "";
  let sessionId = params.sessionId;

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
        const payload = JSON.parse(raw) as StreamPayload;
        sessionId = payload.sessionId ?? payload.data?.sessionId ?? sessionId;
        text +=
          payload.choices?.[0]?.delta?.content ??
          payload.data?.reply ??
          payload.reply ??
          payload.content ??
          "";
      } catch {
        // Ignore malformed chunks.
      }
    }
  }

  return { sessionId, text: text || "No reply from SecondMe." };
}

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
      { code: upstream.status || 502, message: "上游聊天服务暂不可用" },
      { status: 502 },
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();

  let assistantText = "";
  let sessionId = session;
  let lineBuffer = "";
  let systemAgentFailed = false;

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
              const payload = JSON.parse(raw) as StreamPayload;
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

        if (shouldRunSystemAgents()) {
          const paths: PathType[] = ["radical", "conservative", "cross_domain"];
          const reports: Partial<Record<PathType, JsonRecord>> = {};
          const pathRunIdMap: Partial<Record<PathType, string>> = {};
          const pathSessions: Partial<Record<PathType, string>> = {};
          const failedPaths = new Set<PathType>();
          let runId: string | null = null;

          controller.enqueue(emit("path_status", { status: "running" }));

          try {
            const task = await prisma.task.create({
              data: {
                userId: user.id,
                title: message.slice(0, 48),
                input: message,
              },
              select: { id: true },
            });

            const run = await prisma.run.create({
              data: {
                taskId: task.id,
                status: "running",
              },
              select: { id: true },
            });
            runId = run.id;

            await Promise.all(
              paths.map(async (path) => {
                const pathRun = await prisma.pathRun.create({
                  data: {
                    runId: run.id,
                    path,
                    status: "running",
                  },
                  select: { id: true },
                });
                pathRunIdMap[path] = pathRun.id;
              }),
            );
          } catch {
            // Persistence errors should not break the chat flow.
          }

          const debateRounds = getDebateRounds();
          for (const path of paths) {
            controller.enqueue(emit("path_status", { path, status: "running" }));
          }

          for (let round = 1; round <= debateRounds; round += 1) {
            controller.enqueue(emit("debate_status", { round, status: "running" }));

            for (const path of paths) {
              if (failedPaths.has(path)) continue;

              try {
                const coach = await callCoach(path, {
                  taskInput: message,
                  round,
                  context: `main_reply: ${assistantText}\nprevious: ${stringifyJson(reports[path])}`,
                });

                const secondmePrompt = [
                  `User task: ${message}`,
                  `Path: ${path}`,
                  `Round: ${round}`,
                  `Coach hypothesis: ${coach.hypothesis}`,
                  `Coach reason: ${coach.why}`,
                  "Reply with your stance, top risk, and one concrete next step.",
                ].join("\n");

                const secondme = await requestSecondMeReply({
                  accessToken,
                  message: secondmePrompt,
                  sessionId: pathSessions[path],
                });
                if (secondme.sessionId) {
                  pathSessions[path] = secondme.sessionId;
                }

                controller.enqueue(
                  emit("debate_round", {
                    path,
                    round,
                    coach,
                    secondme: secondme.text,
                  }),
                );

                reports[path] = {
                  ...coach,
                  secondme_reply: secondme.text,
                  round,
                };

                const pathRunId = pathRunIdMap[path];
                if (pathRunId) {
                  try {
                    await prisma.$transaction([
                      prisma.turn.create({
                        data: {
                          pathRunId,
                          round,
                          role: "coach",
                          content: coach.hypothesis,
                          jsonOutput: stringifyJson(coach),
                        },
                      }),
                      prisma.turn.create({
                        data: {
                          pathRunId,
                          round,
                          role: "secondme",
                          content: secondme.text,
                        },
                      }),
                    ]);
                  } catch {
                    // Ignore persistence failure.
                  }
                }
              } catch (error) {
                systemAgentFailed = true;
                failedPaths.add(path);
                controller.enqueue(
                  emit("debate_round", {
                    path,
                    round,
                    error:
                      error instanceof Error ? error.message : "系统博弈轮执行失败",
                  }),
                );
              }
            }

            controller.enqueue(emit("debate_status", { round, status: "done" }));
          }

          for (const path of paths) {
            const report = reports[path];
            const pathRunId = pathRunIdMap[path];
            if (!report) {
              controller.enqueue(emit("path_status", { path, status: "failed" }));
              if (pathRunId) {
                try {
                  await prisma.pathRun.update({
                    where: { id: pathRunId },
                    data: { status: "failed" },
                  });
                } catch {
                  // Ignore persistence failure.
                }
              }
              continue;
            }

            controller.enqueue(emit("path_report", { path, report }));
            controller.enqueue(emit("path_status", { path, status: "done" }));

            if (pathRunId) {
              try {
                await prisma.$transaction([
                  prisma.pathReport.upsert({
                    where: { pathRunId },
                    update: { content: stringifyJson(report) },
                    create: { pathRunId, content: stringifyJson(report) },
                  }),
                  prisma.pathRun.update({
                    where: { id: pathRunId },
                    data: { status: "done" },
                  }),
                ]);
              } catch {
                // Ignore persistence failure.
              }
            }
          }

          const radical = reports.radical;
          const conservative = reports.conservative;
          const crossDomain = reports.cross_domain;

          if (radical && conservative && crossDomain) {
            try {
              const synthesis = await callSynthesize({
                radical,
                conservative,
                cross_domain: crossDomain,
              });
              controller.enqueue(emit("synthesis", synthesis));

              const evaluation = await callEvaluate({
                radical,
                conservative,
                cross_domain: crossDomain,
                synthesis,
              });
              controller.enqueue(emit("evaluation", evaluation));

              if (runId) {
                try {
                  await prisma.$transaction([
                    prisma.artifact.upsert({
                      where: { runId },
                      update: { content: stringifyJson(synthesis) },
                      create: { runId, content: stringifyJson(synthesis) },
                    }),
                    prisma.evaluation.upsert({
                      where: { runId },
                      update: { content: stringifyJson(evaluation) },
                      create: { runId, content: stringifyJson(evaluation) },
                    }),
                    prisma.run.update({
                      where: { id: runId },
                      data: { status: systemAgentFailed ? "failed" : "done" },
                    }),
                  ]);
                } catch {
                  // Ignore persistence failure.
                }
              }
            } catch (error) {
              systemAgentFailed = true;
              controller.enqueue(
                emit("error", {
                  message:
                    error instanceof Error ? error.message : "系统综合评估阶段失败",
                }),
              );
              if (runId) {
                try {
                  await prisma.run.update({
                    where: { id: runId },
                    data: { status: "failed" },
                  });
                } catch {
                  // Ignore persistence failure.
                }
              }
            }
          } else if (runId) {
            try {
              await prisma.run.update({
                where: { id: runId },
                data: { status: "failed" },
              });
            } catch {
              // Ignore persistence failure.
            }
          }

          controller.enqueue(
            emit("path_status", {
              status: systemAgentFailed ? "partial_failed" : "done",
            }),
          );
        }

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
