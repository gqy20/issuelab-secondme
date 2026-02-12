import {
  pathBadgeClass,
  PATH_KEYS,
  PATH_LABELS,
  type DebateRoundItem,
  type JudgeRoundItem,
  type PathKey,
  type PathReport,
} from "./shared";

type PathSummary = { path: PathKey; text: string };

type PathMatrixProps = {
  sending: boolean;
  failedPaths: PathKey[];
  hasPathOutput: boolean;
  pathSummaries: PathSummary[];
  latestDebateByPath: Partial<Record<PathKey, DebateRoundItem>>;
  latestJudgeByPath: Partial<Record<PathKey, JudgeRoundItem>>;
  pathReports: Partial<Record<PathKey, PathReport>>;
  onRetryFailedPaths: () => Promise<void>;
  onRegenerateComparison: () => Promise<void>;
};

export function PathMatrix({
  sending,
  failedPaths,
  hasPathOutput,
  pathSummaries,
  latestDebateByPath,
  latestJudgeByPath,
  pathReports,
  onRetryFailedPaths,
  onRegenerateComparison,
}: PathMatrixProps) {
  return (
    <div className="border-b border-[var(--border)] bg-[linear-gradient(180deg,rgba(18,28,46,0.9)_0%,rgba(15,24,40,0.88)_100%)] px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">路径差异矩阵</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void onRetryFailedPaths()}
            disabled={sending || failedPaths.length === 0}
            className="rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-2.5 py-1 text-xs font-medium text-[var(--danger)] transition-colors hover:bg-[#4b1215] disabled:cursor-not-allowed disabled:opacity-50"
          >
            重试失败路径
          </button>
          <button
            type="button"
            onClick={() => void onRegenerateComparison()}
            disabled={sending}
            className="rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--accent-strong)] transition-colors hover:bg-[#18344d] disabled:cursor-not-allowed disabled:opacity-50"
          >
            重新生成对比
          </button>
        </div>
      </div>

      {hasPathOutput ? (
        <div className="panel-enter mt-2 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border)] bg-[rgba(10,16,30,0.35)]">
          <div className="grid grid-cols-[120px_1fr_1fr_1fr] bg-[rgba(25,40,64,0.74)] text-xs font-medium text-[var(--text-muted)]">
            <div className="border-r border-[var(--border)] px-2 py-1.5">维度</div>
            {PATH_KEYS.map((path) => (
              <div key={`head-${path}`} className={`border-r border-[var(--border)] px-2 py-1.5 last:border-r-0 ${pathBadgeClass(path)}`}>
                {PATH_LABELS[path]}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-[120px_1fr_1fr_1fr] border-t border-[var(--border)] text-xs">
            <div className="border-r border-[var(--border)] bg-[rgba(14,21,35,0.66)] px-2 py-2 font-medium">结论差异</div>
            {pathSummaries.map((item) => (
              <div key={`summary-${item.path}`} className="border-r border-[var(--border)] bg-[rgba(14,21,35,0.66)] px-2 py-2 leading-5 last:border-r-0">
                <p className="line-clamp-2">{item.text}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-[120px_1fr_1fr_1fr] border-t border-[var(--border)] text-xs">
            <div className="border-r border-[var(--border)] bg-[rgba(14,21,35,0.66)] px-2 py-2 font-medium">风险差异</div>
            {PATH_KEYS.map((path) => {
              const judgeGap = latestJudgeByPath[path]?.judge?.critical_gap;
              const err = pathReports[path]?.error;
              const text = err ? `失败：${err}` : judgeGap || "暂无显式风险差异";
              return (
                <div key={`risk-${path}`} className="border-r border-[var(--border)] bg-[rgba(14,21,35,0.66)] px-2 py-2 leading-5 last:border-r-0">
                  <p className="line-clamp-2">{text}</p>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-[120px_1fr_1fr_1fr] border-t border-[var(--border)] text-xs">
            <div className="border-r border-[var(--border)] bg-[rgba(14,21,35,0.66)] px-2 py-2 font-medium">行动建议</div>
            {PATH_KEYS.map((path) => {
              const action = latestJudgeByPath[path]?.judge?.next_constraint || latestDebateByPath[path]?.coach?.hypothesis;
              return (
                <div key={`action-${path}`} className="border-r border-[var(--border)] bg-[rgba(14,21,35,0.66)] px-2 py-2 leading-5 last:border-r-0">
                  <p className="line-clamp-2">{action || "暂无行动建议"}</p>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="panel-enter mt-2 rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] bg-[rgba(11,17,29,0.58)] px-3 py-2 text-xs text-[var(--text-muted)]">
          还没有可对比内容。请先发送一个问题，系统会生成三路径差异矩阵。
        </div>
      )}
    </div>
  );
}

