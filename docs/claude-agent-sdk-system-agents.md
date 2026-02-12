# Claude Agent SDK 系统智能体实现文档

## 1. 目标

在现有 `IssueLab x SecondMe` 聊天链路上，增加系统级三路径智能体，用于在同一输入下并行给出三种发展路径建议：

- `radical`：激进创新路径
- `conservative`：稳健保守路径
- `cross_domain`：跨学科融合路径

并给出：

- 三路径综合结论（`synthesis`）
- 综合结论质量评估（`evaluation`）

## 2. 当前落地位置

- SDK 适配层：`src/lib/system-agents/runtime.ts`
- 聊天编排入口：`src/app/api/chat/route.ts`
- 前端展示：`src/components/ChatWindow.tsx`

## 3. 执行流程

1. 用户发起 `POST /api/chat`
2. 后端调用 SecondMe 流式聊天接口，持续透传 `delta`
3. SecondMe 主回复完成后，后端并行调用三个系统路径智能体（Claude Agent SDK）
4. 返回 `path_report` 事件（每条路径）
5. 在三条路径都成功后，继续产出：
   - `synthesis`
   - `evaluation`
6. 最后返回 `done`

## 4. SSE 事件约定

- `session`: `{ sessionId }`
- `delta`: `{ text }`
- `path_status`: `{ status }` 或 `{ path, status }`
- `path_report`: `{ path, report }` 或 `{ path, error }`
- `synthesis`: `{ summary, consensus, disagreements, recommendation }`
- `evaluation`: `{ score, strengths, weaknesses, next_iteration }`
- `done`: `{ sessionId }`

## 5. 环境变量

必须：

- `ANTHROPIC_API_KEY`：Claude Agent SDK 鉴权
- `SECONDME_*` 一组变量（已在项目使用）
- `DATABASE_URL`

可选：

- `SYSTEM_AGENT_ENABLED`：默认开启，设置为 `false` 关闭系统智能体
- `CLAUDE_AGENT_MODEL`：默认 `sonnet`
- `CLAUDE_AGENT_MAX_TURNS`：默认 `6`

## 6. 关键实现细节

- 使用 `query()` + `outputFormat: { type: "json_schema" }` 强制结构化输出
- 每个路径有独立 `AgentDefinition`（名称、描述、系统提示词）
- 通过 JSON Schema 约束返回字段，降低解析失败风险
- 所有系统智能体调用禁用工具（`tools: []`），仅做推理输出
- 设置超时与异常兜底，避免主链路阻塞

## 7. 部署注意事项（Vercel）

- `src/app/api/chat/route.ts` 已显式 `runtime = "nodejs"`，确保 SDK 在 Node 环境运行
- 在 Vercel 项目变量中配置 `ANTHROPIC_API_KEY`
- 若线上成本或延迟过高，可先设置 `SYSTEM_AGENT_ENABLED=false` 验证主链路

## 8. 下一步建议

1. 将系统智能体输出写入 Prisma（`Run/PathRun/Artifact/Evaluation`）
2. 增加前端“路径对比视图”（不止显示一句 hypothesis）
3. 增加回放页面：按会话查看历史路径建议与评估变化
