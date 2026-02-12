"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { requestApi } from "@/lib/http";

type ChatItem = { role: "user" | "assistant"; content: string };

export function ChatWindow() {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<ChatItem[]>([
    {
      role: "assistant",
      content: "欢迎进入轨迹讨论区。输入你的研究问题即可开始。",
    },
  ]);

  const formRef = useRef<HTMLFormElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;

    const message = input.trim();
    if (!message) return;

    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setInput("");
    setSending(true);

    try {
      const result = await requestApi<{ reply?: string; sessionId?: string }>(
        "/api/chat",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, sessionId }),
        },
        30000,
      );

      if (result.data?.sessionId) {
        setSessionId(result.data.sessionId);
      }

      const reply =
        result.data?.reply ??
        (result.code === 401
          ? "你还没有登录，请先点击上方登录按钮。"
          : result.message ?? "暂时没有获取到回复。");
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "请求失败，请检查本地服务日志。" },
      ]);
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (!messageListRef.current) return;
    messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
  }, [messages, sending]);

  const onInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    formRef.current?.requestSubmit();
  };

  return (
    <div className="flex h-[62dvh] min-h-[420px] max-h-[560px] flex-col sm:h-[560px]">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">轨迹对话</h2>
        <span className="text-xs text-slate-500">
          {sessionId ? `会话 ${sessionId.slice(0, 6)}...` : "新会话"}
        </span>
      </div>

      <div
        ref={messageListRef}
        className="flex-1 space-y-3 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3"
      >
        {messages.map((item, idx) => (
          <div
            key={`${item.role}-${idx}`}
            className={`max-w-[88%] rounded-xl px-3 py-2 text-sm leading-6 ${
              item.role === "user"
                ? "ml-auto bg-[var(--accent)] text-white"
                : "bg-white text-slate-700"
            }`}
          >
            {item.content}
          </div>
        ))}
      </div>

      <form ref={formRef} onSubmit={onSubmit} className="mt-3 flex gap-2">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onInputKeyDown}
          disabled={sending}
          rows={2}
          placeholder="例如：如果我走跨学科路线，三年后最关键的能力差是什么？"
          className="flex-1 resize-none rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition-shadow focus:shadow-[0_0_0_2px_var(--accent-soft)] disabled:cursor-not-allowed disabled:bg-slate-100"
        />
        <button
          type="submit"
          disabled={sending}
          className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {sending ? "发送中" : "发送"}
        </button>
      </form>
    </div>
  );
}
