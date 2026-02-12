# IssueLab x SecondMe

IssueLab x SecondMe 从用户的个人经历、能力结构与研究目标出发，先构建“研究分身”，再由多位专家智能体协同推演三条路径：

- `radical`（激进突破）
- `conservative`（稳健推进）
- `cross_domain`（跨域融合）

目标不是产出泛化建议，而是给出对“这个用户”可解释、可执行、可复盘的下一步科研决策。

## 当前状态

当前仓库处于 `AI 决策引擎 + 基础交互` 阶段，已具备：

- OAuth 登录与会话管理
- SecondMe 用户信息与兴趣标签读取
- 三路径多轮推演（Coach / SecondMe / Judge）
- 推演落库（Task / Run / PathRun / Turn / Report / Evaluation）
- SSE 实时事件推送与前端可视化
- 笔记本地兜底保存（上游异常时保底）

## API 概览

- `GET /api/auth/login`
- `GET /api/auth/callback`
- `POST /api/auth/logout`
- `GET /api/user/info`
- `GET /api/user/shades`
- `POST /api/chat`
- `GET /api/sessions`
- `POST /api/note`
- `GET /api/cron/forum-poll`
- `GET /api/cron/forum-dispatch`

`/api/chat` 主要 SSE 事件：

- `session`
- `path_status`
- `debate_status`
- `debate_round`
- `judge_round`
- `path_report`
- `synthesis`
- `evaluation`
- `final_answer`
- `done`
- `error`

## 本地启动

```bash
npm install
npm run dev
```

访问 `http://localhost:3000`

## 构建与测试

```bash
npm run build
npm test
```

## 环境变量

必需：

- `SECONDME_CLIENT_ID`
- `SECONDME_CLIENT_SECRET`
- `SECONDME_REDIRECT_URI`
- `SECONDME_API_BASE_URL`
- `SECONDME_OAUTH_URL`
- `SECONDME_TOKEN_ENDPOINT`
- `DATABASE_URL`

可选：

- `SYSTEM_AGENT_ENABLED`（默认开启；设为 `false` 可关闭系统智能体）
- `SYSTEM_AGENT_DEBATE_ROUNDS`（默认 `10`，最大 `10`）
- `ANTHROPIC_BASE_URL`（默认 `https://api.anthropic.com`）
- `ANTHROPIC_AUTH_TOKEN`（推荐）
- `ANTHROPIC_API_KEY`（与 `ANTHROPIC_AUTH_TOKEN` 二选一）
- `ANTHROPIC_MODEL`
- `CLAUDE_AGENT_MODEL`
- `ANTHROPIC_MAX_TOKENS`（默认 `1200`）
- `CRON_SECRET`（启用论坛轮询时必需）
- `FORUM_API_BASE_URL`（论坛 API 基础地址）
- `FORUM_API_TOKEN`（论坛 API 令牌）
- `FORUM_MENTION_TARGET`（默认 `@secondme`）
- `FORUM_LIST_PATH`（默认 `/mentions`）
- `FORUM_REPLY_PATH`（默认 `/replies`）

预留未启用：

- `SECONDME_REFRESH_ENDPOINT`（当前代码未使用）

## 论坛自动回复（最小实现）

新增了基于轮询的自动触发能力：

1. `GET /api/cron/forum-poll`
2. `GET /api/cron/forum-dispatch`

默认通过 `vercel.json` 每 2 分钟轮询提及，每 1 分钟执行派发。两个接口都要求：

- `Authorization: Bearer ${CRON_SECRET}`
  或
- `x-cron-secret: ${CRON_SECRET}`

流程：

1. 轮询论坛新评论，匹配 `FORUM_MENTION_TARGET`
2. 入队到 `mention_tasks`（`dedupe_key` 防重）
3. 派发器执行三路径系统智能体分析
4. 自动回写论坛回复并更新任务状态

## 文档导航

- `docs/claude-agent-sdk-system-agents.md`：系统智能体实现与 SSE 协议
- `docs/product-and-user-analysis.md`：产品与用户视角评估
- `docs/user-foundation.md`：用户基础层能力与最小闭环
