"use client"

import Link from "next/link"
import { EditorCanvas } from "@/components/editor/canvas"
import { EditorSidebar } from "@/components/editor/sidebar"
import { EditorToolbar } from "@/components/editor/toolbar"
import { SelectionPanel } from "@/components/editor/selection-panel"
import { GlobalPasteHandler } from "@/components/providers/global-paste-handler"
import { ThemeSwitcher } from "@/components/shared/theme-switcher"
import { LanguageSwitcher } from "@/components/shared/language-switcher"
import { ErrorBoundary } from "@/components/shared/error-boundary"
import { DragDropZone } from "@/components/shared/drag-drop-zone"
import { UserButton } from "@clerk/nextjs"
import { useEditorStore } from "@/lib/stores/editor-store"
import { useKeyboardShortcuts } from "@/lib/hooks/use-keyboard-shortcuts"
import { IconButton } from "@/components/ui/icon-button"
import { Button } from "@/components/ui/button"
import {
    Sheet,
    SheetClose,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Sparkles, Home, Menu, PanelLeft } from "lucide-react"

export default function EditorPage() {
    const { locale, setLocale, addImages } = useEditorStore()
    const navigationItems = [
        { href: "/projects", zh: "项目", en: "Projects" },
        { href: "/profile", zh: "个人中心", en: "Profile" },
        { href: "/docs", zh: "文档", en: "Docs" },
        { href: "/api-docs", zh: "API 文档", en: "API Docs" },
        { href: "/admin", zh: "管理后台", en: "Admin" },
    ]

    // 启用键盘快捷键
    useKeyboardShortcuts()

    // 处理拖拽上传
    const handleFilesDropped = (files: File[]) => {
        addImages(files)
    }

    return (
        <ErrorBoundary>
            <GlobalPasteHandler>
                <DragDropZone
                    onFilesDropped={handleFilesDropped}
                    className="h-screen"
                >
                    <div className="h-full flex flex-col bg-background overflow-hidden">
                        {/* 顶部导航 */}
                        <header className="h-12 border-b border-border glass flex items-center justify-between px-4 gap-2">
                            <div className="flex items-center gap-4">
                                <Link href="/" className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-md gradient-primary flex items-center justify-center">
                                        <Sparkles className="h-4 w-4 text-white" />
                                    </div>
                                    <span className="font-display font-bold text-lg gradient-text">
                                        MangaLens
                                    </span>
                                </Link>
                                <IconButton variant="ghost" ariaLabel={locale === "zh" ? "返回首页" : "Back to home"} asChild>
                                    <Link href="/">
                                        <Home className="h-4 w-4" />
                                    </Link>
                                </IconButton>
                                <nav className="hidden xl:flex items-center gap-1">
                                    {navigationItems.map((item) => (
                                        <Button key={item.href} variant="ghost" size="sm" className="h-9 px-3" asChild>
                                            <Link href={item.href}>
                                                {locale === "zh" ? item.zh : item.en}
                                            </Link>
                                        </Button>
                                    ))}
                                </nav>
                            </div>

                            <div className="flex items-center gap-2">
                                <Sheet>
                                    <SheetTrigger asChild>
                                        <IconButton
                                            variant="ghost"
                                            className="xl:hidden"
                                            ariaLabel={locale === "zh" ? "打开导航菜单" : "Open navigation menu"}
                                        >
                                            <Menu className="h-4 w-4" />
                                        </IconButton>
                                    </SheetTrigger>
                                    <SheetContent side="right" className="w-[85vw] p-0 sm:max-w-sm">
                                        <SheetHeader className="border-b border-border">
                                            <SheetTitle>{locale === "zh" ? "页面导航" : "Navigation"}</SheetTitle>
                                            <SheetDescription>
                                                {locale === "zh" ? "快速跳转到全站核心页面" : "Quick links to key pages"}
                                            </SheetDescription>
                                        </SheetHeader>
                                        <div className="p-4 space-y-2">
                                            {navigationItems.map((item) => (
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

                                <Sheet>
                                    <SheetTrigger asChild>
                                        <IconButton
                                            variant="ghost"
                                            className="md:hidden"
                                            ariaLabel={locale === "zh" ? "打开编辑工具面板" : "Open editor tools panel"}
                                        >
                                            <PanelLeft className="h-4 w-4" />
                                        </IconButton>
                                    </SheetTrigger>
                                    <SheetContent side="left" className="w-full max-w-full p-0 gap-0 sm:max-w-md">
                                        <SheetHeader className="border-b border-border">
                                            <SheetTitle>{locale === "zh" ? "编辑工具" : "Editor Tools"}</SheetTitle>
                                            <SheetDescription>
                                                {locale === "zh"
                                                    ? "在手机端访问上传、设置与选区信息"
                                                    : "Access upload, settings and selection info on mobile"}
                                            </SheetDescription>
                                        </SheetHeader>
                                        <Tabs defaultValue="sidebar" className="flex-1 min-h-0 flex flex-col">
                                            <TabsList className="mx-4 my-3 grid grid-cols-2">
                                                <TabsTrigger value="sidebar">
                                                    {locale === "zh" ? "上传与设置" : "Upload & Settings"}
                                                </TabsTrigger>
                                                <TabsTrigger value="selections">
                                                    {locale === "zh" ? "选区信息" : "Selections"}
                                                </TabsTrigger>
                                            </TabsList>
                                            <TabsContent value="sidebar" className="mt-0 flex-1 min-h-0">
                                                <EditorSidebar className="w-full border-r-0" />
                                            </TabsContent>
                                            <TabsContent value="selections" className="mt-0 flex-1 min-h-0">
                                                <SelectionPanel className="w-full border-l-0" />
                                            </TabsContent>
                                        </Tabs>
                                    </SheetContent>
                                </Sheet>

                                <div className="hidden sm:block">
                                    <ThemeSwitcher locale={locale} />
                                </div>
                                <div className="hidden sm:block">
                                    <LanguageSwitcher locale={locale} onChange={setLocale} />
                                </div>
                                <UserButton afterSwitchSessionUrl="/" />
                            </div>
                        </header>

                        {/* 主工具栏 */}
                        <EditorToolbar />

                        {/* 主内容区域 */}
                        <div className="flex-1 flex overflow-hidden">
                            {/* 左侧边栏 - 移动端隐藏 */}
                            <div className="hidden md:block">
                                <EditorSidebar />
                            </div>

                            {/* 画布区域 */}
                            <main id="main-content" className="flex-1 overflow-hidden">
                                <EditorCanvas />
                            </main>

                            {/* 右侧选区面板 - 移动端隐藏 */}
                            <div className="hidden lg:block">
                                <SelectionPanel />
                            </div>
                        </div>
                    </div>
                </DragDropZone>
            </GlobalPasteHandler>
        </ErrorBoundary>
    )
}


