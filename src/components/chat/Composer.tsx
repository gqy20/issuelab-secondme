import { type FormEvent, type KeyboardEvent, type RefObject } from "react";
import { QUICK_PROMPTS, type PathKey } from "./shared";

type ComposerProps = {
  formRef: RefObject<HTMLFormElement | null>;
  textAreaRef: RefObject<HTMLTextAreaElement | null>;
  input: string;
  sending: boolean;
  failedPaths: PathKey[];
  debateRoundsCount: number;
  judgeRoundsCount: number;
  onSubmit: (event: FormEvent) => Promise<void>;
  onInputChange: (value: string) => void;
  onInputKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onApplyQuickPrompt: (prompt: string) => void;
};

export function Composer({
  formRef,
  textAreaRef,
  input,
  sending,
  failedPaths,
  debateRoundsCount,
  judgeRoundsCount,
  onSubmit,
  onInputChange,
  onInputKeyDown,
  onApplyQuickPrompt,
}: ComposerProps) {
  return (
    <form ref={formRef} onSubmit={(event) => void onSubmit(event)} className="border-t border-[var(--border)] bg-[linear-gradient(180deg,rgba(20,31,52,0.78)_0%,rgba(15,24,40,0.82)_100%)] p-4">
      <div className="mb-3 flex flex-wrap gap-2">
        {QUICK_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onApplyQuickPrompt(prompt)}
            disabled={sending}
            className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-xs font-medium text-[var(--text-muted)] transition-all hover:-translate-y-px hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {prompt}
          </button>
        ))}
      </div>

      {failedPaths.length > 0 ? (
        <p className="mb-2 text-xs text-[var(--danger)]">{`检测到 ${failedPaths.length} 条失败路径，可点击“重试失败路径”快速恢复。`}</p>
      ) : null}

      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[rgba(9,14,25,0.9)] p-2 shadow-[var(--shadow-soft)] md:p-3">
        <div className="flex gap-2">
          <label htmlFor="chat-input" className="sr-only">输入消息</label>
          <textarea
            ref={textAreaRef}
            id="chat-input"
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={onInputKeyDown}
            disabled={sending}
            rows={2}
            aria-label="聊天输入框"
            placeholder="例如：如果我走跨学科方向，三年后最关键的能力差异是什么？"
            className="flex-1 resize-none rounded-[var(--radius-sm)] border border-[var(--border)] bg-[rgba(11,17,29,0.82)] px-3 py-2 text-sm outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)] disabled:cursor-not-allowed disabled:bg-[var(--surface-2)]"
          />
          <button
            type="submit"
            disabled={sending}
            aria-busy={sending}
            className="rounded-[var(--radius-sm)] bg-[linear-gradient(180deg,var(--accent)_0%,var(--accent-strong)_100%)] px-4 py-2 text-sm font-semibold text-white transition-all hover:-translate-y-px hover:shadow-[0_8px_18px_rgba(13,94,215,0.28)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none"
          >
            {sending ? (
              <span className="inline-flex items-center gap-2">
                <span className="loader-ring" />
                执行中
                <span className="typing-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </span>
            ) : (
              "发送"
            )}
          </button>
        </div>
        <p className="mt-2 text-xs text-[var(--text-muted)]">按 Enter 发送，Shift + Enter 换行</p>
        {(debateRoundsCount > 0 || judgeRoundsCount > 0) && (
          <p className="mt-1 text-xs text-[var(--text-muted)]">{`已收集辩论 ${debateRoundsCount} 条，裁判 ${judgeRoundsCount} 条`}</p>
        )}
      </div>
    </form>
  );
}

