import { ChatWindow } from "@/components/ChatWindow";
import { LoginButton } from "@/components/LoginButton";
import { UserProfile } from "@/components/UserProfile";

export default function Home() {
  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_420px_at_72%_-16%,#d9e8ff_0%,rgba(217,232,255,0)_65%),linear-gradient(180deg,#f7f9fc_0%,#f2f6fb_100%)] px-4 py-8 md:px-8">
      <main className="mx-auto w-full max-w-[1440px]">
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[312px_1fr]">
          <aside className="sticky top-8 h-fit space-y-4">
            <div className="rounded-2xl border border-[var(--border)] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-5 shadow-[0_14px_32px_rgba(13,94,215,0.12)]">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">IssueLab x SecondMe</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">学术道路探索台</h1>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                在同一问题下并行调用多个 SecondMe 轨迹分身，对比观点差异，记录讨论过程，并沉淀为可追溯笔记。
              </p>
              <p className="mt-3 inline-flex items-center rounded-full border border-[var(--accent)] bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-medium text-[var(--accent-strong)]">
                多路径辩论模式
              </p>
              <div className="mt-4">
                <LoginButton />
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_3px_10px_rgba(15,23,42,0.05)]">
              <UserProfile />
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_3px_10px_rgba(15,23,42,0.05)]">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">使用建议</h2>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--text-muted)]">
                <li>先提出一个明确问题，再观察三条路径的差异。</li>
                <li>关注左侧状态，等待路径系统与辩论轮次完成。</li>
                <li>对比结果后继续追问，逐步收敛到可执行结论。</li>
              </ul>
            </div>
          </aside>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_20px_36px_rgba(15,23,42,0.09)] md:p-5">
            <ChatWindow />
          </div>
        </section>
      </main>
    </div>
  );
}
