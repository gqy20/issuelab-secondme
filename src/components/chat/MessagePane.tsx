import { type RefObject } from "react";
import { MarkdownContent } from "./MarkdownContent";
import { type ChatItem } from "./shared";

type MessagePaneProps = {
  messageListRef: RefObject<HTMLDivElement | null>;
  isInitialState: boolean;
  messages: ChatItem[];
  sending: boolean;
};

export function MessagePane({ messageListRef, isInitialState, messages, sending }: MessagePaneProps) {
  return (
    <div
      ref={messageListRef}
      className={`flex-1 overflow-y-auto bg-[linear-gradient(180deg,rgba(11,17,29,0.8)_0%,rgba(10,15,26,0.9)_100%)] p-4 ${
        isInitialState ? "grid place-items-center" : "space-y-3"
      }`}
    >
      {isInitialState ? (
        <div className="panel-enter w-full max-w-2xl rounded-[var(--radius-md)] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(19,31,50,0.88)_0%,rgba(16,24,40,0.88)_100%)] p-8 text-center shadow-[var(--shadow-mid)]">
          <p className="font-display text-xl font-semibold tracking-tight text-white">欢迎进入多路径讨论区</p>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">提一个明确问题，系统会自动生成三条路径并给出差异对比。</p>
        </div>
      ) : (
        messages.map((item, idx) => (
          <div
            key={`${item.role}-${idx}`}
            className={`panel-enter max-w-[88%] rounded-lg px-3 py-2 text-sm leading-6 md:max-w-[80%] ${
              item.role === "user"
                ? "ml-auto bg-[var(--accent-strong)] text-white"
                : "border border-[var(--border)] bg-[var(--surface-2)] text-[var(--foreground)] shadow-[var(--shadow-soft)]"
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
  );
}
