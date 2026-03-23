"use client"

import Link from "next/link"
import { type ReactNode } from "react"
import { Menu, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/ui/icon-button"
import { ThemeSwitcher } from "@/components/shared/theme-switcher"
import { LanguageSwitcher } from "@/components/shared/language-switcher"
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
import { cn } from "@/lib/utils"

const navLinks = [
  { href: "/docs", zh: "文档", en: "Docs", prefetch: false },
  { href: "/api-docs", zh: "API 文档", en: "API Docs", prefetch: false },
  { href: "/projects", zh: "项目", en: "Projects", prefetch: false },
  { href: "/profile", zh: "个人中心", en: "Profile", prefetch: false },
  { href: "/admin", zh: "管理后台", en: "Admin", prefetch: false },
]

type SiteShellProps = {
  children: ReactNode
  contentClassName?: string
}

export function SiteShell({ children, contentClassName }: SiteShellProps) {
  const { locale, setLocale } = useEditorStore()
  const signInHref = getSignInHref()

  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="pattern-grid absolute inset-0 opacity-40" />
        <div className="absolute -left-24 top-28 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -right-28 top-44 h-80 w-80 rounded-[2rem] bg-accent/25 blur-3xl" />
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

          <div className="hidden items-center gap-1 lg:flex">
            {navLinks.map((item) => (
              <Button key={item.href} variant="ghost" size="sm" className="h-10 px-4 text-sm" asChild>
                <Link href={item.href} prefetch={item.prefetch}>
                  {locale === "zh" ? item.zh : item.en}
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
                  ariaLabel={locale === "zh" ? "打开导航菜单" : "Open navigation menu"}
                >
                  <Menu className="h-4 w-4" />
                </IconButton>
              </SheetTrigger>
              <SheetContent side="right" className="w-[88vw] p-0 sm:max-w-sm">
                <SheetHeader className="border-b border-border/70">
                  <SheetTitle>{locale === "zh" ? "页面导航" : "Navigation"}</SheetTitle>
                  <SheetDescription>
                    {locale === "zh" ? "快速访问网站主要页面" : "Quick access to the main pages"}
                  </SheetDescription>
                </SheetHeader>
                <div className="space-y-3 p-4">
                  <div className="flex items-center gap-2">
                    <LanguageSwitcher locale={locale} onChange={setLocale} />
                    <ThemeSwitcher locale={locale} />
                  </div>
                  {navLinks.map((item) => (
                    <SheetClose asChild key={item.href}>
                      <Link
                        href={item.href}
                        prefetch={item.prefetch}
                        className="flex h-12 items-center rounded-xl border border-border/70 bg-card/70 px-4 text-sm font-medium transition-[background-color,border-color,color] duration-200 hover:bg-accent hover:text-accent-foreground"
                      >
                        {locale === "zh" ? item.zh : item.en}
                      </Link>
                    </SheetClose>
                  ))}
                </div>
              </SheetContent>
            </Sheet>

            <div className="hidden sm:block">
              <LanguageSwitcher locale={locale} onChange={setLocale} />
            </div>
            <div className="hidden sm:block">
              <ThemeSwitcher locale={locale} />
            </div>

            <Button variant="outline" size="sm" className="hidden sm:inline-flex" asChild>
              <Link href={signInHref} prefetch={false}>
                {locale === "zh" ? "登录" : "Sign In"}
              </Link>
            </Button>
            <Button size="sm" className="shadow-[var(--shadow-md)]" asChild>
              <Link href="/editor" prefetch={false}>
                {locale === "zh" ? "进入编辑器" : "Open Editor"}
              </Link>
            </Button>
          </div>
        </nav>
      </header>

      <main id="main-content" className="px-4 pb-12 pt-14 sm:pt-16">
        <div className={cn("mx-auto w-full", contentClassName)}>{children}</div>
      </main>
    </div>
  )
}
