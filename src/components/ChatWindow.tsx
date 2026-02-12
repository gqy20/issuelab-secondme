"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

type ChatItem = { role: "user" | "assistant"; content: string };
type SseEvent = { event: string; data: string };
type PathKey = "radical" | "conservative" | "cross_domain";

type PathReport = {
  path: PathKey;
  final_hypothesis?: string;
  hypothesis?: string;
  confidence?: number;
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

type JudgeRoundItem = {
  path: PathKey;
  round: number;
  judge?: {
    round_score?: number;
    critical_gap?: string;
    next_constraint?: string;
    verdict?: string;
  };
  error?: string;
};

const PATH_KEYS: PathKey[] = ["radical", "conservative", "cross_domain"];
const PATH_LABELS: Record<PathKey, string> = {
  radical: "激进路径",
  conservative: "稳健路径",
  cross_domain: "跨域路径",
};

function parseSseBlock(block: string): SseEvent | null {
  const lines = block.split(/\r?\n/);
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }

  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}

export function ChatWindow() {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [pathStatus, setPathStatus] = useState("idle");
  const [debateStatus, setDebateStatus] = useState("idle");
  const [pathReports, setPathReports] = useState<Partial<Record<PathKey, PathReport>>>({});
  const [synthesis, setSynthesis] = useState<Synthesis | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [debateRounds, setDebateRounds] = useState<DebateRoundItem[]>([]);
  const [judgeRounds, setJudgeRounds] = useState<JudgeRoundItem[]>([]);
  const [messages, setMessages] = useState<ChatItem[]>([
    { role: "assistant", content: "欢迎进入轨迹讨论区，输入问题开始。" },
  ]);

  const formRef = useRef<HTMLFormElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);

  const appendToLastAssistant = (delta: string) => {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const last = next.length - 1;
      if (next[last].role !== "assistant") return prev;
      next[last] = { ...next[last], content: `${next[last].content}${delta}` };
      return next;
    });
  };

  const replaceLastAssistant = (content: string) => {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const last = next.length - 1;
      if (next[last].role !== "assistant") return prev;
      next[last] = { ...next[last], content };
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
    setPathStatus("running");
    setDebateStatus("idle");
    setPathReports({});
    setSynthesis(null);
    setEvaluation(null);
    setDebateRounds([]);
    setJudgeRounds([]);
    setMessages((prev) => [...prev, { role: "user", content: message }, { role: "assistant", content: "正在进行多轮博弈..." }]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sessionId }),
      });

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({}));
        replaceLastAssistant(
          typeof payload?.message === "string" ? payload.message : "请求失败，请稍后重试。",
        );
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

            if (parsed.event === "path_status" && typeof payload.status === "string") {
              setPathStatus(payload.status);
              continue;
            }

            if (parsed.event === "debate_status" && typeof payload.status === "string") {
              setDebateStatus(payload.status);
              continue;
            }

            if (parsed.event === "debate_round") {
              const item = payload as unknown as DebateRoundItem;
              if (item.path && typeof item.round === "number") {
                setDebateRounds((prev) => [...prev, item]);
              }
              continue;
            }

            if (parsed.event === "judge_round") {
              const item = payload as unknown as JudgeRoundItem;
              if (item.path && typeof item.round === "number") {
                setJudgeRounds((prev) => [...prev, item]);
              }
              continue;
            }

            if (parsed.event === "path_report") {
              const item = payload as unknown as { path?: PathKey; report?: PathReport; error?: string };
              if (item.path) {
                setPathReports((prev) => ({
                  ...prev,
                  [item.path as PathKey]: item.report ?? { path: item.path as PathKey, error: item.error },
                }));
              }
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

            if (parsed.event === "final_answer" && typeof payload.text === "string") {
              replaceLastAssistant(payload.text);
              continue;
            }

            if (parsed.event === "error") {
              replaceLastAssistant(typeof payload.message === "string" ? payload.message : "执行失败，请重试。");
              continue;
            }

            if (parsed.event === "delta" && typeof payload.text === "string") {
              appendToLastAssistant(payload.text);
            }
          } catch {
            // ignore malformed payload
          }
        }
      }
    } catch {
      replaceLastAssistant("网络异常，请稍后重试。");
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (!messageListRef.current) return;
    messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
  }, [messages, debateRounds.length, judgeRounds.length]);

  const onInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    formRef.current?.requestSubmit();
  };

  return (
    <div className="grid h-[72dvh] min-h-[580px] grid-cols-[300px,minmax(0,1fr)] gap-3">
      <aside className="overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
        <div className="space-y-3">
          <div>
            <p className="text-xs text-[var(--text-muted)]">状态</p>
            <p>路径: {pathStatus}</p>
            <p>轮次: {debateStatus}</p>
          </div>

          <div>
            <p className="text-xs text-[var(--text-muted)]">路径报告</p>
            {PATH_KEYS.map((path) => {
              const report = pathReports[path];
              return (
                <div key={path} className="mt-2 rounded border border-[var(--border)] p-2">
                  <p className="text-xs text-[var(--text-muted)]">{PATH_LABELS[path]}</p>
                  <p className="text-sm">
                    {report?.error
                      ? `失败: ${report.error}`
                      : report?.final_hypothesis || report?.hypothesis || "等待结果..."}
                  </p>
                  {typeof report?.confidence === "number" ? <p className="text-xs">置信度: {report.confidence}</p> : null}
                </div>
              );
            })}
          </div>

          {synthesis?.summary ? (
            <div className="rounded border border-[var(--border)] p-2">
              <p className="text-xs text-[var(--text-muted)]">综合</p>
              <p>{synthesis.summary}</p>
            </div>
          ) : null}

          {typeof evaluation?.score === "number" ? (
            <div className="rounded border border-[var(--border)] p-2">
              <p className="text-xs text-[var(--text-muted)]">评估分</p>
              <p>{evaluation.score}</p>
            </div>
          ) : null}

          {debateRounds.length > 0 ? (
            <div className="rounded border border-[var(--border)] p-2">
              <p className="text-xs text-[var(--text-muted)]">最近博弈</p>
              {debateRounds.slice(-6).map((item, idx) => (
                <p key={`d-${item.path}-${item.round}-${idx}`} className="text-xs">
                  R{item.round} {PATH_LABELS[item.path]}:{" "}
                  {item.error ? `失败-${item.error}` : `${item.coach?.hypothesis ?? "-"} | ${item.secondme ?? "-"}`}
                </p>
              ))}
              {judgeRounds.slice(-6).map((item, idx) => (
                <p key={`j-${item.path}-${item.round}-${idx}`} className="text-xs">
                  J{item.round} {PATH_LABELS[item.path]}:{" "}
                  {item.error
                    ? `失败-${item.error}`
                    : `score=${item.judge?.round_score ?? "-"}, verdict=${item.judge?.verdict ?? "-"}, gap=${item.judge?.critical_gap ?? "-"}`}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      </aside>

      <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        <div ref={messageListRef} className="flex-1 space-y-3 overflow-y-auto bg-[var(--surface-2)] p-3">
          {messages.map((item, idx) => (
            <div
              key={`${item.role}-${idx}`}
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm leading-6 ${
                item.role === "user"
                  ? "ml-auto bg-[#0f172a] text-white"
                  : "border border-[var(--border)] bg-white text-[var(--foreground)]"
              }`}
            >
              {item.content || (sending && idx === messages.length - 1 ? "..." : "")}
            </div>
          ))}
        </div>

        <form ref={formRef} onSubmit={onSubmit} className="border-t border-[var(--border)] bg-[var(--surface)] p-3">
          <div className="flex gap-2">
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
              placeholder="例如：如果我走跨学科方向，三年后最关键的能力差异是什么？"
              className="flex-1 resize-none rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition-shadow focus:shadow-[0_0_0_2px_var(--accent-soft)] disabled:cursor-not-allowed disabled:bg-[var(--surface-2)]"
            />
            <button
              type="submit"
              disabled={sending}
              aria-busy={sending}
              className="rounded-lg bg-[#0f172a] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sending ? "生成中..." : "发送"}
            </button>
          </div>
          <p className="mt-2 text-xs text-[var(--text-muted)]">按 Enter 发送，Shift + Enter 换行</p>
        </form>
      </section>
    </div>
  );
}
