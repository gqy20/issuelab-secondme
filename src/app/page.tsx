import Link from "next/link";
import { ChatWindow } from "@/components/ChatWindow";
import { LoginButton } from "@/components/LoginButton";
import { UserProfile } from "@/components/UserProfile";

export default function Home() {
  return (
    <div className="min-h-screen px-4 py-6 md:px-8 md:py-8">
      <main className="mx-auto w-full max-w-[1520px]">
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          <aside className="space-y-4">
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[linear-gradient(120deg,rgba(9,26,46,0.92)_0%,rgba(12,33,58,0.84)_50%,rgba(15,40,68,0.84)_100%)] p-5 shadow-[var(--shadow-soft)] backdrop-blur-xl">
              <p className="font-display text-xs font-semibold uppercase tracking-[0.24em] text-[var(--accent)]">IssueLab x SecondMe</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">学术道路探索台</h1>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                以同一问题并行驱动三条推演路径，压缩探索时间，输出可执行结论。
              </p>
              <p className="mt-3 inline-flex items-center rounded-full border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1 text-xs font-medium text-[#d7f0ff]">
                Research Control Room
              </p>
              <div className="mt-3">
                <Link
                  href="/forum"
                  className="inline-flex items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  进入论坛控制台
                </Link>
              </div>
            </div>

            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)] backdrop-blur-xl">
              <LoginButton />
            </div>

            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)] backdrop-blur-xl">
              <UserProfile />
            </div>

            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm leading-6 text-[var(--text-muted)] shadow-[var(--shadow-soft)] backdrop-blur-xl">
              <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">使用节奏</p>
              <p className="mt-2">先输入明确问题，再查看三路径结论、风险和行动建议。</p>
              <p className="mt-2">结果出现后，继续追问关键分歧，直到收敛到可执行决策。</p>
            </div>
          </aside>

          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-mid)] backdrop-blur-xl md:p-4">
            <ChatWindow />
          </div>
        </section>
      </main>
    </div>
  );
}
