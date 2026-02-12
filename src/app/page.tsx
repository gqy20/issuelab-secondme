import { ChatWindow } from "@/components/ChatWindow";
import { LoginButton } from "@/components/LoginButton";
import { UserProfile } from "@/components/UserProfile";

export default function Home() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8,#f7f4ee_45%,#f2efe8)] px-4 py-8 md:px-8">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm md:p-6">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-sm text-[var(--accent)]">IssueLab x SecondMe</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">学术道路探索台</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-muted)]">
                在同一问题下并行调用多个 SecondMe 轨迹分身，对比观点差异，记录讨论过程，并沉淀为可追溯笔记。
              </p>
            </div>
            <LoginButton />
          </div>
        </section>

        <section className="grid grid-cols-1 gap-5 lg:grid-cols-[320px,minmax(0,1fr)]">
          <aside className="space-y-5 lg:sticky lg:top-8 lg:h-fit">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
              <UserProfile />
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
              <h2 className="text-sm font-semibold">使用建议</h2>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--text-muted)]">
                <li>先提出一个明确问题，再观察三条路径的差异。</li>
                <li>关注左侧状态，等待路径系统与辩论轮次完成。</li>
                <li>对比结果后继续追问，逐步收敛到可执行结论。</li>
              </ul>
            </div>
          </aside>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm md:p-5">
            <ChatWindow />
          </div>
        </section>
      </main>
    </div>
  );
}
