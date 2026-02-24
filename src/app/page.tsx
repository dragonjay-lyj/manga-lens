"use client"

import Link from "next/link"
import {
  ArrowRight,
  AudioLines,
  CheckCircle2,
  FolderSync,
  Globe,
  Languages,
  LayoutTemplate,
  Palette,
  ScanText,
  Sparkles,
  Target,
  Zap,
  type LucideIcon,
} from "lucide-react"
import { Space_Grotesk } from "next/font/google"
import { Button } from "@/components/ui/button"
import { LanguageSwitcher } from "@/components/shared/language-switcher"
import { ThemeSwitcher } from "@/components/shared/theme-switcher"
import { useEditorStore } from "@/lib/stores/editor-store"
import type { Locale } from "@/lib/i18n"

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  display: "swap",
})

type NavLinkItem = {
  href: string
  label: string
  prefetch: boolean
}

type IconCardItem = {
  icon: LucideIcon
  title: string
  description: string
}

type UseCaseItem = {
  number: string
  title: string
  description: string
}

type StyleSuiteItem = {
  title: string
  description: string
  points: string[]
}

type HomeContent = {
  navLinks: NavLinkItem[]
  auth: {
    signIn: string
    openEditor: string
  }
  hero: {
    badge: string
    title: string
    description: string
    ctaPrimary: string
    ctaSecondary: string
    tags: string[]
  }
  sectionTitles: {
    coreCapabilities: string
    useCases: string
    mangaStyles: string
    smartCapabilities: string
    supportedTypes: string
    differentiators: string
  }
  features: IconCardItem[]
  useCases: UseCaseItem[]
  mangaStyleSuites: StyleSuiteItem[]
  smartCapabilities: IconCardItem[]
  supportedMangaTypes: string[]
  differentiatorItems: string[]
}

const homeContent: Record<Locale, HomeContent> = {
  zh: {
    navLinks: [
      { href: "/docs", label: "文档", prefetch: false },
      { href: "/api-docs", label: "API 文档", prefetch: false },
      { href: "/projects", label: "项目", prefetch: false },
      { href: "/profile", label: "个人中心", prefetch: false },
      { href: "/admin", label: "管理后台", prefetch: false },
    ],
    auth: {
      signIn: "登录",
      openEditor: "进入编辑器",
    },
    hero: {
      badge: "AI 驱动 · 选区重绘 · 多模型",
      title: "MangaLens 漫画翻译与局部重绘",
      description: "上传图片、框选文本区域、输入提示词，一次性完成漫画文本替换与结果导出。",
      ctaPrimary: "立即开始",
      ctaSecondary: "查看文档",
      tags: ["阿拉伯语", "泰语", "西语", "Manga OCR", "批量流程"],
    },
    sectionTitles: {
      coreCapabilities: "核心能力",
      useCases: "适用场景",
      mangaStyles: "漫画风格处理",
      smartCapabilities: "智能能力",
      supportedTypes: "我可以翻译哪些类型的漫画？",
      differentiators: "我们漫画翻译器的特别之处",
    },
    features: [
      {
        icon: Target,
        title: "精准选区重绘",
        description: "按选区精确替换对话文本，保持画面主体不变。",
      },
      {
        icon: FolderSync,
        title: "批量处理",
        description: "支持多图连续处理，提升翻译和重绘效率。",
      },
      {
        icon: Globe,
        title: "多模型支持",
        description: "支持 Gemini 与 OpenAI 兼容接口，按需切换。",
      },
      {
        icon: Palette,
        title: "风格保持",
        description: "优先保留原图布局与气泡风格，减少违和感。",
      },
    ],
    useCases: [
      {
        number: "01",
        title: "漫画翻译",
        description: "将原文替换为目标语言并保持版式可读性。",
      },
      {
        number: "02",
        title: "局部修图",
        description: "只处理指定区域，避免全图重绘带来的失真。",
      },
      {
        number: "03",
        title: "批处理流程",
        description: "对一组页面执行统一流程，减少重复操作。",
      },
    ],
    mangaStyleSuites: [
      {
        title: "日本漫画与轻小说",
        description: "适配竖排文本、对话气泡与拟声词，尽量保留原始艺术感。",
        points: ["保留原始文本", "字体风格匹配", "保持布局"],
      },
      {
        title: "韩国网漫与条漫",
        description: "适配数字漫画排版节奏，保持现代 Webtoon 风格与阅读流。",
        points: ["保留原始文本", "字体风格匹配", "保持布局"],
      },
    ],
    smartCapabilities: [
      {
        icon: ScanText,
        title: "智能对话框检测",
        description: "自动检测语音气泡与文本区域，减少手工框选时间。",
      },
      {
        icon: Palette,
        title: "漫画风格字体",
        description: "优先匹配原文笔触、字重、描边与排版密度。",
      },
      {
        icon: AudioLines,
        title: "音效翻译",
        description: "支持拟声词与音效文本翻译，尽量保持原始表现风格。",
      },
      {
        icon: LayoutTemplate,
        title: "竖排文本支持",
        description: "支持日漫与传统中漫竖排排版，保持阅读方向一致。",
      },
      {
        icon: Languages,
        title: "上下文感知翻译",
        description: "结合对话上下文进行翻译，减少生硬直译与语义断裂。",
      },
    ],
    supportedMangaTypes: [
      "日本漫画和轻小说",
      "韩国网络漫画和漫画",
      "中国漫画和动漫",
      "西方漫画和图画小说",
      "数字漫画和网络漫画",
    ],
    differentiatorItems: [
      "翻译效果最好：顶级模型 + 术语上下文，语义与语气更稳定",
      "全网翻译速度最快：并行 + 缓存优化，支持整话批量下载",
      "先进 OCR 识别：复杂背景、描边文本也能稳定识别",
      "智能排版与一键回填：自动擦字回填，换行与位置自适配",
      "新手与专业皆宜：默认高质，同时支持字体/术语微调",
      "批量/后台翻译：多页任务并行处理，完成后统一导出",
    ],
  },
  en: {
    navLinks: [
      { href: "/docs", label: "Docs", prefetch: false },
      { href: "/api-docs", label: "API Docs", prefetch: false },
      { href: "/projects", label: "Projects", prefetch: false },
      { href: "/profile", label: "Profile", prefetch: false },
      { href: "/admin", label: "Admin", prefetch: false },
    ],
    auth: {
      signIn: "Sign in",
      openEditor: "Open Editor",
    },
    hero: {
      badge: "AI-driven · Region Editing · Multi-Model",
      title: "MangaLens for Manga Translation and Local Repaint",
      description: "Upload pages, select text regions, add prompts, and export translated results in one flow.",
      ctaPrimary: "Start Now",
      ctaSecondary: "Read Docs",
      tags: ["Arabic", "Thai", "Spanish", "Manga OCR", "Batch Workflow"],
    },
    sectionTitles: {
      coreCapabilities: "Core Capabilities",
      useCases: "Use Cases",
      mangaStyles: "Manga Style Handling",
      smartCapabilities: "Smart Capabilities",
      supportedTypes: "What Types of Comics Can I Translate?",
      differentiators: "What Makes MangaLens Different?",
    },
    features: [
      {
        icon: Target,
        title: "Precise Region Repaint",
        description: "Replace dialogue only inside selected regions while preserving the rest of the page.",
      },
      {
        icon: FolderSync,
        title: "Batch Processing",
        description: "Process multiple pages continuously to improve translation and repaint throughput.",
      },
      {
        icon: Globe,
        title: "Multi-Model Support",
        description: "Switch between Gemini and OpenAI-compatible providers based on your workflow.",
      },
      {
        icon: Palette,
        title: "Style Preservation",
        description: "Prioritize original layout and bubble style to reduce visual mismatch.",
      },
    ],
    useCases: [
      {
        number: "01",
        title: "Manga Translation",
        description: "Replace source text with target language while keeping page readability.",
      },
      {
        number: "02",
        title: "Local Retouch",
        description: "Edit only specific regions to avoid quality loss from full-image regeneration.",
      },
      {
        number: "03",
        title: "Batch Workflow",
        description: "Apply a repeatable workflow to multiple pages with less manual repetition.",
      },
    ],
    mangaStyleSuites: [
      {
        title: "Japanese Manga and Light Novels",
        description: "Handles vertical text, speech bubbles, and SFX while preserving the original art feel.",
        points: ["Preserve original text flow", "Match font style", "Keep layout intact"],
      },
      {
        title: "Korean Webtoons and Long Strips",
        description: "Adapts to modern digital comic rhythm while maintaining webtoon readability.",
        points: ["Preserve original text flow", "Match font style", "Keep layout intact"],
      },
    ],
    smartCapabilities: [
      {
        icon: ScanText,
        title: "Smart Bubble Detection",
        description: "Automatically detects speech bubbles and text regions to reduce manual selection.",
      },
      {
        icon: Palette,
        title: "Comic-style Typography",
        description: "Attempts to match stroke, weight, outline, and spacing from source text style.",
      },
      {
        icon: AudioLines,
        title: "SFX Translation",
        description: "Translates onomatopoeia and sound effects while preserving manga expression style.",
      },
      {
        icon: LayoutTemplate,
        title: "Vertical Text Support",
        description: "Supports common vertical layouts used in manga and traditional CJK comics.",
      },
      {
        icon: Languages,
        title: "Context-aware Translation",
        description: "Uses dialogue context to reduce literal errors and improve line coherence.",
      },
    ],
    supportedMangaTypes: [
      "Japanese manga and light novels",
      "Korean webtoons and comics",
      "Chinese comics and manhua",
      "Western comics and graphic novels",
      "Digital comics and web comics",
    ],
    differentiatorItems: [
      "Better translation quality: top-tier models with terminology context for stable tone and meaning",
      "Fast throughput: parallel + cache optimization for chapter-level output",
      "Advanced OCR: robust on complex backgrounds and outlined text",
      "Smart layout refill: text erase and refill with adaptive placement and wrapping",
      "Beginner to pro friendly: good defaults with editable fonts and terms",
      "Batch/background workflow: process multi-page tasks and export in one run",
    ],
  },
}

export default function HomePage() {
  const locale = useEditorStore((state) => state.locale)
  const setLocale = useEditorStore((state) => state.setLocale)
  const t = homeContent[locale]

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-28 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -right-24 top-1/3 h-72 w-72 rounded-full bg-accent/15 blur-3xl" />
      </div>
      <header className="fixed left-4 right-4 top-6 z-50">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/95 px-4 py-3.5 shadow-sm backdrop-blur">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-primary">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className={`${spaceGrotesk.className} text-lg font-bold tracking-tight`}>MangaLens</span>
          </Link>

          <div className="hidden items-center gap-1 py-1 lg:flex">
            {t.navLinks.map((item) => (
              <Button key={item.href} variant="ghost" size="sm" className="h-10 px-3" asChild>
                <Link href={item.href} prefetch={item.prefetch}>
                  {item.label}
                </Link>
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <LanguageSwitcher locale={locale} onChange={setLocale} />
            <ThemeSwitcher locale={locale} />
            <Button variant="outline" asChild>
              <Link href="/sign-in" prefetch={false}>
                {t.auth.signIn}
              </Link>
            </Button>
            <Button asChild>
              <Link href="/editor" prefetch={false}>
                {t.auth.openEditor}
              </Link>
            </Button>
          </div>
        </nav>
      </header>

      <main id="main-content">
        <section className="px-4 pb-16 pt-36">
          <div className="mx-auto max-w-6xl text-center">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-4 py-2">
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">{t.hero.badge}</span>
            </div>

            <h1 className={`${spaceGrotesk.className} mb-5 text-4xl font-bold leading-tight md:text-6xl`}>{t.hero.title}</h1>
            <p className="mx-auto mb-8 max-w-3xl text-lg text-muted-foreground">{t.hero.description}</p>
            <div className="mb-8 flex flex-wrap items-center justify-center gap-2">
              {t.hero.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-border/70 bg-card/80 px-3 py-1 text-xs font-medium text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>

            <div className="flex items-center justify-center gap-3">
              <Button size="lg" asChild>
                <Link href="/editor" prefetch={false}>
                  {t.hero.ctaPrimary}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href="/docs" prefetch={false}>
                  {t.hero.ctaSecondary}
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="px-4 py-16">
          <div className="mx-auto max-w-6xl">
            <h2 className="mb-10 text-center font-display text-3xl font-bold">{t.sectionTitles.coreCapabilities}</h2>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {t.features.map((item) => (
                <article key={item.title} className="rounded-2xl border border-border/70 bg-card p-6">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl gradient-primary">
                    <item.icon className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="mb-2 font-semibold">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-muted/20 px-4 py-16">
          <div className="mx-auto max-w-6xl">
            <h2 className="mb-10 text-center font-display text-3xl font-bold">{t.sectionTitles.useCases}</h2>
            <div className="grid gap-6 md:grid-cols-3">
              {t.useCases.map((item) => (
                <article key={item.number} className="relative overflow-hidden rounded-2xl border border-border/70 bg-card p-7">
                  <span className="absolute right-4 top-4 text-5xl font-bold text-primary/10">{item.number}</span>
                  <h3 className="mb-3 text-xl font-semibold">{item.title}</h3>
                  <p className="text-muted-foreground">{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-16">
          <div className="mx-auto max-w-6xl">
            <h2 className="mb-10 text-center font-display text-3xl font-bold">{t.sectionTitles.mangaStyles}</h2>
            <div className="grid gap-6 lg:grid-cols-2">
              {t.mangaStyleSuites.map((suite) => (
                <article key={suite.title} className="rounded-2xl border border-border/70 bg-card p-6">
                  <h3 className="text-xl font-semibold">{suite.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{suite.description}</p>
                  <ul className="mt-4 space-y-2">
                    {suite.points.map((point) => (
                      <li key={point} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-muted/20 px-4 py-16">
          <div className="mx-auto max-w-6xl">
            <h2 className="mb-10 text-center font-display text-3xl font-bold">{t.sectionTitles.smartCapabilities}</h2>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {t.smartCapabilities.map((item) => (
                <article key={item.title} className="rounded-2xl border border-border/70 bg-card p-6">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl gradient-primary">
                    <item.icon className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="mb-2 font-semibold">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-16">
          <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-2">
            <article className="rounded-2xl border border-border/70 bg-card p-6">
              <h3 className="text-xl font-semibold">{t.sectionTitles.supportedTypes}</h3>
              <ul className="mt-4 space-y-2">
                {t.supportedMangaTypes.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
            <article className="rounded-2xl border border-border/70 bg-card p-6">
              <h3 className="text-xl font-semibold">{t.sectionTitles.differentiators}</h3>
              <ul className="mt-4 space-y-2">
                {t.differentiatorItems.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-4 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="font-display font-semibold">MangaLens</span>
          </div>
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} MangaLens</p>
        </div>
      </footer>
    </div>
  )
}
