import {
  badgeClass,
  pathBadgeClass,
  PATH_KEYS,
  PATH_LABELS,
  STATUS_LABELS,
  type Evaluation,
  type PathKey,
  type PathReport,
  type StageMeta,
  type StatusValue,
  type Synthesis,
} from "./shared";

type PathSummary = { path: PathKey; text: string };

type StatusRailProps = {
  overallProgress: number;
  pathStage: StageMeta;
  debateStage: StageMeta;
  isAllPathIdle: boolean;
  perPathStatus: Record<PathKey, StatusValue>;
  pathReports: Partial<Record<PathKey, PathReport>>;
  pathSummaries: PathSummary[];
  hasPathOutput: boolean;
  synthesis: Synthesis | null;
  evaluation: Evaluation | null;
};

export function StatusRail({
  overallProgress,
  pathStage,
  debateStage,
  isAllPathIdle,
  perPathStatus,
  pathReports,
  pathSummaries,
  hasPathOutput,
  synthesis,
  evaluation,
}: StatusRailProps) {
  return (
    <aside className="overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(20,30,48,0.85)_0%,rgba(16,24,40,0.7)_100%)] p-3 text-sm">
      <div className="space-y-3">
        <div className="panel-enter rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] p-2.5 shadow-[var(--shadow-soft)]">
          <p className="text-xs font-medium text-[var(--text-muted)]">流程总览</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-900/45">
            <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500" style={{ width: `${overallProgress}%` }} />
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{`当前进度 ${overallProgress}%`}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className={`rounded-full border px-2 py-1 text-xs ${badgeClass(pathStage.tone)}`}>路径：{pathStage.label}</span>
            <span className={`rounded-full border px-2 py-1 text-xs ${badgeClass(debateStage.tone)}`}>辩论：{debateStage.label}</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{pathStage.detail}</p>
          <p className="text-xs leading-5 text-[var(--text-muted)]">{debateStage.detail}</p>
        </div>

        <div className="panel-enter rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] p-2.5 shadow-[var(--shadow-soft)]">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">路径状态</p>
          {isAllPathIdle ? (
            <p className="mt-2 text-xs text-[var(--text-muted)]">发送首条问题后开始运行</p>
          ) : (
            <div className="mt-2 space-y-2">
              {PATH_KEYS.map((path) => (
                <span key={`status-${path}`} className={`inline-flex rounded-full border px-2 py-1 text-xs ${pathBadgeClass(path)}`}>
                  {PATH_LABELS[path]}：{STATUS_LABELS[perPathStatus[path]]}
                </span>
              ))}
            </div>
          )}
        </div>

        {hasPathOutput ? (
          <div className="panel-enter">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">路径摘要</p>
            {pathSummaries.map((item) => {
              const report = pathReports[item.path];
              return (
                <div key={item.path} className={`mt-2 rounded-[var(--radius-sm)] border bg-[var(--surface-2)] p-2.5 shadow-[var(--shadow-soft)] ${pathBadgeClass(item.path)}`}>
                  <p className="text-xs font-medium text-[var(--text-muted)]">{PATH_LABELS[item.path]}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-[var(--foreground)]">{item.text === "暂无结果" ? "等待结果..." : item.text}</p>
                  {typeof report?.confidence === "number" ? (
                    <p className="mt-1 text-xs text-[var(--text-muted)]">{`置信度 ${report.confidence}`}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="panel-enter rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs leading-5 text-[var(--text-muted)]">
            首次提问后，这里会展示每条路径的阶段状态和摘要。
          </div>
        )}

        {synthesis?.summary ? (
          <div className="panel-enter rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] p-2.5 shadow-[var(--shadow-soft)]">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">综合结论</p>
            <p className="mt-1 text-sm leading-6">{synthesis.summary}</p>
            {synthesis.recommendation ? <p className="mt-1 text-xs text-[var(--text-muted)]">建议：{synthesis.recommendation}</p> : null}
          </div>
        ) : null}

        {typeof evaluation?.score === "number" ? (
          <div className="panel-enter rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] p-2.5 shadow-[var(--shadow-soft)]">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">评估分</p>
            <p className="mt-1 text-sm">{evaluation.score}</p>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

