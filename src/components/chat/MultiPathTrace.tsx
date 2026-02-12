import {
  PATH_KEYS,
  PATH_LABELS,
  STATUS_LABELS,
  pathBadgeClass,
  type DebateRoundItem,
  type JudgeRoundItem,
  type PathKey,
  type StatusValue,
} from "./shared";

type MultiPathTraceProps = {
  sending: boolean;
  perPathStatus: Record<PathKey, StatusValue>;
  debateRounds: DebateRoundItem[];
  judgeRounds: JudgeRoundItem[];
};

function shortText(text?: string, fallback = "暂无信息") {
  if (!text) return fallback;
  const trimmed = text.trim();
  if (trimmed.length <= 90) return trimmed;
  return `${trimmed.slice(0, 90)}...`;
}

export function MultiPathTrace({
  sending,
  perPathStatus,
  debateRounds,
  judgeRounds,
}: MultiPathTraceProps) {
  return (
    <div className="border-b border-[var(--border)] bg-[linear-gradient(180deg,rgba(15,23,38,0.95)_0%,rgba(13,20,35,0.9)_100%)] px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">多路径交流明细</p>
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-xs text-[var(--text-muted)]">
          <span className={`execution-dot ${sending ? "running" : ""}`} />
          {sending ? "正在推演回合" : "等待下一轮输入"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 xl:grid-cols-3">
        {PATH_KEYS.map((path) => {
          const lastDebate = [...debateRounds].reverse().find((item) => item.path === path);
          const lastJudge = [...judgeRounds].reverse().find((item) => item.path === path);
          const status = perPathStatus[path];

          return (
            <div key={`trace-${path}`} className="panel-enter rounded-[var(--radius-sm)] border border-[var(--border)] bg-[rgba(10,16,30,0.6)] p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className={`rounded-full border px-2 py-1 text-xs ${pathBadgeClass(path)}`}>{PATH_LABELS[path]}</span>
                <span className="text-xs text-[var(--text-muted)]">{STATUS_LABELS[status]}</span>
              </div>

              <div className={`mt-2 rounded-md border border-[var(--border)] bg-[rgba(15,23,38,0.7)] p-2 ${status === "running" ? "shimmer-run" : ""}`}>
                <p className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">最新回合</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {lastDebate?.round ? `Round ${lastDebate.round}` : "尚未开始"}
                </p>

                <p className="mt-2 text-[11px] uppercase tracking-wide text-[var(--text-muted)]">路径假设</p>
                <p className="mt-1 text-xs leading-5">{shortText(lastDebate?.coach?.hypothesis)}</p>

                <p className="mt-2 text-[11px] uppercase tracking-wide text-[var(--text-muted)]">SecondMe 响应</p>
                <p className="mt-1 text-xs leading-5">{shortText(lastDebate?.secondme)}</p>

                <p className="mt-2 text-[11px] uppercase tracking-wide text-[var(--text-muted)]">裁判结论</p>
                <p className="mt-1 text-xs leading-5">{shortText(lastJudge?.judge?.critical_gap)}</p>

                <p className="mt-2 text-[11px] uppercase tracking-wide text-[var(--text-muted)]">下一约束</p>
                <p className="mt-1 text-xs leading-5">{shortText(lastJudge?.judge?.next_constraint)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
