import { ChatWindow } from "@/components/ChatWindow";
import { LoginButton } from "@/components/LoginButton";
import { UserProfile } from "@/components/UserProfile";

export default function Home() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8,#f7f4ee_45%,#f2efe8)] px-4 py-10 md:px-8">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
          <p className="text-sm text-[var(--accent)]">IssueLab x SecondMe</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">学术道路探索台</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--text-muted)]">
            在同一问题下并行调用多个 SecondMe 轨迹分身，对比观点差异，记录讨论过程，并沉淀为可追溯笔记。
          </p>
          <div className="mt-5">
            <LoginButton />
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-[340px,1fr]">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
            <UserProfile />
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
            <ChatWindow />
          </div>
        </section>
      </main>
    </div>
  );
}
