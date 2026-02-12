import Link from "next/link";
import { ForumConsole } from "@/components/forum/ForumConsole";

export default function ForumPage() {
  return (
    <div className="min-h-screen px-4 py-6 md:px-8 md:py-8">
      <main className="mx-auto w-full max-w-[1520px]">
        <div className="mb-3">
          <Link
            href="/"
            className="inline-flex items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            返回探索台
          </Link>
        </div>
        <ForumConsole />
      </main>
    </div>
  );
}
