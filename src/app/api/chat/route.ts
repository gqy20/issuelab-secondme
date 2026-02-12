import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { secondMeRequest } from "@/lib/secondme";
import {
  callCoach,
  callEvaluate,
  callJudge,
  callPathReport,
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

type DebateTurn = {
  round: number;
  coach: JsonRecord;
  secondme: string;
  judge: JsonRecord;
};

function shouldRunSystemAgents() {
  return process.env.SYSTEM_AGENT_ENABLED?.trim() !== "false";
}

function getDebateRounds() {
  const raw = Number(process.env.SYSTEM_AGENT_DEBATE_ROUNDS ?? "10");
  if (!Number.isFinite(raw) || raw < 1) return 10;
  if (raw > 10) return 10;
  return Math.floor(raw);
}

function stringifyJson(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
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

  const encoder = new TextEncoder();
  const emit = (event: string, payload: unknown) =>
    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let mainSessionId = session;
      let systemAgentFailed = false;

      controller.enqueue(emit("session", { sessionId: mainSessionId }));

      try {
        if (!shouldRunSystemAgents()) {
          const directReply = await requestSecondMeReply({
            accessToken,
            message,
            sessionId: mainSessionId,
          });
          if (directReply.sessionId && directReply.sessionId !== mainSessionId) {
            mainSessionId = directReply.sessionId;
            controller.enqueue(emit("session", { sessionId: mainSessionId }));
          }
          controller.enqueue(emit("final_answer", { text: directReply.text }));
          await prisma.chatMessage.create({
            data: { sessionId: mainSessionId, role: "assistant", content: directReply.text },
          });
          controller.enqueue(emit("done", { sessionId: mainSessionId }));
          controller.close();
          return;
        }

        const paths: PathType[] = ["radical", "conservative", "cross_domain"];
        const debateRounds = getDebateRounds();
        const pathSessions: Partial<Record<PathType, string>> = {};
        const pathTurns: Record<PathType, DebateTurn[]> = {
          radical: [],
          conservative: [],
          cross_domain: [],
        };
        const constraints: Partial<Record<PathType, string>> = {};
        const failedPaths = new Set<PathType>();
        const reports: Partial<Record<PathType, JsonRecord>> = {};
        const pathRunIdMap: Partial<Record<PathType, string>> = {};
        let runId: string | null = null;

        controller.enqueue(emit("path_status", { status: "running" }));
        for (const path of paths) {
          controller.enqueue(emit("path_status", { path, status: "running" }));
        }

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
            data: { taskId: task.id, status: "running" },
            select: { id: true },
          });
          runId = run.id;

          await Promise.all(
            paths.map(async (path) => {
              const pathRun = await prisma.pathRun.create({
                data: { runId: run.id, path, status: "running" },
                select: { id: true },
              });
              pathRunIdMap[path] = pathRun.id;
            }),
          );
        } catch {
          // Persistence errors should not block runtime.
        }

        for (let round = 1; round <= debateRounds; round += 1) {
          controller.enqueue(emit("debate_status", { round, status: "running" }));

          for (const path of paths) {
            if (failedPaths.has(path)) continue;

            try {
              const coach = await callCoach(path, {
                taskInput: message,
                round,
                context: stringifyJson({
                  constraint: constraints[path],
                  history: pathTurns[path].slice(-3),
                }),
              });

              const secondmePrompt = [
                `User question: ${message}`,
                `Path: ${path}`,
                `Round: ${round}`,
                `Coach hypothesis: ${coach.hypothesis}`,
                `Coach reason: ${coach.why}`,
                `Round constraint: ${constraints[path] ?? "none"}`,
                "Respond with your stance, strongest concern, and one actionable step.",
              ].join("\n");

              const secondme = await requestSecondMeReply({
                accessToken,
                message: secondmePrompt,
                sessionId: pathSessions[path],
              });
              if (secondme.sessionId) {
                pathSessions[path] = secondme.sessionId;
              }

              const judge = await callJudge({
                path,
                round,
                taskInput: message,
                coach,
                secondme: secondme.text,
                history: pathTurns[path].map((item) => ({
                  round: item.round,
                  coach: item.coach,
                  secondme: item.secondme,
                  judge: item.judge,
                })),
                constraint: constraints[path],
              });

              constraints[path] = judge.next_constraint;
              pathTurns[path].push({
                round,
                coach,
                secondme: secondme.text,
                judge,
              });

              controller.enqueue(
                emit("debate_round", {
                  path,
                  round,
                  coach,
                  secondme: secondme.text,
                }),
              );
              controller.enqueue(
                emit("judge_round", {
                  path,
                  round,
                  judge,
                }),
              );

              const pathRunId = pathRunIdMap[path];
              if (pathRunId) {
                try {
                  await prisma.$transaction([
                    prisma.turn.create({
                      data: {
                        pathRunId,
                        round,
                        role: "coach",
                        content: String(coach.hypothesis ?? ""),
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
                    prisma.turn.create({
                      data: {
                        pathRunId,
                        round,
                        role: "judge",
                        content: String(judge.critical_gap ?? ""),
                        jsonOutput: stringifyJson(judge),
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
                  error: error instanceof Error ? error.message : "博弈轮执行失败",
                }),
              );
              controller.enqueue(
                emit("judge_round", {
                  path,
                  round,
                  error: error instanceof Error ? error.message : "裁判执行失败",
                }),
              );
            }
          }

          controller.enqueue(emit("debate_status", { round, status: "done" }));
        }

        for (const path of paths) {
          if (failedPaths.has(path) || pathTurns[path].length === 0) {
            controller.enqueue(emit("path_status", { path, status: "failed" }));
            const pathRunId = pathRunIdMap[path];
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

          const report = await callPathReport({
            path,
            transcript: {
              path,
              turns: pathTurns[path],
            },
          });
          reports[path] = report;

          controller.enqueue(emit("path_report", { path, report }));
          controller.enqueue(emit("path_status", { path, status: "done" }));

          const pathRunId = pathRunIdMap[path];
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
        let finalAnswerText = "";

        if (radical && conservative && crossDomain) {
          const synthesis = await callSynthesize({
            radical,
            conservative,
            cross_domain: crossDomain,
          });
          controller.enqueue(emit("synthesis", synthesis));

          const finalPrompt = [
            `User question: ${message}`,
            "Use the following synthesis to answer the user with a clear final recommendation.",
            stringifyJson(synthesis),
          ].join("\n\n");

          const finalReply = await requestSecondMeReply({
            accessToken,
            message: finalPrompt,
            sessionId: mainSessionId,
          });
          if (finalReply.sessionId) {
            mainSessionId = finalReply.sessionId;
            controller.enqueue(emit("session", { sessionId: mainSessionId }));
          }
          finalAnswerText = finalReply.text;
          controller.enqueue(emit("final_answer", { text: finalAnswerText }));

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
                  update: {
                    content: stringifyJson({
                      synthesis,
                      final_answer: finalAnswerText,
                    }),
                  },
                  create: {
                    runId,
                    content: stringifyJson({
                      synthesis,
                      final_answer: finalAnswerText,
                    }),
                  },
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
        } else {
          systemAgentFailed = true;
          const fallback = await requestSecondMeReply({
            accessToken,
            message,
            sessionId: mainSessionId,
          });
          if (fallback.sessionId) {
            mainSessionId = fallback.sessionId;
            controller.enqueue(emit("session", { sessionId: mainSessionId }));
          }
          finalAnswerText = fallback.text;
          controller.enqueue(emit("final_answer", { text: finalAnswerText }));

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

        await prisma.chatMessage.create({
          data: { sessionId: mainSessionId, role: "assistant", content: finalAnswerText },
        });

        controller.enqueue(
          emit("path_status", {
            status: systemAgentFailed ? "partial_failed" : "done",
          }),
        );
        controller.enqueue(emit("done", { sessionId: mainSessionId }));
      } catch (error) {
        controller.enqueue(
          emit("error", {
            message: error instanceof Error ? error.message : "服务执行失败，请稍后重试。",
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
