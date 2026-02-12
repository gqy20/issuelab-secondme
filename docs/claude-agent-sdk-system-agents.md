# 系统智能体实现说明（轻量 Messages API 方案）

## 1. 目标

在 `IssueLab x SecondMe` 中实现三路径系统智能体，并支持多轮博弈：

- `radical`（激进创新）
- `conservative`（稳健保守）
- `cross_domain`（跨域融合）

每轮输出路径教练观点，并让 SecondMe 对该观点回应，最后产出：

- `path_report`
- `synthesis`
- `evaluation`

## 2. 架构落点

- 系统智能体调用：`src/lib/system-agents/runtime.ts`
- 编排与 SSE：`src/app/api/chat/route.ts`
- 前端展示：`src/components/ChatWindow.tsx`

## 3. 为什么改为轻量 API

原方案使用 Claude Agent SDK，依赖本地 CLI 进程，不适合 Vercel Serverless 的无状态运行环境。  
当前改为 Anthropic Messages API（兼容 Anthropic 协议网关也可），避免 CLI 依赖，直接通过 HTTP 调用。

## 4. 运行流程

1. 用户发起 `/api/chat`
2. 先获取主 SecondMe 流式回复（`delta`）
3. 主回复完成后进入三路径多轮博弈（默认 10 轮）
4. 每轮每路径：
   - 系统教练生成观点
   - SecondMe 针对观点回应
   - 推送 `debate_round` 事件
5. 轮次结束后推送 `path_report`
6. 最后推送 `synthesis` 与 `evaluation`

## 5. SSE 事件

- `session`
- `delta`
- `path_status`
- `debate_status`
- `debate_round`
- `path_report`
- `synthesis`
- `evaluation`
- `done`

## 6. 环境变量

必需：

- `SECONDME_*`（现有配置）
- `DATABASE_URL`
- `ANTHROPIC_AUTH_TOKEN` 或 `ANTHROPIC_API_KEY`

可选：

- `SYSTEM_AGENT_ENABLED`（默认开启）
- `SYSTEM_AGENT_DEBATE_ROUNDS`（默认 `10`）
- `ANTHROPIC_BASE_URL`（默认 `https://api.anthropic.com`）
- `ANTHROPIC_MODEL` / `CLAUDE_AGENT_MODEL`
- `ANTHROPIC_MAX_TOKENS`（默认 `1200`）

## 7. 部署注意事项

构建脚本已包含 Prisma Client 生成：

```bash
npm run build
```

实际命令：

```bash
prisma generate && next build --webpack
```

## 8. 数据库迁移

```bash
npx prisma migrate deploy
npx prisma generate
```
