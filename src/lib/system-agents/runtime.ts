import type { AgentDefinition, OutputFormat, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { query } from "@anthropic-ai/claude-agent-sdk";
import path from "node:path";

export type JsonRecord = Record<string, unknown>;
export type PathType = "radical" | "conservative" | "cross_domain";

const DEFAULT_TIMEOUT_MS = 90000;
const DEFAULT_MAX_TURNS = 6;

type CoachOutput = {
  path: PathType;
  hypothesis: string;
  why: string;
  next_steps: string[];
  test_plan: string;
  risk_guardrail: string;
};

type SynthesisOutput = {
  summary: string;
  consensus: string[];
  disagreements: string[];
  recommendation: string;
};

type EvaluationOutput = {
  score: number;
  strengths: string[];
  weaknesses: string[];
  next_iteration: string[];
};

function getModelName() {
  return process.env.CLAUDE_AGENT_MODEL?.trim() || "sonnet";
}

function getMaxTurns() {
  const raw = process.env.CLAUDE_AGENT_MAX_TURNS;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) return DEFAULT_MAX_TURNS;
  return Math.floor(value);
}

function asObject(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function getClaudeCliPath() {
  const fromEnv = process.env.CLAUDE_CODE_EXECUTABLE_PATH?.trim();
  if (fromEnv) return fromEnv;

  // Vercel Node runtime commonly uses /var/task as cwd; local dev uses project cwd.
  return path.join(process.cwd(), "node_modules", "@anthropic-ai", "claude-agent-sdk", "cli.js");
}

async function runJsonTask<T extends JsonRecord>(params: {
  agentName: string;
  description: string;
  systemPrompt: string;
  userPrompt: string;
  schema: JsonRecord;
  timeoutMs?: number;
}): Promise<T> {
  const {
    agentName,
    description,
    systemPrompt,
    userPrompt,
    schema,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = params;

  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), timeoutMs);

  const outputFormat: OutputFormat = {
    type: "json_schema",
    schema,
  };

  const agentDef: AgentDefinition = {
    description,
    prompt: systemPrompt,
    model: "inherit",
    tools: [],
    maxTurns: getMaxTurns(),
  };

  let resultText = "";
  let structured: unknown;
  let lastError = "";

  try {
    const stream = query({
      prompt: userPrompt,
      options: {
        pathToClaudeCodeExecutable: getClaudeCliPath(),
        abortController,
        model: getModelName(),
        maxTurns: getMaxTurns(),
        outputFormat,
        tools: [],
        agent: agentName,
        agents: { [agentName]: agentDef },
        cwd: process.cwd(),
      },
    });

    for await (const msg of stream) {
      const message = msg as SDKMessage;
      if (message.type !== "result") continue;

      if (message.subtype === "success") {
        resultText = message.result ?? "";
        structured = message.structured_output;
      } else {
        lastError = (message.errors ?? []).join("; ");
      }
    }
  } finally {
    clearTimeout(timer);
  }

  const structuredObject = asObject(structured);
  if (structuredObject) {
    return structuredObject as T;
  }

  if (resultText) {
    try {
      const parsed = JSON.parse(resultText) as unknown;
      const object = asObject(parsed);
      if (object) return object as T;
    } catch {
      // fall through to final error.
    }
  }

  if (lastError.includes("Claude Code executable not found")) {
    throw new Error(
      `${lastError}. Set CLAUDE_CODE_EXECUTABLE_PATH or ensure @anthropic-ai/claude-agent-sdk is externalized in Next.js build.`,
    );
  }

  throw new Error(lastError || "Claude Agent SDK returned non-JSON result");
}

function coachSchema(): JsonRecord {
  return {
    type: "object",
    additionalProperties: false,
    required: ["path", "hypothesis", "why", "next_steps", "test_plan", "risk_guardrail"],
    properties: {
      path: { type: "string", enum: ["radical", "conservative", "cross_domain"] },
      hypothesis: { type: "string" },
      why: { type: "string" },
      next_steps: {
        type: "array",
        items: { type: "string" },
        minItems: 3,
        maxItems: 5,
      },
      test_plan: { type: "string" },
      risk_guardrail: { type: "string" },
    },
  };
}

function synthesisSchema(): JsonRecord {
  return {
    type: "object",
    additionalProperties: false,
    required: ["summary", "consensus", "disagreements", "recommendation"],
    properties: {
      summary: { type: "string" },
      consensus: { type: "array", items: { type: "string" } },
      disagreements: { type: "array", items: { type: "string" } },
      recommendation: { type: "string" },
    },
  };
}

function evaluationSchema(): JsonRecord {
  return {
    type: "object",
    additionalProperties: false,
    required: ["score", "strengths", "weaknesses", "next_iteration"],
    properties: {
      score: { type: "number", minimum: 0, maximum: 100 },
      strengths: { type: "array", items: { type: "string" } },
      weaknesses: { type: "array", items: { type: "string" } },
      next_iteration: { type: "array", items: { type: "string" } },
    },
  };
}

function getCoachSystemPrompt(path: PathType) {
  const labels: Record<PathType, string> = {
    radical: "激进创新路径",
    conservative: "稳健保守路径",
    cross_domain: "跨学科融合路径",
  };

  return [
    "你是系统级路径教练，负责引导 SecondMe 的单一路径决策。",
    `当前路径：${labels[path]}。`,
    "只输出 JSON，不要解释，不要 markdown。",
    "结论必须可执行，可测试。",
  ].join("\n");
}

export async function callCoach(
  path: PathType,
  params: { taskInput: string; round: number; context: string },
): Promise<CoachOutput> {
  const json = await runJsonTask<CoachOutput>({
    agentName: `path-${path}`,
    description: `System coach for ${path} path`,
    systemPrompt: getCoachSystemPrompt(path),
    userPrompt: [
      `用户任务：${params.taskInput}`,
      `轮次：${params.round}`,
      `上下文：${params.context}`,
      "输出字段：path, hypothesis, why, next_steps(3-5条), test_plan, risk_guardrail",
    ].join("\n\n"),
    schema: coachSchema(),
  });

  return {
    path,
    hypothesis: String(json.hypothesis ?? ""),
    why: String(json.why ?? ""),
    next_steps: toStringArray(json.next_steps),
    test_plan: String(json.test_plan ?? ""),
    risk_guardrail: String(json.risk_guardrail ?? ""),
  };
}

export async function callPathReport(params: {
  path: PathType;
  transcript: JsonRecord;
}): Promise<JsonRecord> {
  const output = await runJsonTask<JsonRecord>({
    agentName: `path-report-${params.path}`,
    description: `Path report formatter for ${params.path}`,
    systemPrompt: "你是路径报告整理器。将输入转成清晰 JSON 报告。",
    userPrompt: JSON.stringify(params),
    schema: {
      type: "object",
      additionalProperties: true,
    },
  });
  return output;
}

export async function callSynthesize(params: {
  radical: JsonRecord;
  conservative: JsonRecord;
  cross_domain: JsonRecord;
}): Promise<SynthesisOutput> {
  const json = await runJsonTask<SynthesisOutput>({
    agentName: "path-synthesizer",
    description: "Synthesize three path outputs into one recommendation",
    systemPrompt:
      "你是综合分析智能体。整合三条路径并给出可落地建议。只输出 JSON。",
    userPrompt: JSON.stringify(params),
    schema: synthesisSchema(),
  });

  return {
    summary: String(json.summary ?? ""),
    consensus: toStringArray(json.consensus),
    disagreements: toStringArray(json.disagreements),
    recommendation: String(json.recommendation ?? ""),
  };
}

export async function callEvaluate(params: {
  radical: JsonRecord;
  conservative: JsonRecord;
  cross_domain: JsonRecord;
  synthesis: JsonRecord;
}): Promise<EvaluationOutput> {
  const json = await runJsonTask<EvaluationOutput>({
    agentName: "path-evaluator",
    description: "Evaluate the final recommendation quality",
    systemPrompt:
      "你是评估智能体。评估综合结论的质量与风险，输出可继续迭代的建议。只输出 JSON。",
    userPrompt: JSON.stringify(params),
    schema: evaluationSchema(),
  });

  return {
    score: Number(json.score ?? 0),
    strengths: toStringArray(json.strengths),
    weaknesses: toStringArray(json.weaknesses),
    next_iteration: toStringArray(json.next_iteration),
  };
}
