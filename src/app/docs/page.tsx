"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  BookOpen,
  CheckCircle2,
  ExternalLink,
  FileArchive,
  FileImage,
  FileText,
  HelpCircle,
  Keyboard,
  Languages,
  LayoutTemplate,
  ScanText,
  Volume2,
  Wand2,
  Zap,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { SiteShell } from "@/components/shared/site-shell"
import { useEditorStore } from "@/lib/stores/editor-store"
import type { Locale } from "@/lib/i18n"

type QuickStartStep = {
  badge: string
  title: string
  description: string
}

type StyleSuite = {
  title: string
  description: string
  points: string[]
}

type SmartFeature = {
  icon: LucideIcon
  title: string
  description: string
}

type TranslationFormat = {
  icon: LucideIcon
  title: string
  description: string
}

type ShortcutItem = {
  keys: string[]
  action: string
}

type FAQItem = {
  question: string
  answer: string
}

type DocsContent = {
  header: {
    title: string
    description: string
  }
  quickStart: {
    title: string
    description: string
    steps: QuickStartStep[]
    cta: string
  }
  styleSupport: {
    title: string
    description: string
    suites: StyleSuite[]
  }
  smartTranslation: {
    title: string
    description: string
    features: SmartFeature[]
  }
  quality: {
    title: string
    description: string
    highlights: string[]
    ocrTip: string
  }
  flow: {
    title: string
    description: string
    steps: string[]
    formats: TranslationFormat[]
  }
  shortcuts: {
    title: string
    description: string
    items: ShortcutItem[]
  }
  faq: {
    title: string
    items: FAQItem[]
  }
  differentiators: {
    title: string
    description: string
    items: string[]
  }
  links: {
    api: {
      title: string
      description: string
      cta: string
    }
    contact: {
      title: string
      description: string
      cta: string
    }
  }
}

const docsContent: Record<Locale, DocsContent> = {
  zh: {
    header: {
      title: "帮助文档",
      description: "了解如何使用 MangaLens 进行 AI 图像局部重绘",
    },
    quickStart: {
      title: "快速开始",
      description: "3 步完成第一次 AI 重绘",
      steps: [
        {
          badge: "步骤 1",
          title: "上传图片",
          description: "点击上传或直接拖拽图片到编辑器。支持批量上传。",
        },
        {
          badge: "步骤 2",
          title: "框选区域",
          description: "在画布上拖动鼠标框选需要修改的区域。",
        },
        {
          badge: "步骤 3",
          title: "输入提示词并生成",
          description: "描述您想要的效果，点击生成按钮。",
        },
      ],
      cta: "立即体验",
    },
    styleSupport: {
      title: "漫画风格支持",
      description: "面向日漫、韩漫和条漫排版的翻译体验",
      suites: [
        {
          title: "日本漫画风格",
          description: "处理竖排文本、对话气泡和拟声词，同时尽量保留原始艺术质感。",
          points: ["保留原始文本", "字体风格匹配", "保持布局"],
        },
        {
          title: "韩国网漫/条漫风格",
          description: "适配现代数字漫画排版与节奏，减少翻译后的风格割裂感。",
          points: ["保留原始文本", "字体风格匹配", "保持布局"],
        },
      ],
    },
    smartTranslation: {
      title: "智能翻译能力",
      description: "针对漫画文本识别与回填优化",
      features: [
        {
          icon: ScanText,
          title: "智能对话框检测",
          description: "自动检测语音气泡与文本区域，减少手工框选。",
        },
        {
          icon: Volume2,
          title: "音效翻译",
          description: "处理拟声词与音效文本，并尽量保持漫画表现风格。",
        },
        {
          icon: LayoutTemplate,
          title: "竖排文本支持",
          description: "支持日漫和传统中漫常见竖排布局。",
        },
        {
          icon: Languages,
          title: "上下文感知翻译",
          description: "结合角色对白语境，减少生硬逐字翻译。",
        },
      ],
    },
    quality: {
      title: "翻译质量与语言支持",
      description: "在 CJK 与拉丁字母语言之间互译，并针对漫画 OCR 优化",
      highlights: [
        "AI 驱动的高精度翻译",
        "上下文感知翻译，确保自然对话",
        "支持漫画术语与表达",
        "支持手动编辑，便于精修最终效果",
      ],
      ocrTip: "针对漫画优化的 OCR：复杂背景、变形文字、描边文本场景下仍尽量保证识别稳定。",
    },
    flow: {
      title: "如何翻译原始漫画",
      description: "从上传到导出的完整流程",
      steps: [
        "打开 AI 漫画翻译器，上传漫画页面",
        "选择翻译方向与模型，点击“翻译/生成”",
        "自动检测文本并生成译文，可手动调整文本块",
        "确认后导出单张、ZIP / CBZ 或 PDF 结果",
      ],
      formats: [
        { icon: FileImage, title: "图片上传", description: "PNG / JPG / WebP" },
        { icon: FileArchive, title: "ZIP / CBZ 批量", description: "文件名需唯一，建议整数排序" },
        { icon: FileText, title: "PDF 导入", description: "自动拆页后进行批量翻译" },
      ],
    },
    shortcuts: {
      title: "键盘快捷键",
      description: "提高您的工作效率",
      items: [
        { keys: ["Ctrl", "Z"], action: "撤销" },
        { keys: ["Ctrl", "Shift", "Z"], action: "重做" },
        { keys: ["Ctrl", "Y"], action: "重做" },
        { keys: ["Delete"], action: "删除选区/图片" },
        { keys: ["+"], action: "放大" },
        { keys: ["-"], action: "缩小" },
        { keys: ["0"], action: "重置视图" },
        { keys: ["Space"], action: "切换原图/结果" },
        { keys: ["Ctrl", "Enter"], action: "生成" },
        { keys: ["Ctrl", "V"], action: "粘贴图片" },
      ],
    },
    faq: {
      title: "常见问题",
      items: [
        {
          question: "如何获取 Gemini API Key？",
          answer:
            "访问 Google AI Studio (aistudio.google.com)，登录 Google 账户后点击 'Get API Key' 即可免费获取。免费额度对于个人使用通常足够。",
        },
        {
          question: "支持哪些图片格式？",
          answer:
            "支持单张图片（PNG、JPG、WebP）、ZIP/CBZ 压缩包与 PDF 文件。对于 ZIP/CBZ，跨目录文件名必须唯一，且建议使用整数文件名以确定页码和阅读顺序。",
        },
        {
          question: "支持哪些 AI 服务商？",
          answer:
            "内置支持 Gemini 与 OpenAI 兼容接口。OpenAI 兼容预设包含 OpenAI、SiliconFlow、DeepSeek、火山引擎 Ark、Ollama、Sakura，也可手动填写 Base URL。",
        },
        {
          question: "如何批量处理多张图片？",
          answer:
            "上传多张图片后，在右侧选中需要处理的图片，然后点击工具栏的“批量生成所有”按钮。可以设置并发数来控制同时处理的图片数量。",
        },
        {
          question: "选区位置不准确怎么办？",
          answer: "使用缩放功能放大图片后再绘制选区，可以获得更精确的选区位置。使用 + 和 - 键快速缩放。",
        },
        {
          question: "AI 生成结果不符合预期？",
          answer:
            "尝试优化提示词，使用更具体的描述。例如，改为“请用简体中文翻译图中的日文对话，保持字体风格一致，不要改变其他区域”。",
        },
        {
          question: "处理速度很慢怎么办？",
          answer: "检查网络连接，或尝试使用更小的选区。批量处理时可以降低并发数来减少 API 压力。",
        },
        {
          question: "什么是高质量翻译模式（Beta）？",
          answer:
            "该模式会启用多页上下文一致性策略，并提供批次大小、会话重置批次、RPM 限制、上下文提示词等参数。通常会更稳定，但会增加处理时间和配额消耗。",
        },
        {
          question: "支持自动检测漫画文本框吗？",
          answer:
            "支持。可在编辑器侧边栏点击“自动检测文本并生成选区”。若管理员在 /admin/settings/ai 启用了 comic-text-detector，会优先使用该检测服务。",
        },
        {
          question: "我可以翻译哪些类型的漫画？",
          answer:
            "支持日本漫画与轻小说、韩国网络漫画与条漫、中国漫画、西方漫画与图画小说、以及各类数字漫画页面。",
        },
        {
          question: "翻译有多准确？",
          answer:
            "系统使用 AI 驱动翻译与上下文感知策略，尽量保持自然对白、术语一致和角色语境。你也可以在编辑器中手动修订文本块，保证最终质量。",
        },
        {
          question: "我们漫画翻译器的特别之处是什么？",
          answer:
            "核心优势是保留原始漫画艺术与布局，支持竖排文本与对话气泡，匹配漫画风格字体排版，并可处理拟声词与音效文本。",
        },
      ],
    },
    differentiators: {
      title: "为什么选择 MangaLens",
      description: "翻译质量、速度和批量流程三方面同时优化",
      items: [
        "翻译效果最好：顶级模型 + 术语上下文，语义与语气更稳定",
        "全网翻译速度最快：并行 + 缓存优化，支持整话批量处理",
        "先进 OCR 识别：复杂背景、描边文本也能稳定识别",
        "智能排版与一键回填：框大小、位置、换行自适配",
        "新手与专业皆宜：默认高质，也支持参数微调",
        "批量/后台翻译：多页任务可并行，完成后统一下载",
      ],
    },
    links: {
      api: {
        title: "API 文档",
        description: "开发者集成指南",
        cta: "查看 API 文档",
      },
      contact: {
        title: "联系我们",
        description: "反馈问题或建议",
        cta: "发送邮件",
      },
    },
  },
  en: {
    header: {
      title: "Help Docs",
      description: "Learn how to use MangaLens for AI-powered local repaint workflows.",
    },
    quickStart: {
      title: "Quick Start",
      description: "Finish your first AI repaint in 3 steps",
      steps: [
        {
          badge: "Step 1",
          title: "Upload images",
          description: "Upload files or drag them into the editor. Batch upload is supported.",
        },
        {
          badge: "Step 2",
          title: "Select regions",
          description: "Drag on the canvas to select the area you want to modify.",
        },
        {
          badge: "Step 3",
          title: "Prompt and generate",
          description: "Describe the expected result and click generate.",
        },
      ],
      cta: "Try Now",
    },
    styleSupport: {
      title: "Manga Style Support",
      description: "Translation tuned for manga, webtoons, and long-strip layouts",
      suites: [
        {
          title: "Japanese manga style",
          description: "Handles vertical text, speech bubbles, and SFX while keeping the original art feel.",
          points: ["Preserve original text flow", "Match font style", "Keep layout intact"],
        },
        {
          title: "Korean webtoon style",
          description: "Adapts to modern digital comic rhythm to reduce style mismatch after translation.",
          points: ["Preserve original text flow", "Match font style", "Keep layout intact"],
        },
      ],
    },
    smartTranslation: {
      title: "Smart Translation Features",
      description: "Optimized for manga text detection, translation, and refill",
      features: [
        {
          icon: ScanText,
          title: "Smart bubble detection",
          description: "Automatically detects speech bubbles and text regions to reduce manual work.",
        },
        {
          icon: Volume2,
          title: "SFX translation",
          description: "Translates onomatopoeia and sound effects while preserving style intent.",
        },
        {
          icon: LayoutTemplate,
          title: "Vertical text support",
          description: "Supports vertical layouts common in manga and traditional CJK comics.",
        },
        {
          icon: Languages,
          title: "Context-aware translation",
          description: "Uses dialogue context to reduce literal errors and keep lines natural.",
        },
      ],
    },
    quality: {
      title: "Translation Quality and Language Coverage",
      description: "Translate between CJK and Latin-script languages with manga-optimized OCR",
      highlights: [
        "AI-driven high-accuracy translation",
        "Context-aware translation for natural dialogue",
        "Support for manga-specific terms and expressions",
        "Manual editing support for final quality control",
      ],
      ocrTip:
        "Manga-optimized OCR: keeps detection stable on complex backgrounds, distorted text, and outlined glyphs.",
    },
    flow: {
      title: "How to Translate Raw Manga",
      description: "End-to-end workflow from upload to export",
      steps: [
        "Open MangaLens and upload your manga pages",
        "Choose translation direction and model, then click Translate/Generate",
        "Review auto-detected text and edit blocks if needed",
        "Export as single image, ZIP/CBZ bundle, or PDF",
      ],
      formats: [
        { icon: FileImage, title: "Image upload", description: "PNG / JPG / WebP" },
        { icon: FileArchive, title: "ZIP/CBZ batch", description: "Unique filenames required; numeric naming is recommended" },
        { icon: FileText, title: "PDF import", description: "Auto-split pages and run batch translation" },
      ],
    },
    shortcuts: {
      title: "Keyboard Shortcuts",
      description: "Work faster in the editor",
      items: [
        { keys: ["Ctrl", "Z"], action: "Undo" },
        { keys: ["Ctrl", "Shift", "Z"], action: "Redo" },
        { keys: ["Ctrl", "Y"], action: "Redo" },
        { keys: ["Delete"], action: "Delete selection/image" },
        { keys: ["+"], action: "Zoom in" },
        { keys: ["-"], action: "Zoom out" },
        { keys: ["0"], action: "Reset view" },
        { keys: ["Space"], action: "Toggle original/result" },
        { keys: ["Ctrl", "Enter"], action: "Generate" },
        { keys: ["Ctrl", "V"], action: "Paste image" },
      ],
    },
    faq: {
      title: "FAQ",
      items: [
        {
          question: "How do I get a Gemini API key?",
          answer:
            "Go to Google AI Studio (aistudio.google.com), sign in with your Google account, and click 'Get API Key'. The free quota is usually enough for personal use.",
        },
        {
          question: "Which file formats are supported?",
          answer:
            "Single images (PNG, JPG, WebP), ZIP/CBZ archives, and PDF files are supported. For ZIP/CBZ imports, filenames must be unique across folders, and numeric naming is recommended for stable page order.",
        },
        {
          question: "Which AI providers are supported?",
          answer:
            "Gemini and OpenAI-compatible APIs are supported. Built-in OpenAI-compatible presets include OpenAI, SiliconFlow, DeepSeek, Volcengine Ark, Ollama, and Sakura. Custom Base URL is also supported.",
        },
        {
          question: "How can I process many images in batch?",
          answer:
            "Upload multiple images, select targets on the right panel, then click 'Batch Generate All' in the toolbar. You can tune concurrency to control parallel workload.",
        },
        {
          question: "My selection is inaccurate. What should I do?",
          answer: "Zoom in before drawing the selection for better precision. Use + and - for fast zoom control.",
        },
        {
          question: "The AI output is not what I expected.",
          answer:
            "Use a more specific prompt. For example: 'Translate Japanese dialogue to Simplified Chinese, keep the original font style, and do not modify non-selected regions.'",
        },
        {
          question: "Processing is slow. How can I improve it?",
          answer: "Check network quality or reduce selection size. In batch mode, lowering concurrency can reduce API pressure.",
        },
        {
          question: "What is High-quality Translation mode (Beta)?",
          answer:
            "It enables multi-page context consistency with controls like batch size, session reset batches, RPM limit, and custom context prompts. It usually improves consistency, but costs more time and API quota.",
        },
        {
          question: "Is automatic manga text-box detection supported?",
          answer:
            "Yes. Click 'Auto detect text and create selections' in the editor sidebar. If comic-text-detector is enabled in /admin/settings/ai, it is used as the preferred detector.",
        },
        {
          question: "What kinds of comics can I translate?",
          answer:
            "Japanese manga/light novels, Korean webtoons, Chinese comics, Western comics/graphic novels, and other digital comic pages are supported.",
        },
        {
          question: "How accurate is the translation?",
          answer:
            "The system uses AI translation with contextual strategies to keep dialogue natural and terminology consistent. You can also manually adjust text blocks for final quality.",
        },
        {
          question: "What makes MangaLens different?",
          answer:
            "MangaLens focuses on preserving original art/layout, supports vertical text and speech bubbles, matches comic-style typography, and handles SFX/onomatopoeia translation.",
        },
      ],
    },
    differentiators: {
      title: "Why MangaLens",
      description: "Optimized together for quality, speed, and batch workflow",
      items: [
        "Better translation quality: top-tier models plus terminology context",
        "Fast throughput: parallel and cache optimization for chapter workflows",
        "Advanced OCR: robust on complex backgrounds and outlined text",
        "Smart layout refill: adaptive placement, sizing, and wrapping",
        "Beginner to pro friendly: strong defaults with fine-grained controls",
        "Batch/background translation: process many pages and export together",
      ],
    },
    links: {
      api: {
        title: "API Docs",
        description: "Integration guide for developers",
        cta: "Open API Docs",
      },
      contact: {
        title: "Contact",
        description: "Report issues or share suggestions",
        cta: "Send Email",
      },
    },
  },
}

export default function DocsPage() {
  const locale = useEditorStore((state) => state.locale)
  const t = docsContent[locale]

  return (
    <SiteShell contentClassName="max-w-4xl">
      <div className="container max-w-4xl space-y-8 py-8">
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <BookOpen className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold">{t.header.title}</h1>
          <p className="mx-auto max-w-lg text-muted-foreground">{t.header.description}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              {t.quickStart.title}
            </CardTitle>
            <CardDescription>{t.quickStart.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {t.quickStart.steps.map((step) => (
                <div key={step.badge} className="space-y-2">
                  <Badge>{step.badge}</Badge>
                  <h3 className="font-medium">{step.title}</h3>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-center">
              <Button asChild>
                <Link href="/editor">
                  <Wand2 className="mr-2 h-4 w-4" />
                  {t.quickStart.cta}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.styleSupport.title}</CardTitle>
            <CardDescription>{t.styleSupport.description}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {t.styleSupport.suites.map((suite) => (
              <article key={suite.title} className="rounded-lg border border-border/70 p-4">
                <h3 className="font-medium">{suite.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{suite.description}</p>
                <ul className="mt-3 space-y-2">
                  {suite.points.map((point) => (
                    <li key={point} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.smartTranslation.title}</CardTitle>
            <CardDescription>{t.smartTranslation.description}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {t.smartTranslation.features.map((item) => (
              <div key={item.title} className="rounded-lg border border-border/70 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <item.icon className="h-4 w-4 text-primary" />
                  <p className="font-medium">{item.title}</p>
                </div>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.quality.title}</CardTitle>
            <CardDescription>{t.quality.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2">
              {t.quality.highlights.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="rounded-lg border border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground">
              {t.quality.ocrTip}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.flow.title}</CardTitle>
            <CardDescription>{t.flow.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 text-sm">
              {t.flow.steps.map((step, index) => (
                <li key={`${index + 1}-${step}`} className="flex items-start gap-2">
                  <Badge variant="secondary">{index + 1}</Badge>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {t.flow.formats.map((format) => (
                <div key={format.title} className="rounded-lg border border-border/70 p-3 text-sm">
                  <div className="mb-1 flex items-center gap-2 font-medium">
                    <format.icon className="h-4 w-4 text-primary" />
                    {format.title}
                  </div>
                  {format.description}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Keyboard className="h-5 w-5 text-primary" />
              {t.shortcuts.title}
            </CardTitle>
            <CardDescription>{t.shortcuts.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-2">
              {t.shortcuts.items.map((shortcut) => (
                <div
                  key={`${shortcut.keys.join("+")}-${shortcut.action}`}
                  className="flex items-center justify-between rounded-lg bg-muted/50 p-2"
                >
                  <span className="text-sm">{shortcut.action}</span>
                  <div className="flex items-center gap-1">
                    {shortcut.keys.map((key) => (
                      <kbd key={`${shortcut.action}-${key}`} className="rounded border bg-background px-2 py-1 font-mono text-xs">
                        {key}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" />
              {t.faq.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {t.faq.items.map((faq, index) => (
                <AccordionItem key={faq.question} value={`item-${index}`}>
                  <AccordionTrigger>{faq.question}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">{faq.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.differentiators.title}</CardTitle>
            <CardDescription>{t.differentiators.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {t.differentiators.items.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t.links.api.title}</CardTitle>
              <CardDescription>{t.links.api.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full" asChild>
                <Link href="/api-docs">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {t.links.api.cta}
                </Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t.links.contact.title}</CardTitle>
              <CardDescription>{t.links.contact.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full" asChild>
                <a href="mailto:lyjcody@foxmail.com">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {t.links.contact.cta}
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </SiteShell>
  )
}
