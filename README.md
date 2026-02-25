# MangaLens

MangaLens 是一个面向漫画翻译与局部修图的 Next.js 16 应用，支持：

- 多 OCR 通道：`comic-text-detector`、`MangaOCR`、`PaddleOCR`、`百度 OCR`、AI 视觉 OCR
- 多模型生成：Gemini / OpenAI 兼容接口
- 修补编辑器：画笔 mask + AI 重绘 / LAMA inpaint
- 批量导入导出：图片、ZIP/CBZ、PDF、Sidecar

## 近期功能补充（与你反馈对应）

- 文字颜色自动适配：
  - 侧栏开关：`自动适配文字颜色`
  - 作用：为选区建立颜色锚点并在后处理阶段纠偏，避免角色台词全部变黑。
- 文件夹批量读取：
  - 支持点击`上传文件夹`（`webkitdirectory`）和拖拽目录递归导入。
  - 支持拖入顶层目录后递归读取其下图片文件。
- 设置保存：
  - 浏览器本地自动持久化（重开页面保留）。
  - 新增 `导出设置 / 导入设置` JSON，用于跨设备或备份。
- 注音假名处理：
  - 侧栏开关：`注音假名过滤`
  - 作用：启发式过滤小尺寸 furigana，减少漏擦和脏边。
- 文本框填充透明：
  - 富文本编辑器新增 `填充透明 (Clear fill)`。
- GPT 批量翻译（减少调用次数）：
  - 侧栏开关：`OCR 文本批量翻译（单次调用）`
  - 同一页 OCR 文本块打包一次请求翻译，减少 token 开销并提升上下文一致性。
- 高质量翻译提速：
  - 在高质量模式下会按批并发处理（受并发数/批次大小限制），提升长章节处理速度。
  - 批量处理中可点击 `停止`，当前批次完成后停止后续任务。
- 导出命名控制：
  - 支持 `保留原文件名` 或 `按序号命名（image+数字）`。
  - 序号模式可设置 `起始编号`，便于分段续跑后文件名连续。
- 韩漫长图检测增强：
  - 自动检测到长条比例时，降低 CTD 优先级，并在识别为空时回退 AI 视觉检测。

## 本地开发

1. 安装依赖

```bash
npm ci
```

2. 配置环境变量

```bash
cp .env.local.example .env.local
```

3. 启动开发环境

```bash
npm run dev
```

访问：`http://localhost:3000`

## OCR/LAMA 后端配置

优先在后台 ` /admin/settings/ai ` 配置，环境变量作为兜底：

- `COMIC_TEXT_DETECTOR_BASE_URL`
- `MANGA_OCR_BASE_URL`
- `PADDLE_OCR_BASE_URL`
- `BAIDU_OCR_API_KEY` + `BAIDU_OCR_SECRET_KEY`
- `LAMA_INPAINT_BASE_URL`

对应可选 API Key：

- `COMIC_TEXT_DETECTOR_API_KEY`
- `MANGA_OCR_API_KEY`
- `PADDLE_OCR_API_KEY`
- `LAMA_INPAINT_API_KEY`

## Docker 运行

### 方式 1：docker compose（推荐）

```bash
docker compose up -d --build
```

停止：

```bash
docker compose down
```

### 方式 2：纯 Docker

```bash
docker build -t manga-lens:latest .
docker run --rm -p 3000:3000 --env-file .env.local manga-lens:latest
```

## 常用检查

```bash
npm run lint
npm run build
```
