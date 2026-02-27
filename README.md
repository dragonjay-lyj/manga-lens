# MangaLens

[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-149eca)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ecf8e)](https://supabase.com/)
[![Clerk](https://img.shields.io/badge/Auth-Clerk-6b46c1)](https://clerk.com/)

MangaLens 是一个面向漫画翻译、局部修图与批量处理的 Web 应用。  
它支持多 OCR 引擎、多模型图像生成、文本回填编辑、账单与后台配置，并提供“本地 API Key”与“网站统一 API”两种运行模式。

## 目录
- [核心能力](#核心能力)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [环境变量](#环境变量)
- [数据库初始化](#数据库初始化)
- [推荐工作流](#推荐工作流)
- [Docker 部署](#docker-部署)
- [脚本与质量检查](#脚本与质量检查)
- [开发规范](#开发规范)
- [关键页面与接口](#关键页面与接口)
- [安全与权限说明](#安全与权限说明)
- [常见问题](#常见问题)
- [贡献指南](#贡献指南)
- [Issue 与 PR 模板](#issue-与-pr-模板)
- [持续集成](#持续集成)
- [许可证](#许可证)

## 核心能力
- 精准局部编辑：矩形选区、多选区批量生成、结果回填。
- OCR 检测链路：
  - `comic-text-detector`
  - `MangaOCR`（后端适配）
  - `PaddleOCR`（后端适配）
  - `百度 OCR`（后端适配）
  - AI 视觉 OCR（Gemini/OpenAI）
- 模型与生成：
  - Gemini
  - OpenAI 兼容接口（含自定义 Base URL）
- 修补能力：
  - AI 生成修补
  - LAMA Inpaint（后端服务）
- 文本编辑：
  - OCR 原文/译文双栏编辑
  - 单句重翻译（可带上下文）
  - 本地繁简转换（`简->繁` / `繁->简`）
  - 截图单句翻译并回填当前文本块
- 批处理与导出：
  - 图片/文件夹批量导入
  - ZIP/CBZ/PDF 工作流
  - 单张下载、批量打包下载
  - Sidecar 导出导入（便于 PS 往返）
  - OCR 原文 JSON 导出与译文 JSON 回导
- 充值与账单：
  - Coin 消耗与充值
  - 账单中心与后台支付对账

## 技术栈
- 前端：Next.js 16、React 19、TypeScript、Tailwind CSS 4、Radix UI、Zustand
- 后端：Next.js Route Handlers
- 数据层：Supabase（PostgreSQL + RLS）
- 认证：Clerk
- 文件处理：JSZip、jsPDF、pdfjs-dist、docx、mammoth、ag-psd、utif
- 质量工具：ESLint、Axe、Lighthouse CI、Playwright

## 项目结构
```text
manga-lens/
├─ src/
│  ├─ app/
│  │  ├─ (app)/                    # 业务页面（editor/profile/admin 等）
│  │  ├─ api/                      # API 路由（ai/payment/user/admin）
│  │  ├─ api-docs/                 # API 文档页
│  │  └─ docs/                     # 用户帮助文档页
│  ├─ components/
│  │  └─ editor/                   # 编辑器核心 UI（canvas/sidebar/toolbar）
│  ├─ lib/
│  │  ├─ ai/                       # AI/OCR 适配层
│  │  ├─ stores/                   # Zustand 状态管理
│  │  └─ utils/                    # 导入导出、图像工具、文本处理
│  └─ types/
├─ supabase/
│  ├─ migrations/                  # SQL 迁移
│  └─ schema.sql                   # 快照
├─ scripts/
│  └─ a11y/                        # axe 自动审查脚本
├─ Dockerfile
└─ docker-compose.yml
```

## 快速开始

### 1) 前置要求
- Node.js >= 20
- npm >= 10
- 一个 Clerk 项目
- 一个 Supabase 项目

### 2) 安装依赖
```bash
npm ci
```

### 3) 配置环境变量
```bash
cp .env.local.example .env.local
```
然后按下文“环境变量”填写必填项。

### 4) 初始化数据库
执行 `supabase/migrations` 中的 SQL（见下文）。

### 5) 启动开发环境
```bash
npm run dev
```
访问 `http://localhost:3000`。

## 环境变量

下表按“必填/可选”给出建议。

| 变量名 | 必填 | 用途 |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | 是 | Clerk 前端鉴权 |
| `CLERK_SECRET_KEY` | 是 | Clerk 服务端鉴权 |
| `CLERK_WEBHOOK_SECRET` | 是 | Clerk Webhook 校验 |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | 建议 | 登录页地址 |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | 建议 | 注册页地址 |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | 建议 | 登录后跳转 |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | 建议 | 注册后跳转 |
| `NEXT_PUBLIC_SUPABASE_URL` | 是 | Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 是 | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | 是 | Supabase service role key |
| `NEXT_PUBLIC_SITE_URL` | 建议 | 站点 URL（sitemap/metadata） |
| `NEXT_PUBLIC_SITE_NAME` | 建议 | 站点名称 |
| `API_KEY_ENCRYPTION_SECRET` | 是 | 用户 API Key 加密密钥（至少 32 位） |
| `NEXT_PUBLIC_ADMIN_EMAILS` | 可选 | 逗号分隔管理员邮箱白名单 |
| `COMIC_TEXT_DETECTOR_BASE_URL` | 可选 | CTD 服务地址 |
| `COMIC_TEXT_DETECTOR_API_KEY` | 可选 | CTD 服务密钥 |
| `MANGA_OCR_BASE_URL` | 可选 | MangaOCR 服务地址 |
| `MANGA_OCR_API_KEY` | 可选 | MangaOCR 密钥 |
| `PADDLE_OCR_BASE_URL` | 可选 | PaddleOCR 服务地址 |
| `PADDLE_OCR_API_KEY` | 可选 | PaddleOCR 密钥 |
| `BAIDU_OCR_API_KEY` | 可选 | 百度 OCR key |
| `BAIDU_OCR_SECRET_KEY` | 可选 | 百度 OCR secret |
| `BAIDU_OCR_BASE_URL` | 可选 | 百度 OCR endpoint（默认已给） |
| `LAMA_INPAINT_BASE_URL` | 可选 | LAMA 服务地址 |
| `LAMA_INPAINT_API_KEY` | 可选 | LAMA 密钥 |

说明：
- OCR/LAMA 配置也可在后台 `/admin/settings/ai` 填写，环境变量作为兜底。
- 站点统一 AI（Server API）同样在后台配置，前端可切换“使用网站 API”。

## 数据库初始化

推荐顺序执行以下迁移：

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/003_coin_transactions.sql`
3. `supabase/migrations/004_system_settings.sql`
4. `supabase/migrations/005_security_and_recharge_atomic.sql`
5. `supabase/migrations/006_server_ai_settings.sql`

也可以参考 `supabase/schema.sql` 一次性初始化新环境（迁移优先）。

## 推荐工作流

### A. 常规流程（站内全自动）
1. 上传图片
2. 自动检测文本并生成选区
3. 一键生成/批量生成
4. 导出结果

### B. 分步执行（降低资源峰值）
适合大量图片、希望先识别再翻译的场景：

1. 在侧栏点击 `阶段1：全部OCR`
2. OCR 完成后点击 `阶段2：全部翻译`
3. 确认译文后再执行生成或导出

这个模式可以避免识别/翻译链路频繁切换，减少高峰资源占用。

### C. 仅 OCR + 外部翻译（不走付费 API）
1. 点击 `导出 OCR JSON（当前/全部）`
2. 将 `sourceText` 发送到外部平台（如 Google AI Studio）翻译
3. 保留 `index`（或 `sourceText`），填回 `translatedText`
4. 点击 `导入翻译 JSON 回填`

#### OCR JSON 示例（可回导）
```json
{
  "schemaVersion": 1,
  "type": "mangalens.ocr-source",
  "scope": "all",
  "images": [
    {
      "imageId": "xxx",
      "fileName": "001.png",
      "blocks": [
        { "index": 0, "sourceText": "こんにちは", "translatedText": "你好" }
      ]
    }
  ]
}
```

## Docker 部署

### docker compose（推荐）
```bash
docker compose up -d --build
docker compose down
```

### 纯 Docker
```bash
docker build -t manga-lens:latest .
docker run --rm -p 3000:3000 --env-file .env.local manga-lens:latest
```

## 脚本与质量检查

```bash
# 本地开发
npm run dev

# 生产构建
npm run build
npm run start

# 代码质量
npm run lint
npm run lint:a11y

# 可访问性 / 性能审查
npm run audit:axe
npm run audit:lighthouse
```

## 开发规范

### 代码规范
- 使用 TypeScript，保持类型完整，避免 `any` 扩散。
- React 组件文件命名采用 `kebab-case`，组件名使用 `PascalCase`。
- 优先复用 `src/lib/*` 与 `src/components/ui/*`，避免重复工具函数。
- 新增功能优先补齐错误态与空态反馈。

### API 规范
- Route Handler 放在 `src/app/api/**/route.ts`。
- 鉴权接口必须先做 `auth()` 校验，再执行业务逻辑。
- 错误返回统一 `{ error: string }`，并使用正确 HTTP 状态码。

### 数据库规范
- 优先维护 `supabase/migrations/*.sql`，`schema.sql` 作为快照。
- 涉及权限的数据表必须启用 RLS，并补策略。
- 涉及支付/资产变更的操作应走原子事务（RPC 或单事务 SQL）。

### Git 规范（建议）
- 分支命名：`feat/*`、`fix/*`、`refactor/*`、`docs/*`
- 提交信息建议使用 Conventional Commits：
  - `feat: ...`
  - `fix: ...`
  - `docs: ...`
  - `refactor: ...`
- PR 至少包含：变更说明、测试步骤、风险点与回滚方案（如有）。

## 关键页面与接口

### 页面
- `/editor`：主编辑器
- `/docs`：使用文档
- `/api-docs`：API 文档
- `/profile`：个人中心
- `/profile/recharge`：充值页
- `/profile/billing`：账单中心
- `/admin`：后台首页
- `/admin/settings/ai`：统一 AI/OCR/LAMA 配置

### 主要 API（Route Handlers）
- `POST /api/ai/detect-text`
- `POST /api/ai/translate-text`
- `POST /api/ai/translate-vision`
- `POST /api/ai/generate`
- `POST /api/ai/inpaint`
- `GET/POST/DELETE /api/user/api-keys`
- `GET/POST /api/user/coins`
- `GET /api/user/billing/transactions`
- `GET /api/user/billing/transactions/:outTradeNo`
- `POST /api/admin/payments/reconcile`

## 安全与权限说明
- 管理路由使用服务端管理员校验，非管理员应返回 `403`。
- Supabase 启用 RLS，对 `system_settings`、`coin_transactions` 等敏感表限制访问。
- 用户 API Key 使用 `API_KEY_ENCRYPTION_SECRET` 加密存储。
- 支付完成使用数据库原子结算函数 `complete_recharge_order(...)`，处理幂等与金额校验。

## 常见问题

### 1) 启动后数据库无数据
- 检查是否已执行迁移 SQL。
- 检查 Clerk Webhook 是否配置成功（用户同步依赖 webhook）。

### 2) 点击生成提示网站 API 未启用
- 到 `/admin/settings/ai` 配置 `server_api_enabled`、provider、key、model。
- 或关闭“使用网站 API”，改用个人 API Key。

### 3) OCR 识别不到（特别是长条韩漫）
- 尝试切换 OCR 引擎到 `PaddleOCR` 或 `AI 视觉 OCR`。
- 使用“阶段1：全部OCR”单独跑识别，先确认识别质量。

### 4) 导入翻译 JSON 未生效
- 确保每个块有 `translatedText`。
- 推荐保留 `index`；跨图时保留 `imageId` 或 `fileName`。

## 贡献指南

欢迎 PR。建议流程：

1. Fork 并创建特性分支
2. 提交前执行：
   - `npm run lint`
   - `npm run build`
3. 提交 PR，说明变更范围、测试方法和风险点

## Issue 与 PR 模板
- Issue 模板目录：`.github/ISSUE_TEMPLATE/`
  - `bug_report.yml`：Bug 反馈
  - `feature_request.yml`：需求建议
- PR 模板：`.github/pull_request_template.md`

## 持续集成
- 工作流文件：`.github/workflows/ci.yml`
- 触发时机：
  - Push 到 `main` / `master`
  - Pull Request
- 检查项：
  - `npm run lint`
  - `npm run build`

## 许可证

本项目采用 [MIT License](./LICENSE)。
