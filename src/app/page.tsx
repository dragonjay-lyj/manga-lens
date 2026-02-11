import Link from "next/link"
import { ArrowRight, FolderSync, Globe, Palette, Sparkles, Target, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"

const navLinks = [
  { href: "/docs", label: "文档", prefetch: false },
  { href: "/api-docs", label: "API 文档", prefetch: false },
  { href: "/projects", label: "项目", prefetch: false },
  { href: "/profile", label: "个人中心", prefetch: false },
  { href: "/admin", label: "管理后台", prefetch: false },
]

const features = [
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
]

const useCases = [
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
]

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="fixed left-4 right-4 top-4 z-50">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/95 px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-primary">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="font-display text-lg font-bold">MangaLens</span>
          </Link>

          <div className="hidden items-center gap-1 lg:flex">
            {navLinks.map((item) => (
              <Button key={item.href} variant="ghost" size="sm" asChild>
                <Link href={item.href} prefetch={item.prefetch}>
                  {item.label}
                </Link>
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/sign-in" prefetch={false}>
                登录
              </Link>
            </Button>
            <Button asChild>
              <Link href="/editor" prefetch={false}>
                进入编辑器
              </Link>
            </Button>
          </div>
        </nav>
      </header>

      <main id="main-content">
        <section className="px-4 pb-16 pt-32">
          <div className="mx-auto max-w-6xl text-center">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-4 py-2">
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">AI 驱动 · 选区重绘 · 多模型</span>
            </div>

            <h1 className="mb-5 font-display text-4xl font-bold leading-tight md:text-6xl">
              MangaLens 漫画翻译与局部重绘
            </h1>
            <p className="mx-auto mb-8 max-w-3xl text-lg text-muted-foreground">
              上传图片、框选文本区域、输入提示词，一次性完成漫画文本替换与结果导出。
            </p>

            <div className="flex items-center justify-center gap-3">
              <Button size="lg" asChild>
                <Link href="/editor" prefetch={false}>
                  立即开始
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href="/docs" prefetch={false}>
                  查看文档
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="px-4 py-16">
          <div className="mx-auto max-w-6xl">
            <h2 className="mb-10 text-center font-display text-3xl font-bold">核心能力</h2>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {features.map((item) => (
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
            <h2 className="mb-10 text-center font-display text-3xl font-bold">适用场景</h2>
            <div className="grid gap-6 md:grid-cols-3">
              {useCases.map((item) => (
                <article key={item.number} className="relative overflow-hidden rounded-2xl border border-border/70 bg-card p-7">
                  <span className="absolute right-4 top-4 text-5xl font-bold text-primary/10">{item.number}</span>
                  <h3 className="mb-3 text-xl font-semibold">{item.title}</h3>
                  <p className="text-muted-foreground">{item.description}</p>
                </article>
              ))}
            </div>
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
