"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
  radical: "激进路径",
  conservative: "稳健路径",
  cross_domain: "跨域路径",
};
const STATUS_LABELS: Record<StatusValue, string> = {
  idle: "待开始",
  running: "进行中",
  done: "已完成",
  failed: "失败",
  partial_failed: "部分失败",
};
const QUICK_PROMPTS = [
  "请对比三条路径在风险上的核心差别",
  "基于当前结果给出 30 天行动计划",
  "只按可落地性重新排序并说明原因",
];

type StageMeta = {
  label: string;
  detail: string;
  progress: number;
  tone: "neutral" | "running" | "done" | "warn";
};

const DEFAULT_ASSISTANT_TEXT = "欢迎进入多路径讨论区，输入问题开始探索。";
const RUNNING_ASSISTANT_TEXT = "正在进行多路径生成与辩论，请稍候...";
const REQUEST_FAILED_TEXT = "请求失败，请稍后重试。";
const EXEC_FAILED_TEXT = "执行失败，请重试。";
const NETWORK_FAILED_TEXT = "网络异常，请稍后重试。";
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
      label: "已完成",
      detail: type === "path" ? "路径结果已产出" : "辩论轮次已结束",
      progress: 100,
      tone: "done",
    };
  }

  if (status === "partial_failed" || status === "failed") {
    return {
      label: "部分失败",
      detail: "可查看已有结果或重试失败路径",
      progress: 75,
      tone: "warn",
    };
  }

  if (status === "running") {
    return {
      label: "进行中",
      detail: type === "path" ? "正在生成多路径观点" : "正在交叉辩论与校验",
      progress: 50,
      tone: "running",
    };
  }

  return {
    label: "待开始",
    detail: type === "path" ? "提问后自动开始" : "路径阶段完成后开始",
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

function pathBadgeClass(path: PathKey) {
  if (path === "radical") return "border-[var(--path-radical)] bg-[var(--path-radical-soft)] text-[var(--path-radical)]";
  if (path === "conservative") {
    return "border-[var(--path-conservative)] bg-[var(--path-conservative-soft)] text-[var(--path-conservative)]";
  }
  return "border-[var(--path-cross)] bg-[var(--path-cross-soft)] text-[var(--path-cross)]";
}

function pickLatestByPath<T extends { path: PathKey }>(items: T[]) {
  const latest: Partial<Record<PathKey, T>> = {};
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (!latest[item.path]) latest[item.path] = item;
  }
  return latest;
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
        li: ({ children }) => <li>{children}</li>,
        h1: ({ children }) => <h1 className="mb-2 text-base font-semibold">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-2 text-sm font-semibold">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-2 text-sm font-semibold">{children}</h3>,
        blockquote: ({ children }) => (
          <blockquote className="mb-2 border-l-2 border-slate-300 pl-3 text-[var(--text-muted)]">{children}</blockquote>
        ),
        code: ({ className, children, ...props }) => {
          const isInline = !className?.includes("language-");
          if (isInline) {
            return (
              <code className="rounded bg-slate-100 px-1 py-0.5 text-[13px] text-slate-800" {...props}>
                {children}
              </code>
            );
          }
          return (
            <code className="block overflow-x-auto rounded-md bg-slate-900 p-3 text-[13px] text-slate-100" {...props}>
              {children}
            </code>
          );
        },
        pre: ({ children }) => <pre className="mb-2 last:mb-0">{children}</pre>,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-[var(--accent-strong)] underline underline-offset-2"
          >
            {children}
          </a>
        ),
        table: ({ children }) => (
          <div className="mb-2 overflow-x-auto last:mb-0">
            <table className="min-w-full border-collapse text-left text-[13px]">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-slate-100">{children}</thead>,
        th: ({ children }) => <th className="border border-slate-300 px-2 py-1 font-semibold">{children}</th>,
        td: ({ children }) => <td className="border border-slate-300 px-2 py-1 align-top">{children}</td>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
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

  const pathSummaries = useMemo(
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

  const hasPathOutput = useMemo(
    () => pathSummaries.some((item) => item.text !== "暂无结果"),
    [pathSummaries],
  );
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
    <div className="grid min-h-[620px] grid-cols-1 gap-3 lg:grid-cols-[300px_1fr] xl:h-[76dvh] xl:max-h-[860px]">
      <aside className="overflow-y-auto rounded-xl border border-[var(--border)] bg-[linear-gradient(180deg,#fbfdff_0%,#f7faff_100%)] p-3 text-sm">
        <div className="space-y-3">
          <div className="rounded-lg border border-[var(--border)] bg-white p-2.5 shadow-[0_4px_12px_rgba(15,23,42,0.04)]">
            <p className="text-xs font-medium text-[var(--text-muted)]">流程总览</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${overallProgress}%` }} />
            </div>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{`当前进度 ${overallProgress}%`}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className={`rounded-full border px-2 py-1 text-xs ${badgeClass(pathStage.tone)}`}>路径：{pathStage.label}</span>
              <span className={`rounded-full border px-2 py-1 text-xs ${badgeClass(debateStage.tone)}`}>辩论：{debateStage.label}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{pathStage.detail}</p>
            <p className="text-xs leading-5 text-[var(--text-muted)]">{debateStage.detail}</p>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-white p-2.5 shadow-[0_4px_12px_rgba(15,23,42,0.04)]">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">路径状态</p>
            {isAllPathIdle ? (
              <p className="mt-2 text-xs text-[var(--text-muted)]">发送首条问题后开始运行</p>
            ) : (
              <div className="mt-2 space-y-2">
                {PATH_KEYS.map((path) => (
                  <span key={`status-${path}`} className={`inline-flex rounded-full border px-2 py-1 text-xs ${pathBadgeClass(path)}`}>
                    {PATH_LABELS[path]}：{STATUS_LABELS[perPathStatus[path]]}
                  </span>
                ))}
              </div>
            )}
          </div>

          {hasPathOutput ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">路径摘要</p>
              {PATH_KEYS.map((path) => {
                const report = pathReports[path];
                const summary = report?.final_hypothesis || report?.hypothesis;
                return (
                  <div key={path} className={`mt-2 rounded-lg border bg-white p-2.5 shadow-[0_4px_12px_rgba(15,23,42,0.04)] ${pathBadgeClass(path)}`}>
                    <p className="text-xs font-medium text-[var(--text-muted)]">{PATH_LABELS[path]}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-[var(--foreground)]">
                      {report?.error ? `失败：${report.error}` : summary || "等待结果..."}
                    </p>
                    {typeof report?.confidence === "number" ? (
                      <p className="mt-1 text-xs text-[var(--text-muted)]">{`置信度 ${report.confidence}`}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-[var(--border)] bg-white p-3 text-xs leading-5 text-[var(--text-muted)]">
              首次提问后，这里会展示每条路径的阶段状态和摘要。
            </div>
          )}

          {synthesis?.summary ? (
            <div className="rounded-lg border border-[var(--border)] bg-white p-2.5 shadow-[0_4px_12px_rgba(15,23,42,0.04)]">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">综合结论</p>
              <p className="mt-1 text-sm leading-6">{synthesis.summary}</p>
              {synthesis.recommendation ? (
                <p className="mt-1 text-xs text-[var(--text-muted)]">建议：{synthesis.recommendation}</p>
              ) : null}
            </div>
          ) : null}

          {typeof evaluation?.score === "number" ? (
            <div className="rounded-lg border border-[var(--border)] bg-white p-2.5 shadow-[0_4px_12px_rgba(15,23,42,0.04)]">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">评估分</p>
              <p className="mt-1 text-sm">{evaluation.score}</p>
            </div>
          ) : null}
        </div>
      </aside>

      <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border)] bg-[linear-gradient(180deg,#ffffff_0%,#f9fbff_100%)] px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">轨迹对话</h2>
              <p className="text-xs text-[var(--text-muted)]">先提问，再对比三条路径的结论与风险差异。</p>
            </div>
            <span className="rounded-full border border-[var(--border)] bg-white px-2.5 py-1 text-xs text-[var(--text-muted)]">
              {sessionId ? `会话 ${sessionId.slice(0, 8)}...` : "新会话"}
            </span>
          </div>
        </div>

        <div className="border-b border-[var(--border)] bg-[linear-gradient(180deg,#ffffff_0%,#f8faff_100%)] px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">路径差异矩阵</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={retryFailedPaths}
                disabled={sending || failedPaths.length === 0}
                className="rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-2.5 py-1 text-xs font-medium text-[var(--danger)] transition-colors hover:bg-[#ffe7e4] disabled:cursor-not-allowed disabled:opacity-50"
              >
                重试失败路径
              </button>
              <button
                type="button"
                onClick={regenerateComparison}
                disabled={sending}
                className="rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--accent-strong)] transition-colors hover:bg-[#d9e8ff] disabled:cursor-not-allowed disabled:opacity-50"
              >
                重新生成对比
              </button>
            </div>
          </div>

          {hasPathOutput ? (
            <div className="mt-2 overflow-hidden rounded-lg border border-[var(--border)]">
              <div className="grid grid-cols-[120px_1fr_1fr_1fr] bg-[var(--surface-2)] text-xs font-medium text-[var(--text-muted)]">
                <div className="border-r border-[var(--border)] px-2 py-1.5">维度</div>
                {PATH_KEYS.map((path) => (
                  <div
                    key={`head-${path}`}
                    className={`border-r border-[var(--border)] px-2 py-1.5 last:border-r-0 ${pathBadgeClass(path)}`}
                  >
                    {PATH_LABELS[path]}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-[120px_1fr_1fr_1fr] border-t border-[var(--border)] text-xs">
                <div className="border-r border-[var(--border)] bg-white px-2 py-2 font-medium">结论差异</div>
                {pathSummaries.map((item) => (
                  <div key={`summary-${item.path}`} className="border-r border-[var(--border)] bg-white px-2 py-2 leading-5 last:border-r-0">
                    <p className="line-clamp-2">{item.text}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-[120px_1fr_1fr_1fr] border-t border-[var(--border)] text-xs">
                <div className="border-r border-[var(--border)] bg-white px-2 py-2 font-medium">风险差异</div>
                {PATH_KEYS.map((path) => {
                  const judgeGap = latestJudgeByPath[path]?.judge?.critical_gap;
                  const err = pathReports[path]?.error;
                  const text = err ? `失败：${err}` : judgeGap || "暂无显式风险差异";
                  return (
                    <div key={`risk-${path}`} className="border-r border-[var(--border)] bg-white px-2 py-2 leading-5 last:border-r-0">
                      <p className="line-clamp-2">{text}</p>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-[120px_1fr_1fr_1fr] border-t border-[var(--border)] text-xs">
                <div className="border-r border-[var(--border)] bg-white px-2 py-2 font-medium">行动建议</div>
                {PATH_KEYS.map((path) => {
                  const action = latestJudgeByPath[path]?.judge?.next_constraint || latestDebateByPath[path]?.coach?.hypothesis;
                  return (
                    <div key={`action-${path}`} className="border-r border-[var(--border)] bg-white px-2 py-2 leading-5 last:border-r-0">
                      <p className="line-clamp-2">{action || "暂无行动建议"}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mt-2 rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-muted)]">
              还没有可对比内容。请先发送一个问题，系统会生成三路径差异矩阵。
            </div>
          )}
        </div>

        <div
          ref={messageListRef}
          className={`flex-1 overflow-y-auto bg-[linear-gradient(180deg,#f9fbff_0%,#f5f8fd_100%)] p-3 ${
            isInitialState ? "grid place-items-center" : "space-y-3"
          }`}
        >
          {isInitialState ? (
            <div className="w-full max-w-xl rounded-2xl border border-[var(--border)] bg-white/95 p-6 text-center shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
              <p className="text-sm font-semibold text-slate-900">欢迎进入多路径讨论区</p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                提一个明确问题，系统会自动生成三条路径并给出差异对比。
              </p>
            </div>
          ) : (
            messages.map((item, idx) => (
              <div
                key={`${item.role}-${idx}`}
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm leading-6 ${
                  item.role === "user"
                    ? "ml-auto bg-[var(--accent-strong)] text-white"
                    : "border border-[var(--border)] bg-white text-[var(--foreground)] shadow-[0_4px_10px_rgba(15,23,42,0.04)]"
                }`}
              >
                {item.role === "assistant" ? (
                  <MarkdownContent content={item.content || (sending && idx === messages.length - 1 ? "..." : "")} />
                ) : (
                  item.content || (sending && idx === messages.length - 1 ? "..." : "")
                )}
              </div>
            ))
          )}
        </div>

        <form ref={formRef} onSubmit={onSubmit} className="border-t border-[var(--border)] bg-[var(--surface)] p-3">
          <div className="mb-2 flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => applyQuickPrompt(prompt)}
                disabled={sending}
                className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-xs font-medium text-[var(--text-muted)] transition-all hover:-translate-y-px hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {prompt}
              </button>
            ))}
          </div>

          {failedPaths.length > 0 ? (
            <p className="mb-2 text-xs text-[var(--danger)]">
              {`检测到 ${failedPaths.length} 条失败路径，可点击“重试失败路径”快速恢复。`}
            </p>
          ) : null}

          <div className="flex gap-2">
            <label htmlFor="chat-input" className="sr-only">输入消息</label>
            <textarea
              ref={textAreaRef}
              id="chat-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onInputKeyDown}
              disabled={sending}
              rows={2}
              aria-label="聊天输入框"
              placeholder="例如：如果我走跨学科方向，三年后最关键的能力差异是什么？"
              className="flex-1 resize-none rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)] disabled:cursor-not-allowed disabled:bg-[var(--surface-2)]"
            />
            <button
              type="submit"
              disabled={sending}
              aria-busy={sending}
              className="rounded-lg bg-[linear-gradient(180deg,var(--accent)_0%,var(--accent-strong)_100%)] px-4 py-2 text-sm font-semibold text-white transition-all hover:-translate-y-px hover:shadow-[0_8px_18px_rgba(13,94,215,0.28)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              {sending ? "生成中..." : "发送"}
            </button>
          </div>

          <p className="mt-2 text-xs text-[var(--text-muted)]">按 Enter 发送，Shift + Enter 换行</p>
          {(debateRounds.length > 0 || judgeRounds.length > 0) && (
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {`已收集辩论 ${debateRounds.length} 条，裁判 ${judgeRounds.length} 条`}
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
