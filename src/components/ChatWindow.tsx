"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

type ChatItem = { role: "user" | "assistant"; content: string };
type SseEvent = { event: string; data: string };
type PathKey = "radical" | "conservative" | "cross_domain";
type StatusValue = "idle" | "running" | "done" | "failed" | "partial_failed";

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
  radical: "Radical",
  conservative: "Conservative",
  cross_domain: "Cross-domain",
};
const QUICK_PROMPTS = [
  "Compare risk differences across the three paths.",
  "Give me a practical 30-day execution plan.",
  "Re-rank paths by feasibility only.",
];

type StageMeta = {
  label: string;
  detail: string;
  progress: number;
  tone: "neutral" | "running" | "done" | "warn";
};

const DEFAULT_ASSISTANT_TEXT = "Welcome to multi-path debate mode. Enter your question to start.";
const RUNNING_ASSISTANT_TEXT = "Running multi-round debate. Please wait...";
const REQUEST_FAILED_TEXT = "Request failed. Please retry later.";
const EXEC_FAILED_TEXT = "Execution failed. Please retry.";
const NETWORK_FAILED_TEXT = "Network error. Please retry later.";
const MAX_ROUND_LOGS = 120;

function pushCapped<T>(list: T[], item: T, max = MAX_ROUND_LOGS): T[] {
  if (list.length < max) return [...list, item];
  return [...list.slice(list.length - max + 1), item];
}

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
      label: "Done",
      detail: type === "path" ? "Path outputs are ready" : "Debate rounds are completed",
      progress: 100,
      tone: "done",
    };
  }

  if (status === "partial_failed" || status === "failed") {
    return {
      label: "Partially failed",
      detail: "You can inspect existing output or retry failed paths",
      progress: 75,
      tone: "warn",
    };
  }

  if (status === "running") {
    return {
      label: "Running",
      detail: type === "path" ? "Generating path hypotheses" : "Cross-validating path viewpoints",
      progress: 50,
      tone: "running",
    };
  }

  return {
    label: "Idle",
    detail: type === "path" ? "Will start after submission" : "Will start after path stage",
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
  const [pathStatus, setPathStatus] = useState<StatusValue>("idle");
  const [perPathStatus, setPerPathStatus] = useState<Record<PathKey, StatusValue>>({
    radical: "idle",
    conservative: "idle",
    cross_domain: "idle",
  });
  const [debateStatus, setDebateStatus] = useState<StatusValue>("idle");
  const [pathReports, setPathReports] = useState<Partial<Record<PathKey, PathReport>>>({});
  const [synthesis, setSynthesis] = useState<Synthesis | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [debateRounds, setDebateRounds] = useState<DebateRoundItem[]>([]);
  const [judgeRounds, setJudgeRounds] = useState<JudgeRoundItem[]>([]);
  const [messages, setMessages] = useState<ChatItem[]>([
    { role: "assistant", content: DEFAULT_ASSISTANT_TEXT },
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

  const resetDebateState = () => {
    setPathStatus("running");
    setPerPathStatus({
      radical: "running",
      conservative: "running",
      cross_domain: "running",
    });
    setDebateStatus("idle");
    setPathReports({});
    setSynthesis(null);
    setEvaluation(null);
    setDebateRounds([]);
    setJudgeRounds([]);
  };

  const submitMessage = async (rawMessage: string) => {
    if (sending) return;
    const message = rawMessage.trim();
    if (!message) return;

    setInput("");
    setSending(true);
    resetDebateState();
    setMessages((prev) => [...prev, { role: "user", content: message }, { role: "assistant", content: RUNNING_ASSISTANT_TEXT }]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sessionId }),
      });

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({}));
        replaceLastAssistant(typeof payload?.message === "string" ? payload.message : REQUEST_FAILED_TEXT);
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

            if (parsed.event === "path_status") {
              if (
                typeof payload.path === "string" &&
                PATH_KEYS.includes(payload.path as PathKey) &&
                typeof payload.status === "string"
              ) {
                setPerPathStatus((prev) => ({
                  ...prev,
                  [payload.path as PathKey]: payload.status as StatusValue,
                }));
                continue;
              }
              if (typeof payload.status === "string") {
                setPathStatus(payload.status as StatusValue);
              }
              continue;
            }

            if (parsed.event === "debate_status" && typeof payload.status === "string") {
              setDebateStatus(payload.status as StatusValue);
              continue;
            }

            if (parsed.event === "debate_round") {
              const item = payload as unknown as DebateRoundItem;
              if (item.path && typeof item.round === "number") {
                setDebateRounds((prev) => pushCapped(prev, item));
              }
              continue;
            }

            if (parsed.event === "judge_round") {
              const item = payload as unknown as JudgeRoundItem;
              if (item.path && typeof item.round === "number") {
                setJudgeRounds((prev) => pushCapped(prev, item));
              }
              continue;
            }

            if (parsed.event === "path_report") {
              const item = payload as unknown as { path?: PathKey; report?: PathReport; error?: string };
              if (item.path) {
                const path = item.path as PathKey;
                setPathReports((prev) => ({
                  ...prev,
                  [path]: item.report ?? { path, error: item.error },
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
              replaceLastAssistant(typeof payload.message === "string" ? payload.message : EXEC_FAILED_TEXT);
              continue;
            }

            if (parsed.event === "delta" && typeof payload.text === "string") {
              appendToLastAssistant(payload.text);
            }
          } catch {
            // Ignore malformed payload.
          }
        }
      }
    } catch {
      replaceLastAssistant(NETWORK_FAILED_TEXT);
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
    if (report?.error) return { path, text: `Failed: ${report.error}` };
    if (summary) return { path, text: summary };
    return { path, text: "No result yet" };
  });

  const applyQuickPrompt = (prompt: string) => {
    if (sending) return;
    setInput(prompt);
  };

  const retryFailedPaths = async () => {
    if (sending || failedPaths.length === 0) return;
    const target = failedPaths.map((path) => PATH_LABELS[path]).join(", ");
    await submitMessage(`Retry only failed paths: ${target}. Keep successful paths unchanged.`);
  };

  const regenerateComparison = async () => {
    if (sending) return;
    await submitMessage("Regenerate a 3-path comparison for conclusion, risk, and action with ranking.");
  };

  return (
    <div className="grid h-[72dvh] min-h-[580px] grid-cols-[288px_1fr] gap-3">
      <aside className="overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm">
        <div className="space-y-3">
          <div className="rounded-md border border-[var(--border)] bg-white p-2.5">
            <p className="text-xs font-medium text-[var(--text-muted)]">Progress overview</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${overallProgress}%` }} />
            </div>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{`Current progress ${overallProgress}%`}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className={`rounded-full border px-2 py-1 text-xs ${badgeClass(pathStage.tone)}`}>Path: {pathStage.label}</span>
              <span className={`rounded-full border px-2 py-1 text-xs ${badgeClass(debateStage.tone)}`}>Debate: {debateStage.label}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{pathStage.detail}</p>
            <p className="text-xs leading-5 text-[var(--text-muted)]">{debateStage.detail}</p>
          </div>

          <div>
            <p className="text-xs text-[var(--text-muted)]">Path runtime status</p>
            {PATH_KEYS.map((path) => (
              <p key={`status-${path}`} className="text-xs">{PATH_LABELS[path]}: {perPathStatus[path]}</p>
            ))}
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Path summary</p>
            {PATH_KEYS.map((path) => {
              const report = pathReports[path];
              const summary = report?.final_hypothesis || report?.hypothesis;
              return (
                <div key={path} className="mt-2 rounded-md border border-[var(--border)] bg-white p-2.5">
                  <p className="text-xs font-medium text-[var(--text-muted)]">{PATH_LABELS[path]}</p>
                  <p className="mt-1 line-clamp-2 text-sm">{report?.error ? `Failed: ${report.error}` : summary || "Waiting for result..."}</p>
                  {typeof report?.confidence === "number" ? <p className="mt-1 text-xs text-[var(--text-muted)]">{`Confidence ${report.confidence}`}</p> : null}
                </div>
              );
            })}
          </div>

          {synthesis?.summary ? (
            <div className="rounded-md border border-[var(--border)] bg-white p-2.5">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Synthesis</p>
              <p className="mt-1 text-sm leading-6">{synthesis.summary}</p>
              {synthesis.recommendation ? <p className="mt-1 text-xs text-[var(--text-muted)]">Recommendation: {synthesis.recommendation}</p> : null}
            </div>
          ) : null}

          {typeof evaluation?.score === "number" ? (
            <div className="rounded-md border border-[var(--border)] bg-white p-2.5">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Evaluation score</p>
              <p className="mt-1 text-sm">{evaluation.score}</p>
            </div>
          ) : null}
        </div>
      </aside>

      <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border)] bg-white px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold tracking-tight">Trajectory chat</h2>
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-xs text-[var(--text-muted)]">
              {sessionId ? `Session ${sessionId.slice(0, 8)}...` : "New session"}
            </span>
          </div>
        </div>

        <div className="border-b border-[var(--border)] bg-white px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Path difference matrix</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={retryFailedPaths}
                disabled={sending || failedPaths.length === 0}
                className="rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-2.5 py-1 text-xs font-medium text-[var(--danger)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Retry failed paths
              </button>
              <button
                type="button"
                onClick={regenerateComparison}
                disabled={sending}
                className="rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-medium text-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Regenerate comparison
              </button>
            </div>
          </div>

          <div className="mt-2 overflow-hidden rounded-md border border-[var(--border)]">
            <div className="grid grid-cols-[120px_1fr_1fr_1fr] bg-[var(--surface-2)] text-xs font-medium text-[var(--text-muted)]">
              <div className="border-r border-[var(--border)] px-2 py-1.5">Dimension</div>
              {PATH_KEYS.map((path) => (
                <div key={`head-${path}`} className="border-r border-[var(--border)] px-2 py-1.5 last:border-r-0">{PATH_LABELS[path]}</div>
              ))}
            </div>

            <div className="grid grid-cols-[120px_1fr_1fr_1fr] border-t border-[var(--border)] text-xs">
              <div className="border-r border-[var(--border)] bg-white px-2 py-2 font-medium">Conclusion</div>
              {pathSummaries.map((item) => (
                <div key={`summary-${item.path}`} className="border-r border-[var(--border)] bg-white px-2 py-2 leading-5 last:border-r-0">
                  <p className="line-clamp-2">{item.text}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-[120px_1fr_1fr_1fr] border-t border-[var(--border)] text-xs">
              <div className="border-r border-[var(--border)] bg-white px-2 py-2 font-medium">Risk</div>
              {PATH_KEYS.map((path) => {
                const judgeGap = latestJudgeByPath[path]?.judge?.critical_gap;
                const err = pathReports[path]?.error;
                const text = err ? `Failed: ${err}` : judgeGap || "No explicit risk delta";
                return (
                  <div key={`risk-${path}`} className="border-r border-[var(--border)] bg-white px-2 py-2 leading-5 last:border-r-0">
                    <p className="line-clamp-2">{text}</p>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-[120px_1fr_1fr_1fr] border-t border-[var(--border)] text-xs">
              <div className="border-r border-[var(--border)] bg-white px-2 py-2 font-medium">Action</div>
              {PATH_KEYS.map((path) => {
                const action = latestJudgeByPath[path]?.judge?.next_constraint || latestDebateByPath[path]?.coach?.hypothesis;
                return (
                  <div key={`action-${path}`} className="border-r border-[var(--border)] bg-white px-2 py-2 leading-5 last:border-r-0">
                    <p className="line-clamp-2">{action || "No action recommendation"}</p>
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
              {`Detected ${failedPaths.length} failed path(s). Use \"Retry failed paths\" to recover quickly.`}
            </p>
          ) : null}

          <div className="flex gap-2">
            <label htmlFor="chat-input" className="sr-only">Input message</label>
            <textarea
              id="chat-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onInputKeyDown}
              disabled={sending}
              rows={2}
              aria-label="Chat input"
              placeholder="Example: If I switch to a cross-disciplinary path, what capability gap matters most in 3 years?"
              className="flex-1 resize-none rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition-shadow focus:shadow-[0_0_0_2px_var(--accent-soft)] disabled:cursor-not-allowed disabled:bg-[var(--surface-2)]"
            />
            <button
              type="submit"
              disabled={sending}
              aria-busy={sending}
              className="rounded-lg bg-[var(--accent-strong)] px-4 py-2 text-sm font-medium text-white transition-all hover:-translate-y-px hover:shadow-[0_6px_14px_rgba(0,102,204,0.24)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              {sending ? "Generating..." : "Send"}
            </button>
          </div>

          <p className="mt-2 text-xs text-[var(--text-muted)]">Press Enter to send, Shift + Enter for newline</p>
          {(debateRounds.length > 0 || judgeRounds.length > 0) && (
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {`Collected debate ${debateRounds.length} entries, judge ${judgeRounds.length} entries`}
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
