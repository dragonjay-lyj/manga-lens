import Link from "next/link"
import { ArrowLeft, Home, Search } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="pattern-grid absolute inset-0 opacity-40" />
        <div className="absolute left-[-6rem] top-24 h-72 w-72 rounded-full bg-primary/12 blur-3xl" />
        <div className="absolute right-[-6rem] bottom-10 h-72 w-72 rounded-[2rem] bg-accent/25 blur-3xl" />
      </div>

      <div className="surface-card relative w-full max-w-2xl rounded-[2rem] p-8 text-center sm:p-10">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[1.5rem] gradient-primary shadow-[var(--shadow-lg)]">
          <Search className="h-10 w-10 text-white" />
        </div>

        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">404</p>
        <h1 className="text-4xl font-semibold sm:text-5xl">页面未找到</h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">
          抱歉，你访问的页面不存在、已被移动，或者链接已经失效。
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" asChild>
            <Link href="/">
              <Home className="h-4 w-4" />
              返回首页
            </Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link href="/editor">
              <ArrowLeft className="h-4 w-4" />
              打开编辑器
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
