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

    return (
        <div className="relative min-h-screen overflow-hidden bg-background">
            <div className="pointer-events-none absolute left-0 top-0 hidden h-full w-full md:block">
                <div className="absolute -left-40 top-20 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
                <div className="absolute -right-40 bottom-20 h-80 w-80 rounded-full bg-accent/10 blur-3xl" />
            </div>

            <header className="fixed left-4 right-4 top-6 z-50">
                <nav className="mx-auto flex max-w-7xl items-center justify-between gap-2 rounded-2xl border border-border/70 bg-card/95 px-4 py-3.5 shadow-sm backdrop-blur">
                    <Link href="/" className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-primary">
                            <Sparkles className="h-5 w-5 text-white" />
                        </div>
                        <span className="hidden font-display text-lg font-bold sm:block">MangaLens</span>
                    </Link>

                    <div className="hidden items-center gap-1 py-1 lg:flex">
                        {navLinks.map((item) => (
                            <Button key={item.href} variant="ghost" size="sm" className="h-9 px-3" asChild>
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
                                    className="lg:hidden"
                                    ariaLabel={locale === "zh" ? "打开导航菜单" : "Open navigation menu"}
                                >
                                    <Menu className="h-4 w-4" />
                                </IconButton>
                            </SheetTrigger>
                            <SheetContent side="right" className="w-[85vw] p-0 sm:max-w-sm">
                                <SheetHeader className="border-b border-border">
                                    <SheetTitle>{locale === "zh" ? "页面导航" : "Navigation"}</SheetTitle>
                                    <SheetDescription>
                                        {locale === "zh" ? "快速访问网站主要页面" : "Quick access to main pages"}
                                    </SheetDescription>
                                </SheetHeader>
                                <div className="space-y-2 p-4">
                                    {navLinks.map((item) => (
                                        <SheetClose asChild key={item.href}>
                                            <Link
                                                href={item.href}
                                                prefetch={item.prefetch}
                                                className="flex h-11 items-center rounded-md border border-border px-3 text-sm transition-colors hover:bg-muted"
                                            >
                                                {locale === "zh" ? item.zh : item.en}
                                            </Link>
                                        </SheetClose>
                                    ))}
                                </div>
                            </SheetContent>
                        </Sheet>

                        <div className="hidden sm:block">
                            <ThemeSwitcher locale={locale} />
                        </div>
                        <div className="hidden sm:block">
                            <LanguageSwitcher locale={locale} onChange={setLocale} />
                        </div>

                        <Button variant="outline" size="sm" asChild>
                            <Link href="/sign-in" prefetch={false}>
                                {locale === "zh" ? "登录" : "Sign In"}
                            </Link>
                        </Button>
                        <Button size="sm" asChild>
                            <Link href="/editor" prefetch={false}>
                                {locale === "zh" ? "进入编辑器" : "Open Editor"}
                            </Link>
                        </Button>
                    </div>
                </nav>
            </header>

            <main id="main-content" className="px-4 pb-10 pt-32">
                <div className={cn("mx-auto w-full", contentClassName)}>{children}</div>
            </main>
        </div>
    )
}
