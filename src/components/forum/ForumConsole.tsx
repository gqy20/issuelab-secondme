"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { requestApi } from "@/lib/http";

type TaskStatus = "pending" | "running" | "done" | "failed";

type ForumTask = {
  id: string;
  status: TaskStatus;
  threadId: string;
  commentId: string;
  authorId?: string | null;
  content: string;
  attempts: number;
  nextRunAt: string;
  result?: unknown;
  createdAt: string;
  updatedAt: string;
};

type TaskListPayload = {
  page: number;
  pageSize: number;
  total: number;
  items: ForumTask[];
};

type MetricsPayload = {
  range: string;
  since: string;
  total: number;
  pending: number;
  running: number;
  done: number;
  failed: number;
};

const STATUS_OPTIONS: Array<{ value: "all" | TaskStatus; label: string }> = [
  { value: "all", label: "全部" },
  { value: "pending", label: "待处理" },
  { value: "running", label: "执行中" },
  { value: "done", label: "已完成" },
  { value: "failed", label: "失败" },
];

function statusClass(status: TaskStatus) {
  if (status === "done") return "border-emerald-300/70 bg-emerald-500/15 text-emerald-100";
  if (status === "running") return "border-sky-300/70 bg-sky-500/20 text-sky-100";
  if (status === "failed") return "border-rose-300/70 bg-rose-500/20 text-rose-100";
  return "border-slate-300/50 bg-slate-400/10 text-slate-100";
}

function shortText(text: string, max = 60) {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function toPrettyJson(value: unknown) {
  if (!value) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function ForumConsole() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<"all" | TaskStatus>("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const [tasks, setTasks] = useState<ForumTask[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize] = useState(20);
  const [selectedTask, setSelectedTask] = useState<ForumTask | null>(null);
  const [metrics, setMetrics] = useState<MetricsPayload | null>(null);

  const load = useCallback(
    async (options?: { quiet?: boolean }) => {
      const quiet = options?.quiet ?? false;
      if (quiet) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const query = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (status !== "all") query.set("status", status);
      if (q.trim()) query.set("q", q.trim());

      try {
        const [tasksRes, metricsRes] = await Promise.all([
          requestApi<TaskListPayload>(`/api/forum/tasks?${query.toString()}`, {
            cache: "no-store",
          }),
          requestApi<MetricsPayload>("/api/forum/metrics?range=24h", {
            cache: "no-store",
          }),
        ]);

        if (tasksRes.code !== 0) {
          setError(tasksRes.message ?? "任务列表读取失败");
          return;
        }

        if (metricsRes.code === 0 && metricsRes.data) {
          setMetrics(metricsRes.data);
        }

        const rows = tasksRes.data?.items ?? [];
        setTasks(rows);
        setTotal(tasksRes.data?.total ?? 0);
        setSelectedTask((prev) => {
          if (!prev) return rows[0] ?? null;
          return rows.find((item) => item.id === prev.id) ?? rows[0] ?? null;
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [page, pageSize, q, status],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => {
      void load({ quiet: true });
    }, 15000);
    return () => clearInterval(timer);
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const selectedResult = useMemo(
    () => toPrettyJson(selectedTask?.result),
    [selectedTask?.result],
  );

  const handleRetry = async (taskId: string) => {
    setRetryingId(taskId);
    const result = await requestApi<{ retried: boolean }>(
      `/api/forum/tasks/${taskId}/retry`,
      { method: "POST" },
    );
    setRetryingId(null);
    if (result.code !== 0) {
      setError(result.message ?? "重试失败");
      return;
    }
    await load({ quiet: true });
  };

  return (
    <div className="space-y-4">
      <header className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[linear-gradient(120deg,rgba(9,26,46,0.92)_0%,rgba(12,33,58,0.84)_50%,rgba(15,40,68,0.84)_100%)] p-5 shadow-[var(--shadow-soft)]">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.24em] text-[var(--accent)]">
          Forum Automation
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
          论坛任务控制台
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          查看论坛提及任务状态、失败原因和自动回复结果，支持失败任务快速重试。
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="24h 总任务" value={metrics?.total ?? 0} />
        <MetricCard label="待处理" value={metrics?.pending ?? 0} />
        <MetricCard label="执行中" value={metrics?.running ?? 0} />
        <MetricCard label="已完成" value={metrics?.done ?? 0} tone="done" />
        <MetricCard label="失败" value={metrics?.failed ?? 0} tone="failed" />
      </section>

      <section className="grid min-h-[560px] grid-cols-1 gap-3 xl:grid-cols-[1.25fr_1fr]">
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)]">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              value={q}
              onChange={(event) => {
                setPage(1);
                setQ(event.target.value);
              }}
              placeholder="搜索 threadId/commentId/content"
              className="min-w-[220px] flex-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
            <select
              value={status}
              onChange={(event) => {
                setPage(1);
                setStatus(event.target.value as "all" | TaskStatus);
              }}
              className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            >
              {STATUS_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void load({ quiet: true })}
              className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm font-medium hover:border-[var(--accent)]"
            >
              {refreshing ? "刷新中..." : "刷新"}
            </button>
          </div>

          {error ? (
            <p className="mb-2 text-sm text-[var(--danger)]">{error}</p>
          ) : null}

          <div className="max-h-[480px] overflow-y-auto rounded-md border border-[var(--border)]">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-[rgba(19,31,50,0.95)] text-xs uppercase text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2">状态</th>
                  <th className="px-3 py-2">线程</th>
                  <th className="px-3 py-2">评论</th>
                  <th className="px-3 py-2">尝试</th>
                  <th className="px-3 py-2">创建时间</th>
                  <th className="px-3 py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-[var(--text-muted)]">
                      加载中...
                    </td>
                  </tr>
                ) : tasks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-[var(--text-muted)]">
                      暂无任务
                    </td>
                  </tr>
                ) : (
                  tasks.map((task) => (
                    <tr
                      key={task.id}
                      className={`cursor-pointer border-t border-[var(--border)] hover:bg-[var(--surface-2)] ${
                        selectedTask?.id === task.id ? "bg-[rgba(83,177,253,0.12)]" : ""
                      }`}
                      onClick={() => setSelectedTask(task)}
                    >
                      <td className="px-3 py-2">
                        <span className={`rounded-full border px-2 py-1 text-xs ${statusClass(task.status)}`}>
                          {task.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{shortText(task.threadId, 14)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{shortText(task.commentId, 14)}</td>
                      <td className="px-3 py-2 text-xs">{task.attempts}</td>
                      <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
                        {formatTime(task.createdAt)}
                      </td>
                      <td className="px-3 py-2">
                        {task.status === "failed" ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleRetry(task.id);
                            }}
                            disabled={retryingId === task.id}
                            className="rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-2 py-1 text-xs font-medium text-[var(--danger)] disabled:opacity-60"
                          >
                            {retryingId === task.id ? "重试中" : "重试"}
                          </button>
                        ) : (
                          <span className="text-xs text-[var(--text-muted)]">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-[var(--text-muted)]">
            <p>{`共 ${total} 条，当前第 ${page}/${totalPages} 页`}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page <= 1}
                className="rounded-md border border-[var(--border)] px-2 py-1 disabled:opacity-50"
              >
                上一页
              </button>
              <button
                type="button"
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={page >= totalPages}
                className="rounded-md border border-[var(--border)] px-2 py-1 disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)]">
          <h2 className="font-display text-base font-semibold">任务详情</h2>
          {!selectedTask ? (
            <p className="mt-3 text-sm text-[var(--text-muted)]">
              请选择左侧任务查看详情。
            </p>
          ) : (
            <div className="mt-3 space-y-3 text-sm">
              <DetailRow label="任务 ID" value={selectedTask.id} mono />
              <DetailRow label="状态" value={selectedTask.status} />
              <DetailRow label="Thread" value={selectedTask.threadId} mono />
              <DetailRow label="Comment" value={selectedTask.commentId} mono />
              <DetailRow label="创建时间" value={formatTime(selectedTask.createdAt)} />
              <DetailRow label="下次执行" value={formatTime(selectedTask.nextRunAt)} />
              <DetailRow label="尝试次数" value={String(selectedTask.attempts)} />
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  提及内容
                </p>
                <div className="mt-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2 leading-6">
                  {selectedTask.content}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  执行结果
                </p>
                <pre className="mt-1 max-h-[240px] overflow-auto rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2 text-xs leading-5">
                  {selectedResult || "暂无结果"}
                </pre>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "done" | "failed";
}) {
  const toneClass =
    tone === "done"
      ? "border-emerald-300/50 bg-emerald-500/10"
      : tone === "failed"
        ? "border-rose-300/50 bg-rose-500/10"
        : "border-[var(--border)] bg-[var(--surface)]";
  return (
    <div className={`rounded-[var(--radius-md)] border p-3 shadow-[var(--shadow-soft)] ${toneClass}`}>
      <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
      <p className={`mt-1 ${mono ? "font-mono text-xs" : "text-sm"}`}>{value}</p>
    </div>
  );
}
