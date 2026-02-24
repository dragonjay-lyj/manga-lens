# MangaLens

MangaLens 是一个面向漫画翻译与局部修图的 Next.js 16 应用，支持：

- 多 OCR 通道：`comic-text-detector`、`MangaOCR`、`PaddleOCR`、`百度 OCR`、AI 视觉 OCR
- 多模型生成：Gemini / OpenAI 兼容接口
- 修补编辑器：画笔 mask + AI 重绘 / LAMA inpaint
- 批量导入导出：图片、ZIP/CBZ、PDF、Sidecar

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
