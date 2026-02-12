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
  radical: "\u6fc0\u8fdb\u8def\u5f84",
  conservative: "\u7a33\u5065\u8def\u5f84",
  cross_domain: "\u8de8\u57df\u8def\u5f84",
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
      return "\u8fdb\u884c\u4e2d";
    case "done":
      return "\u5df2\u5b8c\u6210";
    case "partial_failed":
      return "\u90e8\u5206\u5931\u8d25";
    case "failed":
      return "\u5931\u8d25";
    case "idle":
      return "\u5f85\u5f00\u59cb";
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
      content: "\u6b22\u8fce\u8fdb\u5165\u8f68\u8ff9\u8ba8\u8bba\u533a\uff0c\u8f93\u5165\u4f60\u7684\u95ee\u9898\u5f00\u59cb\u63a2\u7d22\u3002",
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
            : "\u804a\u5929\u8bf7\u6c42\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002";
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
                  : "\u804a\u5929\u6d41\u4e2d\u65ad\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002",
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
      appendToLastAssistant("\u7f51\u7edc\u5f02\u5e38\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002");
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
    <div className="flex h-[72dvh] min-h-[580px] max-h-[820px] flex-col">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{"\u8f68\u8ff9\u5bf9\u8bdd"}</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {"\u8f93\u5165\u95ee\u9898\u5e76\u884c\u89e6\u53d1\u591a\u6761\u8def\u5f84\uff0c\u5b9e\u65f6\u6bd4\u8f83\u89c2\u70b9\u5206\u6b67\u3002"}
          </p>
        </div>
        <span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-xs text-[var(--text-muted)]">
          {sessionId ? `\u4f1a\u8bdd ${sessionId.slice(0, 8)}...` : "\u65b0\u4f1a\u8bdd"}
        </span>
      </div>

      <div className="mt-4 grid min-h-0 flex-1 grid-cols-[300px,minmax(0,1fr)] gap-3">
        <aside className="min-h-0 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">{"\u6d41\u7a0b\u72b6\u6001"}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span
                  className={`rounded-full border px-2 py-1 text-xs font-medium ${getStatusClass(pathStatus)}`}
                >
                  {"\u8def\u5f84\u7cfb\u7edf\uff1a"}
                  {getStatusLabel(pathStatus)}
                </span>
                <span
                  className={`rounded-full border px-2 py-1 text-xs font-medium ${getStatusClass(debateStatus)}`}
                >
                  {"\u8fa9\u8bba\u8f6e\u6b21\uff1a"}
                  {getStatusLabel(debateStatus)}
                </span>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">{"\u8def\u5f84\u7ed3\u679c"}</p>
              <div className="mt-2 space-y-2">
                {PATH_KEYS.map((key) => {
                  const report = pathReports[key];
                  const expanded = expandedPaths[key];

                  return (
                    <div key={key} className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
                      <button
                        type="button"
                        onClick={() => togglePath(key)}
                        className="flex w-full items-center justify-between gap-3 text-left"
                        aria-expanded={expanded}
                      >
                        <span className="text-xs font-medium text-[var(--text-muted)]">{PATH_LABELS[key]}</span>
                        <span className="text-xs font-medium text-[var(--accent)]">
                          {expanded ? "\u6536\u8d77" : "\u5c55\u5f00"}
                        </span>
                      </button>

                      <p className="mt-1 text-sm font-medium leading-6">
                        {report?.error
                          ? `\u5931\u8d25\uff1a${report.error}`
                          : report?.hypothesis
                            ? report.hypothesis
                            : "\u7b49\u5f85\u7ed3\u679c..."}
                      </p>

                      {expanded ? (
                        <div className="mt-2 space-y-2 border-t border-[var(--border)] pt-2 text-xs leading-5 text-[var(--text-muted)]">
                          {report?.why ? <p>{"\u5f62\u6210\u539f\u56e0\uff1a"}{report.why}</p> : null}
                          {report?.test_plan ? <p>{"\u9a8c\u8bc1\u8ba1\u5212\uff1a"}{report.test_plan}</p> : null}
                          {report?.risk_guardrail ? <p>{"\u98ce\u9669\u62a4\u680f\uff1a"}{report.risk_guardrail}</p> : null}
                          {report?.next_steps && report.next_steps.length > 0 ? (
                            <div>
                              <p>{"\u4e0b\u4e00\u6b65\uff1a"}</p>
                              <ul className="mt-1 list-disc pl-5">
                                {report.next_steps.map((step) => (
                                  <li key={step}>{step}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {!report ? <p>{"\u6682\u65e0\u8be6\u7ec6\u5185\u5bb9\u3002"}</p> : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            {synthesis?.summary ? (
              <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">{"\u7efc\u5408\u5efa\u8bae"}</p>
                <p className="mt-1 text-sm leading-6">{synthesis.summary}</p>
              </div>
            ) : null}

            {typeof evaluation?.score === "number" ? (
              <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">{"\u8bc4\u4f30\u5206"}</p>
                <p className="mt-1 text-sm">{evaluation.score}</p>
              </div>
            ) : null}

            {debateRounds.length > 0 ? (
              <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">{"\u6700\u8fd1\u8fa9\u8bba"}</p>
                <div className="mt-2 space-y-1.5 text-xs leading-5 text-[var(--text-muted)]">
                  {debateRounds.slice(-6).map((item, idx) => (
                    <p key={`${item.path}-${item.round}-${idx}`}>
                      {`R${item.round} ${PATH_LABELS[item.path]}\uff1a`}
                      {item.error
                        ? `\u5931\u8d25 - ${item.error}`
                        : `${item.coach?.hypothesis ?? "\u6682\u65e0\u5047\u8bbe"} | ${item.secondme ?? "\u6682\u65e0\u56de\u590d"}`}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          <div
            ref={messageListRef}
            aria-live="polite"
            aria-label={"\u804a\u5929\u6d88\u606f\u5217\u8868"}
            className="flex-1 space-y-3 overflow-y-auto bg-[var(--surface-2)] p-3"
          >
            {messages.map((item, idx) => (
              <div
                key={`${item.role}-${idx}`}
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm leading-6 shadow-[0_1px_2px_rgba(17,24,39,0.06)] ${
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
              <label htmlFor="chat-input" className="sr-only">{"\u8f93\u5165\u6d88\u606f"}</label>
              <textarea
                id="chat-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={onInputKeyDown}
                disabled={sending}
                rows={2}
                aria-label={"\u804a\u5929\u8f93\u5165\u6846"}
                placeholder={"\u4f8b\u5982\uff1a\u5982\u679c\u6211\u8d70\u8de8\u5b66\u79d1\u65b9\u5411\uff0c\u4e09\u5e74\u540e\u6700\u5173\u952e\u7684\u80fd\u529b\u5dee\u5f02\u662f\u4ec0\u4e48\uff1f"}
                className="flex-1 resize-none rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition-shadow focus:shadow-[0_0_0_2px_var(--accent-soft)] disabled:cursor-not-allowed disabled:bg-[var(--surface-2)]"
              />
              <button
                type="submit"
                disabled={sending}
                aria-busy={sending}
                className="rounded-lg bg-[#0f172a] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sending ? "\u751f\u6210\u4e2d..." : "\u53d1\u9001"}
              </button>
            </div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">{"\u6309 Enter \u53d1\u9001\uff0cShift + Enter \u6362\u884c"}</p>
          </form>
        </section>
      </div>
    </div>
  );
}
