import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_TOKEN_COOKIE, AUTH_USER_COOKIE } from "@/lib/auth";

const {
  mockPrisma,
  mockSecondMeRequest,
  mockRuntime,
} = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
    },
    chatSession: {
      create: vi.fn(),
    },
    chatMessage: {
      create: vi.fn(),
    },
  },
  mockSecondMeRequest: vi.fn(),
  mockRuntime: {
    callCoach: vi.fn(),
    callJudge: vi.fn(),
    callPathReport: vi.fn(),
    callSynthesize: vi.fn(),
    callEvaluate: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/secondme", () => ({
  secondMeRequest: mockSecondMeRequest,
}));

vi.mock("@/lib/system-agents/runtime", () => mockRuntime);

import { POST } from "@/app/api/chat/route";

function makeRequest(body: unknown, withAuth = true) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(withAuth
        ? { cookie: `${AUTH_USER_COOKIE}=u-1; ${AUTH_TOKEN_COOKIE}=token-1` }
        : {}),
    },
    body: JSON.stringify(body),
  });
}

function makeSseResponse(lines: string[]) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe("POST /api/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SYSTEM_AGENT_ENABLED = "false";
    mockPrisma.chatMessage.create.mockResolvedValue({ id: "m1" });
  });

  it("returns 401 when unauthenticated", async () => {
    const response = await POST(makeRequest({ message: "hello" }, false));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: 401 });
  });

  it("returns 400 when message is missing", async () => {
    const response = await POST(makeRequest({ message: "   " }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 400 });
  });

  it("returns 404 when user is not found", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const response = await POST(makeRequest({ message: "hello" }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: 404 });
  });

  it("streams direct final_answer when system agents are disabled", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "db-user-1" });
    mockSecondMeRequest.mockResolvedValue(
      makeSseResponse([
        'data: {"sessionId":"session-2","choices":[{"delta":{"content":"Hello "}}]}\n',
        'data: {"choices":[{"delta":{"content":"World"}}]}\n',
        'data: [DONE]\n',
      ]),
    );

    const response = await POST(makeRequest({ message: "hello", sessionId: "session-1" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const text = await response.text();
    expect(text).toContain("event: final_answer");
    expect(text).toContain("Hello World");
    expect(text).toContain("event: done");

    expect(mockPrisma.chatMessage.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.chatMessage.create.mock.calls[1][0]).toEqual({
      data: { sessionId: "session-2", role: "assistant", content: "Hello World" },
    });
  });
});
