export type JsonRecord = Record<string, unknown>;
export type PathType = "radical" | "conservative" | "cross_domain";

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_TOKENS = 1200;
const DEFAULT_MODEL = "claude-3-5-sonnet-latest";

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

function getBaseUrl() {
  const fromEnv = process.env.ANTHROPIC_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return "https://api.anthropic.com";
}

function getAuthToken() {
  return (
    process.env.ANTHROPIC_AUTH_TOKEN?.trim() ||
    process.env.ANTHROPIC_API_KEY?.trim() ||
    ""
  );
}

function getModelName() {
  return (
    process.env.CLAUDE_AGENT_MODEL?.trim() ||
    process.env.ANTHROPIC_MODEL?.trim() ||
    DEFAULT_MODEL
  );
}

function getMaxTokens() {
  const raw = Number(process.env.ANTHROPIC_MAX_TOKENS ?? DEFAULT_MAX_TOKENS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_MAX_TOKENS;
  return Math.floor(raw);
}

function asObject(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function extractTextFromMessagePayload(payload: unknown) {
  const obj = asObject(payload);
  if (!obj) return "";
  const content = obj.content;
  if (!Array.isArray(content)) return "";

  let text = "";
  for (const chunk of content) {
    const item = asObject(chunk);
    if (!item) continue;
    if (item.type === "text" && typeof item.text === "string") {
      text += item.text;
    }
  }
  return text.trim();
}

function extractJsonText(raw: string) {
  const cleaned = raw.trim();
  if (!cleaned) return cleaned;

  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) return cleaned.slice(start, end + 1);
  return cleaned;
}

async function runJsonTask<T extends JsonRecord>(params: {
  systemPrompt: string;
  userPrompt: string;
  timeoutMs?: number;
}): Promise<T> {
  const { systemPrompt, userPrompt, timeoutMs = DEFAULT_TIMEOUT_MS } = params;
  const token = getAuthToken();
  if (!token) {
    throw new Error("Missing ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${getBaseUrl()}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": token,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: getModelName(),
        max_tokens: getMaxTokens(),
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        temperature: 0.2,
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    const payload = (await response.json()) as unknown;
    if (!response.ok) {
      const details = asObject(payload);
      const err =
        asObject(details?.error)?.message ||
        asObject(details)?.message ||
        `HTTP ${response.status}`;
      throw new Error(`Messages API failed: ${String(err)}`);
    }

    const text = extractTextFromMessagePayload(payload);
    const jsonText = extractJsonText(text);
    const parsed = JSON.parse(jsonText) as unknown;
    const object = asObject(parsed);
    if (!object) {
      throw new Error("Model returned non-object JSON");
    }
    return object as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Messages API timeout");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function coachPrompt(path: PathType) {
  return [
    "You are a system coach for path planning.",
    `Current path: ${path}.`,
    "Return JSON only. No markdown.",
    "Required fields: path, hypothesis, why, next_steps(3-5 items), test_plan, risk_guardrail.",
  ].join("\n");
}

function synthesisPrompt() {
  return [
    "You synthesize three path outputs into one decision aid.",
    "Return JSON only. No markdown.",
    "Required fields: summary, consensus, disagreements, recommendation.",
  ].join("\n");
}

function evaluatePrompt() {
  return [
    "You evaluate the synthesis quality.",
    "Return JSON only. No markdown.",
    "Required fields: score(0-100), strengths, weaknesses, next_iteration.",
  ].join("\n");
}

export async function callCoach(
  path: PathType,
  params: { taskInput: string; round: number; context: string },
): Promise<CoachOutput> {
  const json = await runJsonTask<CoachOutput>({
    systemPrompt: coachPrompt(path),
    userPrompt: [
      `task_input: ${params.taskInput}`,
      `round: ${params.round}`,
      `context: ${params.context}`,
    ].join("\n\n"),
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
  return runJsonTask<JsonRecord>({
    systemPrompt:
      "You format path transcript into a concise report JSON. Return JSON only.",
    userPrompt: JSON.stringify(params),
  });
}

export async function callSynthesize(params: {
  radical: JsonRecord;
  conservative: JsonRecord;
  cross_domain: JsonRecord;
}): Promise<SynthesisOutput> {
  const json = await runJsonTask<SynthesisOutput>({
    systemPrompt: synthesisPrompt(),
    userPrompt: JSON.stringify(params),
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
    systemPrompt: evaluatePrompt(),
    userPrompt: JSON.stringify(params),
  });

  return {
    score: Number(json.score ?? 0),
    strengths: toStringArray(json.strengths),
    weaknesses: toStringArray(json.weaknesses),
    next_iteration: toStringArray(json.next_iteration),
  };
}
