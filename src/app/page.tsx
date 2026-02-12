import { ChatWindow } from "@/components/ChatWindow";
import { LoginButton } from "@/components/LoginButton";
import { UserProfile } from "@/components/UserProfile";

export default function Home() {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f9fafb_0%,#f4f6f9_100%)] px-4 py-8 md:px-8">
      <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-4">
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_8px_24px_rgba(17,24,39,0.05)] md:p-6">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">IssueLab x SecondMe</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">学术道路探索台</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-muted)]">
                在同一问题下并行调用多个 SecondMe 轨迹分身，对比观点差异，记录讨论过程，并沉淀为可追溯笔记。
              </p>
            </div>
            <div className="shrink-0">
              <LoginButton />
            </div>
          </div>
        </section>

        <section className="grid grid-cols-[248px_1fr] gap-4">
          <aside className="sticky top-8 h-fit space-y-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 shadow-[0_2px_8px_rgba(17,24,39,0.03)]">
              <UserProfile />
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 shadow-[0_2px_8px_rgba(17,24,39,0.03)]">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">使用建议</h2>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--text-muted)]">
                <li>先提出一个明确问题，再观察三条路径的差异。</li>
                <li>关注左侧状态，等待路径系统与辩论轮次完成。</li>
                <li>对比结果后继续追问，逐步收敛到可执行结论。</li>
              </ul>
            </div>
          </aside>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_14px_30px_rgba(17,24,39,0.09)] md:p-5">
            <ChatWindow />
          </div>
        </section>
      </main>
    </div>
  );
}
