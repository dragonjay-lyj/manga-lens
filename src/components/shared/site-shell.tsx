"use client"

import Link from "next/link"
import { type ReactNode } from "react"
import { useAuth, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs"
import { Sparkles, Menu } from "lucide-react"
import { useEditorStore } from "@/lib/stores/editor-store"
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
import { cn } from "@/lib/utils"

const publicLinks = [
    { href: "/pricing", zh: "定价", en: "Pricing" },
    { href: "/docs", zh: "文档", en: "Docs" },
    { href: "/api-docs", zh: "API 文档", en: "API Docs" },
]

const signedOnlyLinks = [
    { href: "/projects", zh: "项目", en: "Projects" },
    { href: "/profile", zh: "个人中心", en: "Profile" },
    { href: "/admin", zh: "管理后台", en: "Admin" },
]

type SiteShellProps = {
    children: ReactNode
    contentClassName?: string
}

export function SiteShell({ children, contentClassName }: SiteShellProps) {
    const { isSignedIn } = useAuth()
    const { locale, setLocale } = useEditorStore()
    const navLinks = isSignedIn ? [...publicLinks, ...signedOnlyLinks] : publicLinks

    return (
        <div className="min-h-screen bg-background relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                <div className="absolute top-20 -left-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
                <div className="absolute bottom-20 -right-40 w-80 h-80 bg-accent/10 rounded-full blur-3xl" />
            </div>

            <header className="fixed top-4 left-4 right-4 z-50">
                <nav className="max-w-7xl mx-auto glass-card bg-card/95 rounded-2xl px-4 sm:px-6 py-3 flex items-center justify-between gap-2">
                    <Link href="/" className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
                            <Sparkles className="h-5 w-5 text-white" />
                        </div>
                        <span className="font-display font-bold text-lg hidden sm:block">
                            MangaLens
                        </span>
                    </Link>

                    <div className="hidden lg:flex items-center gap-1">
                        {navLinks.map((item) => (
                            <Button key={item.href} variant="ghost" size="sm" className="h-9 px-3" asChild>
                                <Link href={item.href}>{locale === "zh" ? item.zh : item.en}</Link>
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
                                <div className="p-4 space-y-2">
                                    {navLinks.map((item) => (
                                        <SheetClose asChild key={item.href}>
                                            <Link
                                                href={item.href}
                                                className="flex items-center h-11 rounded-md border border-border px-3 text-sm hover:bg-muted transition-colors"
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

                        {isSignedIn ? (
                            <>
                                <Button asChild>
                                    <Link href="/editor">{locale === "zh" ? "进入编辑器" : "Open Editor"}</Link>
                                </Button>
                                <UserButton afterSignOutUrl="/" />
                            </>
                        ) : (
                            <>
                                <SignInButton mode="modal">
                                    <Button variant="ghost" className="hidden sm:inline-flex">
                                        {locale === "zh" ? "登录" : "Sign In"}
                                    </Button>
                                </SignInButton>
                                <SignUpButton mode="modal">
                                    <Button variant="secondary" className="hidden sm:inline-flex">
                                        {locale === "zh" ? "注册" : "Sign Up"}
                                    </Button>
                                </SignUpButton>
                                <Button asChild>
                                    <Link href="/editor">{locale === "zh" ? "免费开始" : "Start Free"}</Link>
                                </Button>
                            </>
                        )}
                    </div>
                </nav>
            </header>

            <main id="main-content" className="pt-28 pb-10 px-4">
                <div className={cn("w-full mx-auto", contentClassName)}>{children}</div>
            </main>
        </div>
    )
}

