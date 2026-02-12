"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { requestApi } from "@/lib/http";

type PublishStatus = "pending" | "running" | "done" | "failed";

type PublishTask = {
  id: string;
  status: PublishStatus;
  threadId: string;
  commentId: string;
  content: string;
  attempts: number;
  nextRunAt: string;
  result?: unknown;
  createdAt: string;
  updatedAt: string;
};

type PublishListPayload = {
  page: number;
  pageSize: number;
  total: number;
  items: PublishTask[];
};

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function statusClass(status: PublishStatus) {
  if (status === "done") return "border-emerald-300/70 bg-emerald-500/15 text-emerald-100";
  if (status === "running") return "border-sky-300/70 bg-sky-500/20 text-sky-100";
  if (status === "failed") return "border-rose-300/70 bg-rose-500/20 text-rose-100";
  return "border-slate-300/50 bg-slate-400/10 text-slate-100";
}

function toPrettyJson(value: unknown) {
  if (!value) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function ManualPublishPanel() {
  const [threadId, setThreadId] = useState("");
  const [commentId, setCommentId] = useState("");
  const [content, setContent] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<PublishTask[]>([]);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    const response = await requestApi<PublishListPayload>("/api/forum/publish-tasks?page=1&pageSize=10", {
      cache: "no-store",
    });
    setLoading(false);

    if (response.code !== 0) {
      setError(response.message ?? "加载发布记录失败");
      return;
    }

    setTasks(response.data?.items ?? []);
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const response = await requestApi<PublishTask>(
      "/api/forum/publish",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          commentId,
          content,
        }),
      },
      20000,
    );

    setSubmitting(false);

    if (response.code !== 0) {
      setError(response.message ?? "提交失败");
      if (response.data) {
        setSuccess(`已记录失败任务：${response.data.id}`);
      }
      await loadTasks();
      return;
    }

    setSuccess(`提交成功，任务 ID：${response.data?.id ?? "-"}`);
    setContent("");
    await loadTasks();
  };

  const handleRetry = async (taskId: string) => {
    setRetryingId(taskId);
    setError(null);
    setSuccess(null);

    const response = await requestApi<PublishTask>(`/api/forum/publish-tasks/${taskId}/retry`, {
      method: "POST",
    });

    setRetryingId(null);

    if (response.code !== 0) {
      setError(response.message ?? "重试失败");
      return;
    }

    setSuccess(`重试成功，任务 ID：${response.data?.id ?? taskId}`);
    await loadTasks();
  };

  const latestResult = useMemo(() => {
    if (tasks.length === 0) return "";
    return toPrettyJson(tasks[0]?.result);
  }, [tasks]);

  return (
    <section className="mb-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)]">
      <h2 className="text-lg font-semibold text-white">手动提交到论坛（MVP）</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">输入 threadId/commentId/content，直接调用论坛回复接口。</p>

      <form onSubmit={(event) => void handleSubmit(event)} className="mt-3 grid gap-2 md:grid-cols-2">
        <input
          value={threadId}
          onChange={(event) => setThreadId(event.target.value)}
          placeholder="threadId"
          className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <input
          value={commentId}
          onChange={(event) => setCommentId(event.target.value)}
          placeholder="commentId"
          className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="回复内容"
          rows={4}
          className="md:col-span-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <div className="md:col-span-2 flex items-center gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md border border-[var(--accent)] bg-[var(--accent)]/15 px-3 py-2 text-sm font-medium text-[var(--accent)] disabled:opacity-60"
          >
            {submitting ? "提交中..." : "提交到论坛"}
          </button>
          <button
            type="button"
            onClick={() => void loadTasks()}
            className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
          >
            刷新记录
          </button>
        </div>
      </form>

      {error ? <p className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}
      {success ? <p className="mt-3 text-sm text-emerald-300">{success}</p> : null}

      <div className="mt-4 overflow-x-auto rounded-md border border-[var(--border)]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[rgba(19,31,50,0.95)] text-xs uppercase text-[var(--text-muted)]">
            <tr>
              <th className="px-3 py-2">状态</th>
              <th className="px-3 py-2">任务ID</th>
              <th className="px-3 py-2">thread/comment</th>
              <th className="px-3 py-2">尝试</th>
              <th className="px-3 py-2">创建时间</th>
              <th className="px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-5 text-center text-[var(--text-muted)]">
                  加载中...
                </td>
              </tr>
            ) : tasks.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-5 text-center text-[var(--text-muted)]">
                  暂无记录
                </td>
              </tr>
            ) : (
              tasks.map((task) => (
                <tr key={task.id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">
                    <span className={`rounded-full border px-2 py-1 text-xs ${statusClass(task.status)}`}>{task.status}</span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{task.id}</td>
                  <td className="px-3 py-2 font-mono text-xs">{task.threadId} / {task.commentId}</td>
                  <td className="px-3 py-2 text-xs">{task.attempts}</td>
                  <td className="px-3 py-2 text-xs text-[var(--text-muted)]">{formatTime(task.createdAt)}</td>
                  <td className="px-3 py-2">
                    {task.status === "failed" ? (
                      <button
                        type="button"
                        disabled={retryingId === task.id}
                        onClick={() => void handleRetry(task.id)}
                        className="rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-2 py-1 text-xs"
                      >
                        {retryingId === task.id ? "重试中..." : "重试"}
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

      <div className="mt-3">
        <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">最近一次结果</p>
        <pre className="mt-1 max-h-[180px] overflow-auto rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2 text-xs leading-5">
          {latestResult || "暂无结果"}
        </pre>
      </div>
    </section>
  );
}

