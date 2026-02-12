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
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">Academic Path Explorer</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-muted)]">
                Run multiple SecondMe trajectories on one question, compare differences, keep the debate trail,
                and convert outcomes into traceable notes.
              </p>
            </div>
            <LoginButton />
          </div>
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[320px,minmax(0,1fr)]">
          <aside className="space-y-5 xl:sticky xl:top-8 xl:h-fit">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
              <UserProfile />
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
              <h2 className="text-sm font-semibold">Tips</h2>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--text-muted)]">
                <li>Start with one precise question, then compare all three path outputs.</li>
                <li>Watch the left status panel until path and debate stages complete.</li>
                <li>Continue follow-up prompts to converge on an actionable conclusion.</li>
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
