import { ChatWindow } from "@/components/ChatWindow";
import { LoginButton } from "@/components/LoginButton";
import { UserProfile } from "@/components/UserProfile";

export default function Home() {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f9fafb_0%,#f4f6f9_100%)] px-4 py-8 md:px-8">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_8px_24px_rgba(17,24,39,0.05)] md:p-6">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">IssueLab x SecondMe</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">{"\u5b66\u672f\u9053\u8def\u63a2\u7d22\u53f0"}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-muted)]">
                {"\u5728\u540c\u4e00\u95ee\u9898\u4e0b\u5e76\u884c\u8c03\u7528\u591a\u4e2a SecondMe \u8f68\u8ff9\u5206\u8eab\uff0c\u5bf9\u6bd4\u89c2\u70b9\u5dee\u5f02\uff0c\u8bb0\u5f55\u8ba8\u8bba\u8fc7\u7a0b\uff0c\u5e76\u6c89\u6dc0\u4e3a\u53ef\u8ffd\u6eaf\u7b14\u8bb0\u3002"}
              </p>
            </div>
            <LoginButton />
          </div>
        </section>

        <section className="grid grid-cols-[320px,minmax(0,1fr)] gap-4">
          <aside className="sticky top-8 h-fit space-y-5">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_6px_18px_rgba(17,24,39,0.04)]">
              <UserProfile />
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_6px_18px_rgba(17,24,39,0.04)]">
              <h2 className="text-sm font-semibold">{"\u4f7f\u7528\u5efa\u8bae"}</h2>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--text-muted)]">
                <li>{"\u5148\u63d0\u51fa\u4e00\u4e2a\u660e\u786e\u95ee\u9898\uff0c\u518d\u89c2\u5bdf\u4e09\u6761\u8def\u5f84\u7684\u5dee\u5f02\u3002"}</li>
                <li>{"\u5173\u6ce8\u5de6\u4fa7\u72b6\u6001\uff0c\u7b49\u5f85\u8def\u5f84\u7cfb\u7edf\u4e0e\u8fa9\u8bba\u8f6e\u6b21\u5b8c\u6210\u3002"}</li>
                <li>{"\u5bf9\u6bd4\u7ed3\u679c\u540e\u7ee7\u7eed\u8ffd\u95ee\uff0c\u9010\u6b65\u6536\u655b\u5230\u53ef\u6267\u884c\u7ed3\u8bba\u3002"}</li>
              </ul>
            </div>
          </aside>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_8px_24px_rgba(17,24,39,0.05)] md:p-5">
            <ChatWindow />
          </div>
        </section>
      </main>
    </div>
  );
}
