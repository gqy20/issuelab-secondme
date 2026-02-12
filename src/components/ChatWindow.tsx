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

const PATH_KEYS: PathKey[] = ["radical", "conservative", "cross_domain"];

const PATH_LABELS: Record<PathKey, string> = {
  radical: "激进路径",
  conservative: "稳健路径",
  cross_domain: "跨域路径",
};

const INITIAL_EXPANDED_PATHS: Record<PathKey, boolean> = {
  radical: true,
  conservative: false,
  cross_domain: false,
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

function getStatusLabel(status: string) {
  switch (status) {
    case "running":
      return "进行中";
    case "done":
      return "已完成";
    case "partial_failed":
      return "部分失败";
    case "failed":
      return "失败";
    case "idle":
      return "待开始";
    default:
      return status;
  }
}

function getStatusClass(status: string) {
  if (status === "done") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "partial_failed") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "failed") return "bg-rose-50 text-rose-700 border-rose-200";
  if (status === "running") return "bg-sky-50 text-sky-700 border-sky-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
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
  const [expandedPaths, setExpandedPaths] = useState<Record<PathKey, boolean>>(INITIAL_EXPANDED_PATHS);
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

  const togglePath = (path: PathKey) => {
    setExpandedPaths((prev) => ({ ...prev, [path]: !prev[path] }));
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
    setExpandedPaths(INITIAL_EXPANDED_PATHS);
    setMessages((prev) => [...prev, { role: "user", content: message }, { role: "assistant", content: "" }]);

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
                typeof payload.message === "string" ? payload.message : "聊天流中断，请稍后重试。",
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
    <div className="flex h-[70dvh] min-h-[560px] max-h-[800px] flex-col">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">轨迹对话</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            输入问题并行触发多条路径，实时比较观点分歧。
          </p>
        </div>
        <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)]">
          {sessionId ? `会话 ${sessionId.slice(0, 8)}...` : "新会话"}
        </span>
      </div>

      <div className="mt-4 grid min-h-0 flex-1 gap-3 lg:grid-cols-[300px,minmax(0,1fr)]">
        <aside className="min-h-0 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">流程状态</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span
                  className={`rounded-full border px-2 py-1 text-xs font-medium ${getStatusClass(pathStatus)}`}
                >
                  路径系统：{getStatusLabel(pathStatus)}
                </span>
                <span
                  className={`rounded-full border px-2 py-1 text-xs font-medium ${getStatusClass(debateStatus)}`}
                >
                  辩论轮次：{getStatusLabel(debateStatus)}
                </span>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">路径结果</p>
              <div className="mt-2 space-y-2">
                {PATH_KEYS.map((key) => {
                  const report = pathReports[key];
                  const expanded = expandedPaths[key];

                  return (
                    <div key={key} className="rounded-lg border border-[var(--border)] bg-white p-2.5">
                      <button
                        type="button"
                        onClick={() => togglePath(key)}
                        className="flex w-full items-center justify-between gap-3 text-left"
                        aria-expanded={expanded}
                      >
                        <span className="text-xs font-medium text-[var(--text-muted)]">{PATH_LABELS[key]}</span>
                        <span className="text-xs text-[var(--accent)]">{expanded ? "收起" : "展开"}</span>
                      </button>

                      <p className="mt-1 text-sm font-medium leading-6">
                        {report?.error
                          ? `失败：${report.error}`
                          : report?.hypothesis
                            ? report.hypothesis
                            : "等待结果..."}
                      </p>

                      {expanded ? (
                        <div className="mt-2 space-y-2 border-t border-[var(--border)] pt-2 text-xs leading-5 text-[var(--text-muted)]">
                          {report?.why ? <p>形成原因：{report.why}</p> : null}
                          {report?.test_plan ? <p>验证计划：{report.test_plan}</p> : null}
                          {report?.risk_guardrail ? <p>风险护栏：{report.risk_guardrail}</p> : null}
                          {report?.next_steps && report.next_steps.length > 0 ? (
                            <div>
                              <p>下一步：</p>
                              <ul className="mt-1 list-disc pl-5">
                                {report.next_steps.map((step) => (
                                  <li key={step}>{step}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {!report ? <p>暂无详细内容。</p> : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            {synthesis?.summary ? (
              <div className="rounded-lg border border-[var(--border)] bg-white p-2.5">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">综合建议</p>
                <p className="mt-1 text-sm leading-6">{synthesis.summary}</p>
              </div>
            ) : null}

            {typeof evaluation?.score === "number" ? (
              <div className="rounded-lg border border-[var(--border)] bg-white p-2.5">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">评估分</p>
                <p className="mt-1 text-sm">{evaluation.score}</p>
              </div>
            ) : null}

            {debateRounds.length > 0 ? (
              <div className="rounded-lg border border-[var(--border)] bg-white p-2.5">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">最近辩论</p>
                <div className="mt-2 space-y-1.5 text-xs leading-5 text-[var(--text-muted)]">
                  {debateRounds.slice(-6).map((item, idx) => (
                    <p key={`${item.path}-${item.round}-${idx}`}>
                      R{item.round} {PATH_LABELS[item.path]}：
                      {item.error
                        ? `失败 - ${item.error}`
                        : `${item.coach?.hypothesis ?? "暂无假设"} | ${item.secondme ?? "暂无回复"}`}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
          <div
            ref={messageListRef}
            aria-live="polite"
            aria-label="聊天消息列表"
            className="flex-1 space-y-3 overflow-y-auto p-3"
          >
            {messages.map((item, idx) => (
              <div
                key={`${item.role}-${idx}`}
                className={`max-w-[82%] rounded-xl px-3 py-2 text-sm leading-6 ${
                  item.role === "user"
                    ? "ml-auto bg-[var(--accent)] text-white"
                    : "bg-white text-[var(--foreground)]"
                }`}
              >
                {item.content || (sending && idx === messages.length - 1 ? "..." : "")}
              </div>
            ))}
          </div>

          <form ref={formRef} onSubmit={onSubmit} className="border-t border-[var(--border)] bg-white p-3">
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
                className="flex-1 resize-none rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition-shadow focus:shadow-[0_0_0_2px_var(--accent-soft)] disabled:cursor-not-allowed disabled:bg-[var(--surface-2)]"
              />
              <button
                type="submit"
                disabled={sending}
                aria-busy={sending}
                className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sending ? "生成中..." : "发送"}
              </button>
            </div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">按 Enter 发送，Shift + Enter 换行</p>
          </form>
        </section>
      </div>
    </div>
  );
}
