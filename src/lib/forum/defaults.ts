type JsonRecord = Record<string, unknown>;

const DEFAULT_MIN_CONTENT_LENGTH = 12;
const DEFAULT_MAX_REPLY_LENGTH = 1200;

function parsePositiveInt(raw: string | undefined, fallback: number) {
  const value = Number(raw ?? "");
  if (!Number.isFinite(value)) return fallback;
  const rounded = Math.floor(value);
  if (rounded < 1) return fallback;
  return rounded;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown, max = 3) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, max);
}

function pickString(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const found = readString(record[key]);
    if (found) return found;
  }
  return "";
}

function pickStringArray(record: JsonRecord, keys: string[], max = 3) {
  for (const key of keys) {
    const found = readStringArray(record[key], max);
    if (found.length > 0) return found;
  }
  return [];
}

function truncateText(input: string, maxLength: number) {
  if (input.length <= maxLength) return input;
  const trimmed = input.slice(0, Math.max(0, maxLength - 11)).trimEnd();
  return `${trimmed}\n\n[内容已摘要]`;
}

function stripMention(content: string, mentionTarget: string) {
  if (!mentionTarget) return content;
  const escaped = mentionTarget.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return content.replace(new RegExp(escaped, "gi"), "").trim();
}

export function isLowValueForumContent(content: string, mentionTarget: string) {
  const minLength = parsePositiveInt(process.env.FORUM_MIN_CONTENT_LENGTH, DEFAULT_MIN_CONTENT_LENGTH);
  const cleaned = stripMention(content, mentionTarget).replace(/\s+/g, " ").trim();
  if (!cleaned) return true;
  if (cleaned.length < minLength) return true;
  if (/^(https?:\/\/\S+)(\s+https?:\/\/\S+)*$/i.test(cleaned)) return true;
  if (/^[\p{P}\p{S}\d\s]+$/u.test(cleaned)) return true;
  return false;
}

export function sanitizeForumErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : "unknown error";
  const noBearer = raw.replace(/Bearer\s+[A-Za-z0-9\-._~+/=]+/gi, "Bearer ***");
  const noTokenKv = noBearer.replace(/(token|secret|password)=([^\s&]+)/gi, "$1=***");
  return noTokenKv.slice(0, 220);
}

export function buildStructuredForumReply(params: {
  synthesis: JsonRecord;
  evaluation: JsonRecord;
}) {
  const summary =
    pickString(params.synthesis, ["summary", "conclusion"]) || "建议先采用稳健且可执行的路径，确保能在 1-2 周内产生可验证结果。";
  const recommendation =
    pickString(params.synthesis, ["recommendation", "next_action"]) || "先做小范围验证，再按结果扩展投入。";
  const steps = pickStringArray(params.synthesis, ["next_steps", "steps", "action_items"], 3);
  const risks = pickStringArray(params.evaluation, ["major_risks", "risks", "risk_points"], 2);
  const score = pickString(params.evaluation, ["score", "overall_score"]);
  const needInfo = "请补充你的时间窗口、当前资源和成功标准，我可以给出更精确版本。";

  const lines = [
    `结论：${summary}`,
    "建议步骤：",
    ...(steps.length > 0 ? steps.map((item, index) => `${index + 1}. ${item}`) : [`1. ${recommendation}`]),
    `风险提醒：${risks.join("；") || "主要风险是目标过大导致执行分散，建议先收敛范围。"}${
      score ? `（当前评估分：${score}）` : ""
    }`,
    `需要你补充的信息：${needInfo}`,
  ];

  const maxLength = parsePositiveInt(process.env.FORUM_MAX_REPLY_LENGTH, DEFAULT_MAX_REPLY_LENGTH);
  return truncateText(lines.join("\n"), maxLength);
}

export function buildFallbackForumReply() {
  const fallback = [
    "结论：已收到你的问题，当前正在用默认流程处理。",
    "建议步骤：",
    "1. 请补充你的目标、时间窗口和资源约束。",
    "2. 请说明你希望优先优化的指标（速度/质量/风险）。",
    "3. 我会基于补充信息给出三路径对比建议。",
    "风险提醒：当前信息不足，直接执行可能导致方向偏差。",
    "需要你补充的信息：问题背景、现状数据、可接受成本。",
  ].join("\n");

  const maxLength = parsePositiveInt(process.env.FORUM_MAX_REPLY_LENGTH, DEFAULT_MAX_REPLY_LENGTH);
  return truncateText(fallback, maxLength);
}
