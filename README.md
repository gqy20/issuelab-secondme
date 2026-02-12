# IssueLab x SecondMe

一个基于 Next.js 的 SecondMe 集成项目，用于在 IssueLab 场景中进行多轨迹讨论、用户信息读取与笔记沉淀。

## 技术栈

- Next.js 16（App Router）
- TypeScript
- Tailwind CSS 4
- Prisma（已包含 schema 与配置）

## 已实现能力

- OAuth 登录流程路由
  - `GET /api/auth/login`
  - `GET /api/auth/callback`
  - `POST /api/auth/logout`
- 用户信息模块
  - `GET /api/user/info`
  - `GET /api/user/shades`
- 对话与会话模块
  - `POST /api/chat`
  - `GET /api/sessions`
- 笔记模块
  - `POST /api/note`
- 中文前端界面与交互组件
  - 登录按钮、用户侧栏、对话窗口

## 本地启动

1. 安装依赖

```bash
npm install
```

2. 启动开发服务

```bash
npm run dev
```

3. 访问

`http://localhost:3000`

## 构建验证

```bash
npm run build
```

## 环境变量

项目使用 `.env.local`，核心变量包括：

- `SECONDME_CLIENT_ID`
- `SECONDME_CLIENT_SECRET`
- `SECONDME_REDIRECT_URI`
- `SECONDME_API_BASE_URL`
- `SECONDME_OAUTH_URL`
- `SECONDME_TOKEN_ENDPOINT`
- `SECONDME_REFRESH_ENDPOINT`
- `DATABASE_URL`

## 目录说明

- `src/app`：页面与 API 路由
- `src/components`：前端组件
- `src/lib`：鉴权、服务请求与数据访问封装
- `prisma`：Prisma schema
- `.secondme`：SecondMe 工作流状态文件（已忽略）
