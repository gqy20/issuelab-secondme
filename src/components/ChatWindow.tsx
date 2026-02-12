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

type Synthesis = { summary?: string; recommendation?: string };
type Evaluation = { score?: number };

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
  radical: "\u6fc0\u8fdb\u8def\u5f84",
  conservative: "\u7a33\u5065\u8def\u5f84",
  cross_domain: "\u8de8\u57df\u8def\u5f84",
};
const QUICK_PROMPTS = [
  "\u8bf7\u5bf9\u6bd4\u4e09\u6761\u8def\u5f84\u5728\u98ce\u9669\u4e0a\u7684\u6838\u5fc3\u5dee\u522b",
  "\u57fa\u4e8e\u5f53\u524d\u7ed3\u8bba\u7ed9\u51fa\u4e00\u4e2a 30 \u5929\u6267\u884c\u8ba1\u5212",
  "\u8bf7\u53ea\u805a\u7126\u53ef\u843d\u5730\u6027\uff0c\u91cd\u65b0\u7ed9\u51fa\u6392\u5e8f",
];

type StageMeta = {
  label: string;
  detail: string;
  progress: number;
  tone: "neutral" | "running" | "done" | "warn";
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

function statusToStage(status: string, type: "path" | "debate"): StageMeta {
  if (status === "done") {
    return {
      label: "\u5df2\u5b8c\u6210",
      detail: type === "path" ? "\u8def\u5f84\u7ed3\u679c\u5df2\u6536\u6572" : "\u8fa9\u8bba\u8f6e\u6b21\u5df2\u7ed3\u675f",
      progress: 100,
      tone: "done",
    };
  }

  if (status === "partial_failed" || status === "failed") {
    return {
      label: "\u90e8\u5206\u5931\u8d25",
      detail: "\u53ef\u7ee7\u7eed\u67e5\u770b\u5df2\u6709\u8f93\u51fa\u6216\u91cd\u8bd5",
      progress: 75,
      tone: "warn",
    };
  }

  if (status === "running") {
    return {
      label: "\u8fdb\u884c\u4e2d",
      detail: type === "path" ? "\u6b63\u5728\u751f\u6210\u591a\u8def\u5f84\u8bbe\u60f3" : "\u6b63\u5728\u8fdb\u884c\u89c2\u70b9\u4ea4\u9519\u9a8c\u8bc1",
      progress: 50,
      tone: "running",
    };
  }

  return {
    label: "\u5f85\u5f00\u59cb",
    detail: type === "path" ? "\u63d0\u95ee\u540e\u5c06\u81ea\u52a8\u5f00\u59cb" : "\u8def\u5f84\u5b8c\u6210\u540e\u8fdb\u5165\u8fa9\u8bba",
    progress: 10,
    tone: "neutral",
  };
}

function badgeClass(tone: StageMeta["tone"]) {
  if (tone === "done") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "running") return "border-sky-200 bg-sky-50 text-sky-700";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function pickLatestByPath<T extends { path: PathKey }>(items: T[]) {
  const latest: Partial<Record<PathKey, T>> = {};
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (!latest[item.path]) latest[item.path] = item;
  }
  return latest;
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
    {
      role: "assistant",
      content: "\u6b22\u8fce\u8fdb\u5165\u8f68\u8ff9\u8ba8\u8bba\u533a\uff0c\u8f93\u5165\u95ee\u9898\u5373\u53ef\u5f00\u59cb\u3002",
    },
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

  const submitMessage = async (rawMessage: string) => {
    if (sending) return;
    const message = rawMessage.trim();
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
    setMessages((prev) => [
      ...prev,
      { role: "user", content: message },
      { role: "assistant", content: "\u6b63\u5728\u8fdb\u884c\u8def\u5f84\u751f\u6210\u4e0e\u8ba8\u8bba\uff0c\u8bf7\u7a0d\u5019..." },
    ]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sessionId }),
      });

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({}));
        replaceLastAssistant(
          typeof payload?.message === "string"
            ? payload.message
            : "\u8bf7\u6c42\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002",
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
              replaceLastAssistant(
                typeof payload.message === "string"
                  ? payload.message
                  : "\u6267\u884c\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002",
              );
              continue;
            }

            if (parsed.event === "delta" && typeof payload.text === "string") {
              appendToLastAssistant(payload.text);
            }
          } catch {
            // Ignore malformed payload blocks
          }
        }
      }
    } catch {
      replaceLastAssistant("\u7f51\u7edc\u5f02\u5e38\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002");
    } finally {
      setSending(false);
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await submitMessage(input);
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

  const pathStage = statusToStage(pathStatus, "path");
  const debateStage = statusToStage(debateStatus, "debate");
  const overallProgress = Math.round((pathStage.progress + debateStage.progress) / 2);
  const latestDebateByPath = pickLatestByPath(debateRounds);
  const latestJudgeByPath = pickLatestByPath(judgeRounds);
  const failedPaths = PATH_KEYS.filter((path) => Boolean(pathReports[path]?.error));
  const pathSummaries = PATH_KEYS.map((path) => {
    const report = pathReports[path];
    const summary = report?.final_hypothesis || report?.hypothesis;
    if (report?.error) {
      return { path, text: `\u5931\u8d25\uff1a${report.error}` };
    }
    if (summary) {
      return { path, text: summary };
    }
    return { path, text: "\u6682\u65e0\u7ed3\u679c" };
  });

  const applyQuickPrompt = (prompt: string) => {
    if (sending) return;
    setInput(prompt);
  };
  const retryFailedPaths = async () => {
    if (sending || failedPaths.length === 0) return;
    const target = failedPaths.map((path) => PATH_LABELS[path]).join("、");
    await submitMessage(`请仅重试以下失败路径：${target}，并保持其余路径结果不变。`);
  };
  const regenerateComparison = async () => {
    if (sending) return;
    await submitMessage("请基于当前会话结果，重新生成三路径差异对比（结论、风险、行动建议）并给出排序。");
  };

  return (
    <div className="grid h-[72dvh] min-h-[580px] grid-cols-[288px_1fr] gap-3">
      <aside className="overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm">
        <div className="space-y-3">
          <div className="rounded-md border border-[var(--border)] bg-white p-2.5">
            <p className="text-xs font-medium text-[var(--text-muted)]">{"\u8fdb\u5ea6\u603b\u89c8"}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${overallProgress}%` }} />
            </div>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{`\u5f53\u524d\u8fdb\u5ea6 ${overallProgress}%`}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className={`rounded-full border px-2 py-1 text-xs ${badgeClass(pathStage.tone)}`}>
                {"\u8def\u5f84\uff1a"}
                {pathStage.label}
              </span>
              <span className={`rounded-full border px-2 py-1 text-xs ${badgeClass(debateStage.tone)}`}>
                {"\u8f6e\u6b21\uff1a"}
                {debateStage.label}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{pathStage.detail}</p>
            <p className="text-xs leading-5 text-[var(--text-muted)]">{debateStage.detail}</p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">{"\u8def\u5f84\u7ed3\u679c\u6458\u8981"}</p>
            {PATH_KEYS.map((path) => {
              const report = pathReports[path];
              const summary = report?.final_hypothesis || report?.hypothesis;
              return (
                <div key={path} className="mt-2 rounded-md border border-[var(--border)] bg-white p-2.5">
                  <p className="text-xs font-medium text-[var(--text-muted)]">{PATH_LABELS[path]}</p>
                  <p className="mt-1 line-clamp-2 text-sm">
                    {report?.error
                      ? `\u5931\u8d25\uff1a${report.error}`
                      : summary || "\u7b49\u5f85\u7ed3\u679c..."}
                  </p>
                  {typeof report?.confidence === "number" ? (
                    <p className="mt-1 text-xs text-[var(--text-muted)]">{`\u7f6e\u4fe1\u5ea6 ${report.confidence}`}</p>
                  ) : null}
                </div>
              );
            })}
          </div>

          {synthesis?.summary ? (
            <div className="rounded-md border border-[var(--border)] bg-white p-2.5">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">{"\u7efc\u5408\u7ed3\u8bba"}</p>
              <p className="mt-1 text-sm leading-6">{synthesis.summary}</p>
            </div>
          ) : null}

          {typeof evaluation?.score === "number" ? (
            <div className="rounded-md border border-[var(--border)] bg-white p-2.5">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">{"\u8bc4\u4f30\u5206"}</p>
              <p className="mt-1 text-sm">{evaluation.score}</p>
            </div>
          ) : null}
        </div>
      </aside>

      <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border)] bg-white px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold tracking-tight">{"\u8f68\u8ff9\u5bf9\u8bdd"}</h2>
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-xs text-[var(--text-muted)]">
              {sessionId ? `\u4f1a\u8bdd ${sessionId.slice(0, 8)}...` : "\u65b0\u4f1a\u8bdd"}
            </span>
          </div>
        </div>

        <div className="border-b border-[var(--border)] bg-white px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
              {"\u8def\u5f84\u5dee\u5f02\u5bf9\u6bd4"}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={retryFailedPaths}
                disabled={sending || failedPaths.length === 0}
                className="rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-2.5 py-1 text-xs font-medium text-[var(--danger)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {"\u91cd\u8bd5\u5931\u8d25\u8def\u5f84"}
              </button>
              <button
                type="button"
                onClick={regenerateComparison}
                disabled={sending}
                className="rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-medium text-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {"\u91cd\u65b0\u751f\u6210\u5bf9\u6bd4"}
              </button>
            </div>
          </div>
          <div className="mt-2 overflow-hidden rounded-md border border-[var(--border)]">
            <div className="grid grid-cols-[120px_1fr_1fr_1fr] bg-[var(--surface-2)] text-xs font-medium text-[var(--text-muted)]">
              <div className="border-r border-[var(--border)] px-2 py-1.5">{"\u7ef4\u5ea6"}</div>
              {PATH_KEYS.map((path) => (
                <div key={`head-${path}`} className="border-r border-[var(--border)] px-2 py-1.5 last:border-r-0">
                  {PATH_LABELS[path]}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-[120px_1fr_1fr_1fr] border-t border-[var(--border)] text-xs">
              <div className="border-r border-[var(--border)] bg-white px-2 py-2 font-medium">{"\u7ed3\u8bba\u5dee\u5f02"}</div>
              {pathSummaries.map((item) => (
                <div key={`summary-${item.path}`} className="border-r border-[var(--border)] bg-white px-2 py-2 leading-5 last:border-r-0">
                  <p className="line-clamp-2">{item.text}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-[120px_1fr_1fr_1fr] border-t border-[var(--border)] text-xs">
              <div className="border-r border-[var(--border)] bg-white px-2 py-2 font-medium">{"\u98ce\u9669\u5dee\u5f02"}</div>
              {PATH_KEYS.map((path) => {
                const judgeGap = latestJudgeByPath[path]?.judge?.critical_gap;
                const err = pathReports[path]?.error;
                const text = err ? `\u5931\u8d25\uff1a${err}` : judgeGap || "\u6682\u65e0\u98ce\u9669\u5dee\u5f02\u8bf4\u660e";
                return (
                  <div key={`risk-${path}`} className="border-r border-[var(--border)] bg-white px-2 py-2 leading-5 last:border-r-0">
                    <p className="line-clamp-2">{text}</p>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-[120px_1fr_1fr_1fr] border-t border-[var(--border)] text-xs">
              <div className="border-r border-[var(--border)] bg-white px-2 py-2 font-medium">{"\u884c\u52a8\u5efa\u8bae"}</div>
              {PATH_KEYS.map((path) => {
                const action = latestJudgeByPath[path]?.judge?.next_constraint || latestDebateByPath[path]?.coach?.hypothesis;
                return (
                  <div key={`action-${path}`} className="border-r border-[var(--border)] bg-white px-2 py-2 leading-5 last:border-r-0">
                    <p className="line-clamp-2">{action || "\u6682\u65e0\u884c\u52a8\u5efa\u8bae"}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

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
          <div className="mb-2 flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => applyQuickPrompt(prompt)}
                disabled={sending}
                className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-xs font-medium text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {prompt}
              </button>
            ))}
          </div>
          {failedPaths.length > 0 ? (
            <p className="mb-2 text-xs text-[var(--danger)]">
              {`\u68c0\u6d4b\u5230 ${failedPaths.length} \u6761\u5931\u8d25\u8def\u5f84\uff0c\u53ef\u70b9\u51fb\u4e0a\u65b9\u201c\u91cd\u8bd5\u5931\u8d25\u8def\u5f84\u201d\u5feb\u901f\u6062\u590d\u3002`}
            </p>
          ) : null}
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
              className="rounded-lg bg-[var(--accent-strong)] px-4 py-2 text-sm font-medium text-white transition-all hover:-translate-y-px hover:shadow-[0_6px_14px_rgba(0,102,204,0.24)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              {sending ? "\u751f\u6210\u4e2d..." : "\u53d1\u9001"}
            </button>
          </div>
          <p className="mt-2 text-xs text-[var(--text-muted)]">{"\u6309 Enter \u53d1\u9001\uff0cShift + Enter \u6362\u884c"}</p>
          {(debateRounds.length > 0 || judgeRounds.length > 0) && (
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {`\u5df2\u6536\u96c6\u8fa9\u8bba ${debateRounds.length} \u6761\uff0c\u88c1\u5224 ${judgeRounds.length} \u6761`}
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
