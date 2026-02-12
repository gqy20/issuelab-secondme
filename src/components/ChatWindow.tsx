"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Composer } from "./chat/Composer";
import { MessagePane } from "./chat/MessagePane";
import { MultiPathTrace } from "./chat/MultiPathTrace";
import { PathMatrix } from "./chat/PathMatrix";
import { StatusRail } from "./chat/StatusRail";
import {
  DEFAULT_ASSISTANT_TEXT,
  EXEC_FAILED_TEXT,
  NETWORK_FAILED_TEXT,
  parseSseBlock,
  PATH_KEYS,
  PATH_LABELS,
  pickLatestByPath,
  pushCapped,
  REQUEST_FAILED_TEXT,
  RUNNING_ASSISTANT_TEXT,
  statusToStage,
  type ChatItem,
  type DebateRoundItem,
  type Evaluation,
  type JudgeRoundItem,
  type PathKey,
  type PathReport,
  type StatusValue,
  type Synthesis,
} from "./chat/shared";

type PathSummary = { path: PathKey; text: string };

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
  const [messages, setMessages] = useState<ChatItem[]>([{ role: "assistant", content: DEFAULT_ASSISTANT_TEXT }]);

  const formRef = useRef<HTMLFormElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

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
    setPerPathStatus({ radical: "running", conservative: "running", cross_domain: "running" });
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
                setPerPathStatus((prev) => ({ ...prev, [payload.path as PathKey]: payload.status as StatusValue }));
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
                setPathReports((prev) => ({ ...prev, [path]: item.report ?? { path, error: item.error } }));
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
  const isAllPathIdle = PATH_KEYS.every((path) => perPathStatus[path] === "idle");

  const pathSummaries = useMemo<PathSummary[]>(
    () =>
      PATH_KEYS.map((path) => {
        const report = pathReports[path];
        const summary = report?.final_hypothesis || report?.hypothesis;
        if (report?.error) return { path, text: `失败：${report.error}` };
        if (summary) return { path, text: summary };
        return { path, text: "暂无结果" };
      }),
    [pathReports],
  );

  const hasPathOutput = useMemo(() => pathSummaries.some((item) => item.text !== "暂无结果"), [pathSummaries]);
  const isExecuting =
    sending || pathStatus === "running" || debateStatus === "running" || PATH_KEYS.some((path) => perPathStatus[path] === "running");
  const isInitialState =
    messages.length === 1 &&
    messages[0]?.role === "assistant" &&
    messages[0]?.content === DEFAULT_ASSISTANT_TEXT &&
    !sending;

  const applyQuickPrompt = (prompt: string) => {
    if (sending) return;
    setInput(prompt);
    textAreaRef.current?.focus();
  };

  const retryFailedPaths = async () => {
    if (sending || failedPaths.length === 0) return;
    const target = failedPaths.map((path) => PATH_LABELS[path]).join("、");
    await submitMessage(`请仅重试失败路径：${target}。其余路径沿用已有结果。`);
  };

  const regenerateComparison = async () => {
    if (sending) return;
    await submitMessage("请基于当前会话重新输出三路径差异对比（结论、风险、行动建议）并给出优先级。");
  };

  return (
    <div className="grid min-h-[640px] grid-cols-1 gap-3 lg:grid-cols-[320px_1fr] xl:h-[78dvh] xl:max-h-[900px]">
      <StatusRail
        overallProgress={overallProgress}
        pathStage={pathStage}
        debateStage={debateStage}
        isAllPathIdle={isAllPathIdle}
        perPathStatus={perPathStatus}
        pathReports={pathReports}
        pathSummaries={pathSummaries}
        hasPathOutput={hasPathOutput}
        synthesis={synthesis}
        evaluation={evaluation}
      />

      <section className="flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(17,25,40,0.9)_0%,rgba(12,18,32,0.9)_100%)]">
        <div className="border-b border-[var(--border)] bg-[linear-gradient(120deg,rgba(20,31,52,0.75)_0%,rgba(17,25,40,0.72)_100%)] px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold tracking-tight">轨迹对话</h2>
              <p className="text-xs text-[var(--text-muted)]">先提问，再对比三条路径的结论与风险差异。</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-xs text-[var(--text-muted)]">
                <span className={`execution-dot ${isExecuting ? "running" : ""}`} />
                {isExecuting ? "系统执行中" : "系统待命"}
              </span>
              <span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-xs text-[var(--text-muted)]">
                {sessionId ? `会话 ${sessionId.slice(0, 8)}...` : "新会话"}
              </span>
            </div>
          </div>
        </div>

        <PathMatrix
          sending={sending}
          failedPaths={failedPaths}
          hasPathOutput={hasPathOutput}
          pathSummaries={pathSummaries}
          latestDebateByPath={latestDebateByPath}
          latestJudgeByPath={latestJudgeByPath}
          pathReports={pathReports}
          onRetryFailedPaths={retryFailedPaths}
          onRegenerateComparison={regenerateComparison}
        />

        <MultiPathTrace
          sending={sending}
          perPathStatus={perPathStatus}
          debateRounds={debateRounds}
          judgeRounds={judgeRounds}
        />

        <MessagePane messageListRef={messageListRef} isInitialState={isInitialState} messages={messages} sending={sending} />

        <div className="shrink-0">
          <Composer
            formRef={formRef}
            textAreaRef={textAreaRef}
            input={input}
            sending={sending}
            failedPaths={failedPaths}
            debateRoundsCount={debateRounds.length}
            judgeRoundsCount={judgeRounds.length}
            onSubmit={onSubmit}
            onInputChange={setInput}
            onInputKeyDown={onInputKeyDown}
            onApplyQuickPrompt={applyQuickPrompt}
          />
        </div>
      </section>
    </div>
  );
}

