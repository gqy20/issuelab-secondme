"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

type ChatItem = { role: "user" | "assistant"; content: string };
type SseEvent = { event: string; data: string };

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

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;

    const message = input.trim();
    if (!message) return;

    setInput("");
    setSending(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: message },
      { role: "assistant", content: "" },
    ]);

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
            const payload = JSON.parse(parsed.data) as {
              text?: string;
              message?: string;
              sessionId?: string;
            };

            if (parsed.event === "session" && payload.sessionId) {
              setSessionId(payload.sessionId);
              continue;
            }

            if (parsed.event === "delta" && payload.text) {
              appendToLastAssistant(payload.text);
              continue;
            }

            if (parsed.event === "error") {
              appendToLastAssistant(
                payload.message ?? "聊天流中断，请稍后再试。",
              );
              continue;
            }

            if (parsed.event === "done") {
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
        <span className="text-xs text-[var(--text-muted)]">
          {sessionId ? `会话 ${sessionId.slice(0, 6)}...` : "新会话"}
        </span>
      </div>

      <div
        ref={messageListRef}
        aria-live="polite"
        aria-label="聊天消息列表"
        className="flex-1 space-y-3 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3"
      >
        {messages.map((item, idx) => (
          <div
            key={`${item.role}-${idx}`}
            className={`max-w-[88%] rounded-xl px-3 py-2 text-sm leading-6 ${
              item.role === "user"
                ? "ml-auto bg-[var(--accent)] text-white"
                : "bg-white text-[var(--foreground)]"
            }`}
          >
            {item.content || (sending && idx === messages.length - 1 ? "..." : "")}
          </div>
        ))}
      </div>

      <form ref={formRef} onSubmit={onSubmit} className="mt-3 flex gap-2">
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
          placeholder="例如：如果我走跨学科路线，三年后最关键的能力差是什么？"
          className="flex-1 resize-none rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition-shadow focus:shadow-[0_0_0_2px_var(--accent-soft)] disabled:cursor-not-allowed disabled:bg-[var(--surface-2)]"
        />
        <button
          type="submit"
          disabled={sending}
          aria-busy={sending}
          className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {sending ? "生成中" : "发送"}
        </button>
      </form>
    </div>
  );
}

