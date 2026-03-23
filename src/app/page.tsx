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
  Menu,
  Palette,
  ScanText,
  Sparkles,
  Target,
  Zap,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/ui/icon-button"
import { LanguageSwitcher } from "@/components/shared/language-switcher"
import { ThemeSwitcher } from "@/components/shared/theme-switcher"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { useEditorStore } from "@/lib/stores/editor-store"
import { getSignInHref } from "@/lib/auth/clerk-config"
import type { Locale } from "@/lib/i18n"

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
  const signInHref = getSignInHref()
  const t = homeContent[locale]
  const heroDifferentiators = t.differentiatorItems.slice(0, 3)
  const workflowSteps: IconCardItem[] = [
    {
      icon: FolderSync,
      title: locale === "zh" ? "导入原稿" : "Import Pages",
      description: locale === "zh" ? "拖入漫画页面，自动整理批处理工作流。" : "Drop manga pages in and build a batch-ready workflow.",
    },
    {
      icon: ScanText,
      title: locale === "zh" ? "检测文本" : "Detect Dialogue",
      description: t.smartCapabilities[0]?.description ?? "",
    },
    {
      icon: Languages,
      title: locale === "zh" ? "上下文翻译" : "Translate With Context",
      description: t.smartCapabilities.find((item) => item.icon === Languages)?.description ?? t.hero.description,
    },
    {
      icon: Palette,
      title: locale === "zh" ? "局部回填" : "Repaint Regions",
      description: t.features[0]?.description ?? "",
    },
  ]

  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="pattern-grid absolute inset-0 opacity-50" />
        <div className="absolute left-[-8rem] top-24 h-72 w-72 rounded-[2.5rem] border border-primary/10 bg-primary/10 blur-3xl" />
        <div className="absolute right-[-6rem] top-[12rem] h-80 w-80 rounded-full bg-accent/30 blur-3xl" />
        <div className="absolute bottom-[-8rem] left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <header className="sticky top-4 z-50 px-4">
        <nav className="surface-card mx-auto flex max-w-7xl items-center justify-between gap-3 rounded-[1.25rem] px-4 py-3">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary shadow-[var(--shadow-md)]">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div className="space-y-0.5">
              <span className="font-display text-lg font-semibold tracking-tight">MangaLens</span>
              <p className="hidden text-xs text-muted-foreground md:block">
                {locale === "zh" ? "漫画翻译与局部重绘工作台" : "Manga translation and repaint workspace"}
              </p>
            </div>
          </Link>

          <div className="hidden items-center gap-1 py-1 lg:flex">
            {t.navLinks.map((item) => (
              <Button key={item.href} variant="ghost" size="sm" className="h-10 px-4 text-sm" asChild>
                <Link href={item.href} prefetch={item.prefetch}>
                  {item.label}
                </Link>
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Sheet>
              <SheetTrigger asChild>
                <IconButton
                  variant="ghost"
                  className="border border-border/70 bg-card/60 hover:bg-accent lg:hidden"
                  ariaLabel={locale === "zh" ? "打开页面导航" : "Open page navigation"}
                >
                  <Menu className="h-4 w-4" />
                </IconButton>
              </SheetTrigger>
              <SheetContent side="right" className="w-[88vw] p-0 sm:max-w-sm">
                <SheetHeader className="border-b border-border/70">
                  <SheetTitle>{locale === "zh" ? "页面导航" : "Navigation"}</SheetTitle>
                  <SheetDescription>
                    {locale === "zh" ? "快速进入主要页面和关键操作" : "Quick access to core pages and actions"}
                  </SheetDescription>
                </SheetHeader>
                <div className="space-y-3 p-4">
                  {t.navLinks.map((item) => (
                    <SheetClose asChild key={item.href}>
                      <Link
                        href={item.href}
                        prefetch={item.prefetch}
                        className="flex h-12 items-center rounded-xl border border-border/70 bg-card/70 px-4 text-sm font-medium transition-[background-color,border-color,color] duration-200 hover:bg-accent hover:text-accent-foreground"
                      >
                        {item.label}
                      </Link>
                    </SheetClose>
                  ))}
                  <div className="grid gap-3 pt-2">
                    <SheetClose asChild>
                      <Button variant="outline" className="w-full" asChild>
                        <Link href={signInHref} prefetch={false}>
                          {t.auth.signIn}
                        </Link>
                      </Button>
                    </SheetClose>
                    <SheetClose asChild>
                      <Button className="w-full" asChild>
                        <Link href="/editor" prefetch={false}>
                          {t.auth.openEditor}
                        </Link>
                      </Button>
                    </SheetClose>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            <LanguageSwitcher locale={locale} onChange={setLocale} />
            <ThemeSwitcher locale={locale} />
            <Button variant="outline" className="hidden sm:inline-flex" asChild>
              <Link href={signInHref} prefetch={false}>
                {t.auth.signIn}
              </Link>
            </Button>
            <Button className="shadow-[var(--shadow-lg)]" asChild>
              <Link href="/editor" prefetch={false}>
                {t.auth.openEditor}
              </Link>
            </Button>
          </div>
        </nav>
      </header>

      <main id="main-content" className="relative lg:snap-y lg:snap-mandatory">
        <section className="px-4 pb-20 pt-14 lg:snap-start sm:pt-18 lg:pb-24">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div className="space-y-8">
              <div className="kicker">
                <Zap className="h-4 w-4 text-primary" />
                <span>{t.hero.badge}</span>
              </div>

              <div className="space-y-5">
                <h1 className="max-w-5xl text-5xl font-semibold leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
                  {t.hero.title}
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
                  {t.hero.description}
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button size="lg" className="shadow-[var(--shadow-lg)]" asChild>
                  <Link href="/editor" prefetch={false}>
                    {t.hero.ctaPrimary}
                    <ArrowRight className="h-5 w-5" />
                  </Link>
                </Button>
                <Button variant="outline" size="lg" asChild>
                  <Link href="/docs" prefetch={false}>
                    {t.hero.ctaSecondary}
                  </Link>
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                {t.hero.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-border/70 bg-card/70 px-3 py-1.5 text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                {heroDifferentiators.map((item, index) => (
                  <article key={item} className="surface-panel rounded-2xl p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                      {String(index + 1).padStart(2, "0")}
                    </p>
                    <p className="mt-3 text-sm leading-6">{item}</p>
                  </article>
                ))}
              </div>
            </div>

            <div className="surface-card relative overflow-hidden rounded-[2rem] p-6 sm:p-8">
              <div className="absolute right-6 top-6 hidden lg:flex">
                <span className="kicker">
                  <Sparkles className="h-4 w-4 text-primary" />
                  {locale === "zh" ? "端到端工作流" : "End-to-End Flow"}
                </span>
              </div>
              <div className="space-y-5 pt-2 lg:pt-14">
                {workflowSteps.map((item, index) => (
                  <article
                    key={item.title}
                    className="relative overflow-hidden rounded-2xl border border-border/70 bg-background/70 p-5"
                  >
                    <span className="absolute right-4 top-4 text-5xl font-display text-primary/10">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl gradient-primary shadow-[var(--shadow-md)]">
                        <item.icon className="h-5 w-5 text-white" />
                      </div>
                      <div className="space-y-2 pr-8">
                        <h2 className="text-xl font-semibold">{item.title}</h2>
                        <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-16 lg:snap-start sm:py-20">
          <div className="mx-auto max-w-7xl">
            <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-3">
                <span className="kicker text-primary">{locale === "zh" ? "核心能力" : "Core Stack"}</span>
                <h2 className="text-3xl font-semibold sm:text-4xl">{t.sectionTitles.coreCapabilities}</h2>
              </div>
              <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                {locale === "zh"
                  ? "围绕漫画翻译最关键的识别、翻译、重绘和批处理链路设计，减少从上传到导出的切换成本。"
                  : "Built around the exact workflow manga translation teams need most: detection, translation, repaint, and batch export."}
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {t.features.map((item) => (
                <article key={item.title} className="surface-panel rounded-[1.5rem] p-6">
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl gradient-primary shadow-[var(--shadow-md)]">
                    <item.icon className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="mb-3 text-xl font-semibold">{item.title}</h3>
                  <p className="text-sm leading-7 text-muted-foreground">{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-16 lg:snap-start sm:py-20">
          <div className="mx-auto max-w-7xl">
            <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-3">
                <span className="kicker text-primary">{locale === "zh" ? "智能增强" : "AI Assist"}</span>
                <h2 className="text-3xl font-semibold sm:text-4xl">{t.sectionTitles.smartCapabilities}</h2>
              </div>
              <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                {locale === "zh"
                  ? "避免把内容堆成说明文档，而是用清晰的模块展示模型、排版、OCR 和上下文能力。"
                  : "The page stays scannable while still surfacing the OCR, layout, context, and typography depth behind the product."}
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {t.smartCapabilities.map((item) => (
                <article key={item.title} className="rounded-[1.5rem] border border-border/70 bg-card/90 p-6 shadow-[var(--shadow-md)]">
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mb-3 text-xl font-semibold">{item.title}</h3>
                  <p className="text-sm leading-7 text-muted-foreground">{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-16 lg:snap-start sm:py-20">
          <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[0.92fr_1.08fr]">
            <article className="surface-card rounded-[1.75rem] p-6 sm:p-8">
              <div className="mb-6 space-y-3">
                <span className="kicker text-primary">{locale === "zh" ? "适用场景" : "Use Cases"}</span>
                <h2 className="text-3xl font-semibold">{t.sectionTitles.useCases}</h2>
              </div>
              <div className="space-y-4">
                {t.useCases.map((item) => (
                  <article key={item.number} className="rounded-2xl border border-border/70 bg-background/65 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">{item.number}</p>
                    <h3 className="mt-3 text-xl font-semibold">{item.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">{item.description}</p>
                  </article>
                ))}
              </div>
            </article>

            <article className="surface-card rounded-[1.75rem] p-6 sm:p-8">
              <div className="mb-6 space-y-3">
                <span className="kicker text-primary">{locale === "zh" ? "风格保持" : "Style Handling"}</span>
                <h2 className="text-3xl font-semibold">{t.sectionTitles.mangaStyles}</h2>
              </div>
              <div className="grid gap-5 lg:grid-cols-2">
                {t.mangaStyleSuites.map((suite) => (
                  <article key={suite.title} className="rounded-2xl border border-border/70 bg-background/65 p-5">
                    <h3 className="text-xl font-semibold">{suite.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-muted-foreground">{suite.description}</p>
                    <ul className="mt-5 space-y-3">
                      {suite.points.map((point) => (
                        <li key={point} className="flex items-start gap-3 text-sm leading-6">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </article>
          </div>
        </section>

        <section className="px-4 py-16 lg:snap-start sm:py-20">
          <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-2">
            <article className="rounded-[1.75rem] border border-border/70 bg-card/90 p-6 shadow-[var(--shadow-md)] sm:p-8">
              <div className="mb-6 space-y-3">
                <span className="kicker text-primary">{locale === "zh" ? "覆盖范围" : "Coverage"}</span>
                <h2 className="text-3xl font-semibold">{t.sectionTitles.supportedTypes}</h2>
              </div>
              <ul className="space-y-3">
                {t.supportedMangaTypes.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm leading-7">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>

            <article className="rounded-[1.75rem] border border-primary/25 bg-primary/10 p-6 shadow-[var(--shadow-md)] sm:p-8">
              <div className="mb-6 space-y-3">
                <span className="kicker border-primary/30 bg-primary/10 text-primary">
                  {locale === "zh" ? "为什么是 MangaLens" : "Why MangaLens"}
                </span>
                <h2 className="text-3xl font-semibold">{t.sectionTitles.differentiators}</h2>
              </div>
              <ul className="space-y-3">
                {t.differentiatorItems.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm leading-7">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </section>

        <section className="px-4 pb-20 pt-8 lg:snap-start sm:pb-24">
          <div className="mx-auto max-w-7xl">
            <div className="surface-card overflow-hidden rounded-[2rem] p-8 sm:p-10 lg:p-12">
              <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
                <div className="space-y-4">
                  <span className="kicker border-primary/30 bg-primary/10 text-primary">
                    {locale === "zh" ? "准备开始翻译了吗" : "Ready To Translate"}
                  </span>
                  <h2 className="max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">
                    {locale === "zh"
                      ? "把识别、翻译、回填和导出放进同一条稳定工作流里。"
                      : "Move detection, translation, repaint, and export into one consistent workflow."}
                  </h2>
                  <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                    {locale === "zh"
                      ? "主页顶部和底部都保留 CTA，移动端也不会被固定导航遮挡，让首次进入和深度阅读后的转化路径都更直接。"
                      : "The CTA stays visible in the sticky nav and returns at the bottom so both first-time visitors and deep readers have a clean next step."}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3 lg:justify-end">
                  <Button size="lg" className="shadow-[var(--shadow-lg)]" asChild>
                    <Link href="/editor" prefetch={false}>
                      {t.hero.ctaPrimary}
                    </Link>
                  </Button>
                  <Button variant="outline" size="lg" asChild>
                    <Link href="/docs" prefetch={false}>
                      {t.hero.ctaSecondary}
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/70 px-4 py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary shadow-[var(--shadow-md)]">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-display text-lg font-semibold">MangaLens</p>
              <p className="text-sm text-muted-foreground">
                {locale === "zh" ? "AI 漫画翻译与局部重绘工具" : "AI manga translation and repaint tool"}
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} MangaLens</p>
        </div>
      </footer>
    </div>
  )
}
