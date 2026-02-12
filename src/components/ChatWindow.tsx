"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

type ChatItem = { role: "user" | "assistant"; content: string };
type SseEvent = { event: string; data: string };
type PathKey = "radical" | "conservative" | "cross_domain";

type PathReport = {
  path: PathKey;
  hypothesis?: string;
  why?: string;
  next_steps?: string[];
  test_plan?: string;
  risk_guardrail?: string;
  error?: string;
};

type Synthesis = {
  summary?: string;
  recommendation?: string;
};

type Evaluation = {
  score?: number;
};

type DebateRoundItem = {
  path: PathKey;
  round: number;
  coach?: { hypothesis?: string };
  secondme?: string;
  error?: string;
};

function parseSseBlock(block: string): SseEvent | null {
  const lines = block.split(/\r?\n/);
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}

export function ChatWindow() {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [pathStatus, setPathStatus] = useState<string>("idle");
  const [debateStatus, setDebateStatus] = useState<string>("idle");
  const [pathReports, setPathReports] = useState<Partial<Record<PathKey, PathReport>>>({});
  const [synthesis, setSynthesis] = useState<Synthesis | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [debateRounds, setDebateRounds] = useState<DebateRoundItem[]>([]);
  const [messages, setMessages] = useState<ChatItem[]>([
    {
      role: "assistant",
      content: "欢迎进入轨迹讨论区，输入你的问题开始探索。",
    },
  ]);

  const formRef = useRef<HTMLFormElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);

  const appendToLastAssistant = (delta: string) => {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const lastIndex = next.length - 1;
      if (next[lastIndex].role !== "assistant") return prev;
      next[lastIndex] = {
        ...next[lastIndex],
        content: `${next[lastIndex].content}${delta}`,
      };
      return next;
    });
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;

    const message = input.trim();
    if (!message) return;

    setInput("");
    setSending(true);
    setPathStatus("idle");
    setDebateStatus("idle");
    setPathReports({});
    setSynthesis(null);
    setEvaluation(null);
    setDebateRounds([]);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: message },
      { role: "assistant", content: "" },
    ]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sessionId }),
      });

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({}));
        const msg =
          typeof payload?.message === "string"
            ? payload.message
            : "聊天请求失败，请稍后重试。";
        appendToLastAssistant(msg);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";

        for (const block of blocks) {
          const parsed = parseSseBlock(block.trim());
          if (!parsed) continue;

          try {
            const payload = JSON.parse(parsed.data) as Record<string, unknown>;

            if (parsed.event === "session" && typeof payload.sessionId === "string") {
              setSessionId(payload.sessionId);
              continue;
            }

            if (parsed.event === "delta" && typeof payload.text === "string") {
              appendToLastAssistant(payload.text);
              continue;
            }

            if (parsed.event === "error") {
              appendToLastAssistant(
                typeof payload.message === "string"
                  ? payload.message
                  : "聊天流中断，请稍后重试。",
              );
              continue;
            }

            if (parsed.event === "path_status") {
              if (typeof payload.status === "string") {
                setPathStatus(payload.status);
              }
              continue;
            }

            if (parsed.event === "debate_status") {
              if (typeof payload.status === "string") {
                setDebateStatus(payload.status);
              }
              continue;
            }

            if (parsed.event === "debate_round") {
              const item = payload as unknown as DebateRoundItem;
              if (!item.path || typeof item.round !== "number") continue;
              setDebateRounds((prev) => [...prev, item]);
              continue;
            }

            if (parsed.event === "path_report") {
              const reportPayload = payload as unknown as {
                path?: PathKey;
                report?: PathReport;
                error?: string;
              };
              const path = reportPayload.path;
              if (!path) continue;
              setPathReports((prev) => ({
                ...prev,
                [path]: reportPayload.report ?? {
                  path,
                  error: reportPayload.error,
                },
              }));
              continue;
            }

            if (parsed.event === "synthesis") {
              setSynthesis(payload as unknown as Synthesis);
              continue;
            }

            if (parsed.event === "evaluation") {
              setEvaluation(payload as unknown as Evaluation);
              continue;
            }
          } catch {
            // Ignore malformed local SSE blocks.
          }
        }
      }
    } catch {
      appendToLastAssistant("网络异常，请稍后重试。");
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (!messageListRef.current) return;
    messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
  }, [messages, sending, debateRounds.length]);

  const onInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    formRef.current?.requestSubmit();
  };

  return (
    <div className="flex h-[62dvh] min-h-[420px] max-h-[560px] flex-col sm:h-[560px]">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">轨迹对话</h2>
        <span className="text-xs text-[var(--text-muted)]">
          {sessionId ? `会话 ${sessionId.slice(0, 6)}...` : "新会话"}
        </span>
      </div>

      <div
        ref={messageListRef}
        aria-live="polite"
        aria-label="聊天消息列表"
        className="flex-1 space-y-3 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3"
      >
        {messages.map((item, idx) => (
          <div
            key={`${item.role}-${idx}`}
            className={`max-w-[88%] rounded-xl px-3 py-2 text-sm leading-6 ${
              item.role === "user"
                ? "ml-auto bg-[var(--accent)] text-white"
                : "bg-white text-[var(--foreground)]"
            }`}
          >
            {item.content || (sending && idx === messages.length - 1 ? "..." : "")}
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-xl border border-[var(--border)] bg-white p-3 text-xs text-[var(--text-muted)]">
        <div className="flex items-center justify-between">
          <span className="font-medium text-[var(--foreground)]">三路径系统智能体</span>
          <span>路径状态: {pathStatus}</span>
        </div>
        <div className="mt-1">博弈轮状态: {debateStatus}</div>
        <div className="mt-2 space-y-1">
          {(["radical", "conservative", "cross_domain"] as PathKey[]).map((key) => {
            const report = pathReports[key];
            return (
              <div key={key}>
                <span className="font-medium text-[var(--foreground)]">{key}: </span>
                <span>
                  {report?.error
                    ? `失败 - ${report.error}`
                    : report?.hypothesis
                      ? report.hypothesis
                      : "等待结果..."}
                </span>
              </div>
            );
          })}
          {synthesis?.summary ? (
            <div>
              <span className="font-medium text-[var(--foreground)]">综合建议: </span>
              <span>{synthesis.summary}</span>
            </div>
          ) : null}
          {typeof evaluation?.score === "number" ? (
            <div>
              <span className="font-medium text-[var(--foreground)]">评估分: </span>
              <span>{evaluation.score}</span>
            </div>
          ) : null}
          {debateRounds.length > 0 ? (
            <div className="mt-2 space-y-1 border-t border-[var(--border)] pt-2">
              <div className="font-medium text-[var(--foreground)]">多轮博弈过程</div>
              {debateRounds.slice(-10).map((item, idx) => (
                <div key={`${item.path}-${item.round}-${idx}`}>
                  <span className="font-medium">
                    R{item.round} {item.path}:
                  </span>{" "}
                  <span>
                    {item.error
                      ? `失败 - ${item.error}`
                      : `${item.coach?.hypothesis ?? "无假设"} | ${item.secondme ?? "无SecondMe回应"}`}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <form ref={formRef} onSubmit={onSubmit} className="mt-3 flex gap-2">
        <label htmlFor="chat-input" className="sr-only">
          输入消息
        </label>
        <textarea
          id="chat-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onInputKeyDown}
          disabled={sending}
          rows={2}
          aria-label="聊天输入框"
          placeholder="例如：如果我走跨学科路径，三年后最关键的能力差是什么？"
          className="flex-1 resize-none rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition-shadow focus:shadow-[0_0_0_2px_var(--accent-soft)] disabled:cursor-not-allowed disabled:bg-[var(--surface-2)]"
        />
        <button
          type="submit"
          disabled={sending}
          aria-busy={sending}
          className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {sending ? "生成中" : "发送"}
        </button>
      </form>
    </div>
  );
}
