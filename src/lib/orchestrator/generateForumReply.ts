import {
  callCoach,
  callEvaluate,
  callJudge,
  callPathReport,
  callSynthesize,
  type JsonRecord,
  type PathType,
} from "@/lib/system-agents/runtime";

type DebateTurn = {
  round: number;
  coach: JsonRecord;
  secondme: string;
  judge: JsonRecord;
};

function getDebateRounds() {
  const raw = Number(process.env.SYSTEM_AGENT_DEBATE_ROUNDS ?? "3");
  if (!Number.isFinite(raw) || raw < 1) return 3;
  if (raw > 10) return 10;
  return Math.floor(raw);
}

function stringifyJson(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
}

function buildPathAgentReply(coach: JsonRecord) {
  const hypothesis = String(coach.hypothesis ?? "");
  const why = String(coach.why ?? "");
  const steps = Array.isArray(coach.next_steps)
    ? coach.next_steps
        .filter((item): item is string => typeof item === "string")
        .slice(0, 3)
        .join(" | ")
    : "";
  return [hypothesis, why, steps].filter(Boolean).join(" | ");
}

export async function generateForumReply(input: string) {
  const paths: PathType[] = ["radical", "conservative", "cross_domain"];
  const pathTurns: Record<PathType, DebateTurn[]> = {
    radical: [],
    conservative: [],
    cross_domain: [],
  };
  const constraints: Partial<Record<PathType, string>> = {};
  const failedPaths = new Set<PathType>();
  const reports: Partial<Record<PathType, JsonRecord>> = {};
  const rounds = getDebateRounds();

  for (let round = 1; round <= rounds; round += 1) {
    const activePaths = paths.filter((path) => !failedPaths.has(path));

    await Promise.all(
      activePaths.map(async (path) => {
        try {
          const coach = await callCoach(path, {
            taskInput: input,
            round,
            context: stringifyJson({
              constraint: constraints[path],
              history: pathTurns[path].slice(-3),
            }),
          });

          const pseudoReply = buildPathAgentReply(coach);
          const judge = await callJudge({
            path,
            round,
            taskInput: input,
            coach,
            secondme: pseudoReply,
            history: pathTurns[path],
            constraint: constraints[path],
          });

          constraints[path] = judge.next_constraint;
          pathTurns[path].push({
            round,
            coach,
            secondme: pseudoReply,
            judge,
          });
        } catch {
          failedPaths.add(path);
        }
      }),
    );
  }

  for (const path of paths) {
    if (failedPaths.has(path) || pathTurns[path].length === 0) continue;

    reports[path] = await callPathReport({
      path,
      transcript: { path, turns: pathTurns[path] },
    });
  }

  if (!reports.radical || !reports.conservative || !reports.cross_domain) {
    throw new Error("Not enough path reports to build reply");
  }

  const synthesis = await callSynthesize({
    radical: reports.radical,
    conservative: reports.conservative,
    cross_domain: reports.cross_domain,
  });

  const evaluation = await callEvaluate({
    radical: reports.radical,
    conservative: reports.conservative,
    cross_domain: reports.cross_domain,
    synthesis,
  });

  const text = [
    `结论：${synthesis.summary || synthesis.recommendation || "建议优先采用稳健可执行路径。"}`,
    synthesis.recommendation ? `建议：${synthesis.recommendation}` : "",
    `评估分：${evaluation.score}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { text, synthesis, evaluation, reports };
}
