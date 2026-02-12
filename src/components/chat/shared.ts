export type ChatItem = { role: "user" | "assistant"; content: string };
export type SseEvent = { event: string; data: string };
export type PathKey = "radical" | "conservative" | "cross_domain";
export type StatusValue = "idle" | "running" | "done" | "failed" | "partial_failed";

export type PathReport = {
  path: PathKey;
  final_hypothesis?: string;
  hypothesis?: string;
  confidence?: number;
  error?: string;
};

export type Synthesis = { summary?: string; recommendation?: string };
export type Evaluation = { score?: number };

export type DebateRoundItem = {
  path: PathKey;
  round: number;
  coach?: { hypothesis?: string };
  secondme?: string;
  error?: string;
};

export type JudgeRoundItem = {
  path: PathKey;
  round: number;
  judge?: {
    round_score?: number;
    critical_gap?: string;
    next_constraint?: string;
    verdict?: string;
  };
  error?: string;
};

export type StageMeta = {
  label: string;
  detail: string;
  progress: number;
  tone: "neutral" | "running" | "done" | "warn";
};

export const PATH_KEYS: PathKey[] = ["radical", "conservative", "cross_domain"];
export const PATH_LABELS: Record<PathKey, string> = {
  radical: "激进路径",
  conservative: "稳健路径",
  cross_domain: "跨域路径",
};
export const STATUS_LABELS: Record<StatusValue, string> = {
  idle: "待开始",
  running: "进行中",
  done: "已完成",
  failed: "失败",
  partial_failed: "部分失败",
};

export const QUICK_PROMPTS = [
  "请对比三条路径在风险上的核心差别",
  "基于当前结果给出 30 天行动计划",
  "只按可落地性重新排序并说明原因",
];

export const DEFAULT_ASSISTANT_TEXT = "欢迎进入多路径讨论区，输入问题开始探索。";
export const RUNNING_ASSISTANT_TEXT = "正在进行多路径生成与辩论，请稍候...";
export const REQUEST_FAILED_TEXT = "请求失败，请稍后重试。";
export const EXEC_FAILED_TEXT = "执行失败，请重试。";
export const NETWORK_FAILED_TEXT = "网络异常，请稍后重试。";
export const MAX_ROUND_LOGS = 120;

export function pushCapped<T>(list: T[], item: T, max = MAX_ROUND_LOGS): T[] {
  if (list.length < max) return [...list, item];
  return [...list.slice(list.length - max + 1), item];
}

export function parseSseBlock(block: string): SseEvent | null {
  const lines = block.split(/\r?\n/);
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }

  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}

export function statusToStage(status: string, type: "path" | "debate"): StageMeta {
  if (status === "done") {
    return {
      label: "已完成",
      detail: type === "path" ? "路径结果已产出" : "辩论轮次已结束",
      progress: 100,
      tone: "done",
    };
  }

  if (status === "partial_failed" || status === "failed") {
    return {
      label: "部分失败",
      detail: "可查看已有结果或重试失败路径",
      progress: 75,
      tone: "warn",
    };
  }

  if (status === "running") {
    return {
      label: "进行中",
      detail: type === "path" ? "正在生成多路径观点" : "正在交叉辩论与校验",
      progress: 50,
      tone: "running",
    };
  }

  return {
    label: "待开始",
    detail: type === "path" ? "提问后自动开始" : "路径阶段完成后开始",
    progress: 10,
    tone: "neutral",
  };
}

export function badgeClass(tone: StageMeta["tone"]) {
  if (tone === "done") return "border-emerald-200/70 bg-emerald-400/20 text-emerald-100";
  if (tone === "running") return "status-running border-sky-200/70 bg-sky-400/20 text-sky-100";
  if (tone === "warn") return "border-amber-200/70 bg-amber-400/20 text-amber-100";
  return "border-slate-200/40 bg-slate-300/10 text-slate-200";
}

export function pathBadgeClass(path: PathKey) {
  if (path === "radical") return "border-[var(--path-radical)] bg-[var(--path-radical-soft)] text-[var(--path-radical)]";
  if (path === "conservative") {
    return "border-[var(--path-conservative)] bg-[var(--path-conservative-soft)] text-[var(--path-conservative)]";
  }
  return "border-[var(--path-cross)] bg-[var(--path-cross-soft)] text-[var(--path-cross)]";
}

export function pickLatestByPath<T extends { path: PathKey }>(items: T[]) {
  const latest: Partial<Record<PathKey, T>> = {};
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (!latest[item.path]) latest[item.path] = item;
  }
  return latest;
}
