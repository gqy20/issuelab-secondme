import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callCoach, callJudge } from "@/lib/system-agents/runtime";

function anthropicPayload(text: string) {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude",
    content: [{ type: "text", text }],
  };
}

describe("system-agents runtime", () => {
  const envBackup = {
    ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.ANTHROPIC_AUTH_TOKEN = "token-1";
    process.env.ANTHROPIC_API_KEY = "";
    process.env.ANTHROPIC_BASE_URL = "https://anthropic.example.com";
  });

  afterEach(() => {
    process.env.ANTHROPIC_AUTH_TOKEN = envBackup.ANTHROPIC_AUTH_TOKEN;
    process.env.ANTHROPIC_API_KEY = envBackup.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_BASE_URL = envBackup.ANTHROPIC_BASE_URL;
  });

  it("retries once when first model output is invalid JSON", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(anthropicPayload("not-json")), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            anthropicPayload(
              '{"path":"radical","hypothesis":"h","why":"w","next_steps":["a","b","c"],"test_plan":"tp","risk_guardrail":"rg"}',
            ),
          ),
          { status: 200 },
        ),
      );

    const result = await callCoach("radical", {
      taskInput: "build feature",
      round: 1,
      context: "{}",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.hypothesis).toBe("h");
    expect(result.next_steps).toEqual(["a", "b", "c"]);
  });

  it("normalizes judge score and verdict", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify(
          anthropicPayload(
            '{"path":"radical","round":1,"round_score":200,"critical_gap":"gap","next_constraint":"tighten","verdict":"unknown"}',
          ),
        ),
        { status: 200 },
      ),
    );

    const result = await callJudge({
      path: "radical",
      round: 1,
      taskInput: "q",
      coach: {},
      secondme: "answer",
      history: [],
    });

    expect(result.round_score).toBe(100);
    expect(result.verdict).toBe("revise");
  });

  it("throws timeout error when fetch aborts", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);

    await expect(
      callCoach("conservative", {
        taskInput: "task",
        round: 1,
        context: "{}",
      }),
    ).rejects.toThrow("Messages API timeout");
  });

  it("throws API error details when Messages API is non-OK", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "invalid key" } }), { status: 401 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "invalid key" } }), { status: 401 }),
      );

    await expect(
      callCoach("cross_domain", {
        taskInput: "task",
        round: 1,
        context: "{}",
      }),
    ).rejects.toThrow("Messages API failed: invalid key");
  });
});
