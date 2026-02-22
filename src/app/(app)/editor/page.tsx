"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
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
import { TRANSLATION_DIRECTIONS, type TranslationDirection } from "@/lib/ai/ai-service"
import { EDITOR_IMAGE_ACCEPT, expandEditorUploadFiles, normalizeEditorImageFiles } from "@/lib/utils/image-import"
import { useKeyboardShortcuts } from "@/lib/hooks/use-keyboard-shortcuts"
import { IconButton } from "@/components/ui/icon-button"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
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
import { Sparkles, Home, Menu, PanelLeft, ChevronLeft, ChevronRight } from "lucide-react"

const LEFT_PANEL_MIN_WIDTH = 300
const LEFT_PANEL_MAX_WIDTH = 560
const RIGHT_PANEL_MIN_WIDTH = 260
const RIGHT_PANEL_MAX_WIDTH = 520
const MIN_MAIN_VIEWPORT_WIDTH = 520
const LEFT_PANEL_WIDTH_STORAGE_KEY = "mangalens.editor.left_panel_width.v1"
const RIGHT_PANEL_WIDTH_STORAGE_KEY = "mangalens.editor.right_panel_width.v1"

function readStoredPanelWidth(
    key: string,
    fallback: number,
    minWidth: number,
    maxWidth: number
) {
    if (typeof window === "undefined") return fallback
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return fallback
    return Math.round(Math.max(minWidth, Math.min(maxWidth, parsed)))
}

export default function EditorPage() {
    const { locale, setLocale, addImages, updateSettings } = useEditorStore()
    const appliedQueryRef = useRef<string | null>(null)
    const resizeStateRef = useRef<{
        side: "left" | "right"
        startX: number
        startWidth: number
    } | null>(null)
    const [leftPanelOpen, setLeftPanelOpen] = useState(true)
    const [rightPanelOpen, setRightPanelOpen] = useState(false)
    const [leftPanelFloating, setLeftPanelFloating] = useState(false)
    const [rightPanelFloating, setRightPanelFloating] = useState(false)
    const [leftPanelWidth, setLeftPanelWidth] = useState(() =>
        readStoredPanelWidth(
            LEFT_PANEL_WIDTH_STORAGE_KEY,
            380,
            LEFT_PANEL_MIN_WIDTH,
            LEFT_PANEL_MAX_WIDTH
        )
    )
    const [rightPanelWidth, setRightPanelWidth] = useState(() =>
        readStoredPanelWidth(
            RIGHT_PANEL_WIDTH_STORAGE_KEY,
            340,
            RIGHT_PANEL_MIN_WIDTH,
            RIGHT_PANEL_MAX_WIDTH
        )
    )
    const [activeResizeSide, setActiveResizeSide] = useState<"left" | "right" | null>(null)
    const navigationItems = [
        { href: "/projects", zh: "项目", en: "Projects" },
        { href: "/profile", zh: "个人中心", en: "Profile" },
        { href: "/docs", zh: "文档", en: "Docs" },
        { href: "/api-docs", zh: "API 文档", en: "API Docs" },
        { href: "/admin", zh: "管理后台", en: "Admin" },
    ]

    // 启用键盘快捷键
    useKeyboardShortcuts()

    useEffect(() => {
        if (typeof window === "undefined") return
        const searchParams = new URLSearchParams(window.location.search)
        const serialized = searchParams.toString()
        if (!serialized || appliedQueryRef.current === serialized) return

        const nextSettings: Parameters<typeof updateSettings>[0] = {}
        const provider = searchParams.get("provider")
        if (provider === "gemini" || provider === "openai") {
            nextSettings.provider = provider
        }
        const model = searchParams.get("model")
        if (model) {
            nextSettings.model = model
        }
        const direction = searchParams.get("direction")
        if (direction && TRANSLATION_DIRECTIONS.includes(direction as TranslationDirection)) {
            nextSettings.translationDirection = direction as TranslationDirection
        }
        if (Object.keys(nextSettings).length > 0) {
            updateSettings(nextSettings)
        }

        const lang = searchParams.get("lang") || searchParams.get("locale")
        if (lang === "zh" || lang === "en") {
            setLocale(lang)
        }

        appliedQueryRef.current = serialized
    }, [setLocale, updateSettings])

    // 处理拖拽上传
    const handleFilesDropped = useCallback(async (files: File[]) => {
        const expandedResult = await expandEditorUploadFiles(files)
        const normalizeResult = await normalizeEditorImageFiles(expandedResult.files)
        if (normalizeResult.files.length > 0) {
            addImages(normalizeResult.files)
        }

        if (expandedResult.archiveExpandedEntries > 0) {
            toast.success(
                locale === "zh"
                    ? `已从 ${expandedResult.archiveSourceFiles} 个压缩包中解包 ${expandedResult.archiveExpandedEntries} 个文件`
                    : `Extracted ${expandedResult.archiveExpandedEntries} files from ${expandedResult.archiveSourceFiles} archive(s)`
            )
        }
        if (expandedResult.unsupportedArchives.length > 0) {
            toast.warning(
                locale === "zh"
                    ? `暂不支持直接读取 ${expandedResult.unsupportedArchives.length} 个 RAR/7z 压缩包`
                    : `${expandedResult.unsupportedArchives.length} RAR/7z archives are not supported yet`
            )
        }

        if (normalizeResult.convertedCount > 0) {
            toast.success(
                locale === "zh"
                    ? `已将 ${normalizeResult.convertedCount} 个 TIFF/PSD 文件转换为 PNG`
                    : `Converted ${normalizeResult.convertedCount} TIFF/PSD files to PNG`
            )
        }

        if (normalizeResult.pdfExpandedPages > 0) {
            toast.success(
                locale === "zh"
                    ? `已拆分 ${normalizeResult.pdfSourceFiles} 个 PDF，共 ${normalizeResult.pdfExpandedPages} 页`
                    : `Expanded ${normalizeResult.pdfSourceFiles} PDF file(s) into ${normalizeResult.pdfExpandedPages} pages`
            )
        }

        const allFailed = [...expandedResult.failed, ...normalizeResult.failed]
        if (allFailed.length > 0) {
            const preview = allFailed
                .slice(0, 2)
                .map((item) => `${item.fileName} (${item.reason})`)
                .join("; ")
            toast.warning(
                locale === "zh"
                    ? `有 ${allFailed.length} 个文件未导入：${preview}`
                    : `${allFailed.length} files were not imported: ${preview}`
            )
        }
    }, [addImages, locale])

    const leftDockedVisible = leftPanelOpen && !leftPanelFloating
    const rightDockedVisible = rightPanelOpen && !rightPanelFloating
    const leftFloatingVisible = leftPanelOpen && leftPanelFloating
    const rightFloatingVisible = rightPanelOpen && rightPanelFloating

    const leftPanelTitle = locale === "zh" ? "上传与设置" : "Upload & Settings"
    const rightPanelTitle = locale === "zh" ? "选区信息" : "Selections"
    const leftPanelWidthClamped = Math.max(LEFT_PANEL_MIN_WIDTH, Math.min(LEFT_PANEL_MAX_WIDTH, leftPanelWidth))
    const rightPanelWidthClamped = Math.max(RIGHT_PANEL_MIN_WIDTH, Math.min(RIGHT_PANEL_MAX_WIDTH, rightPanelWidth))

    const clampPanelWidth = useCallback((
        side: "left" | "right",
        requestedWidth: number
    ) => {
        const minWidth = side === "left" ? LEFT_PANEL_MIN_WIDTH : RIGHT_PANEL_MIN_WIDTH
        const maxWidth = side === "left" ? LEFT_PANEL_MAX_WIDTH : RIGHT_PANEL_MAX_WIDTH
        if (typeof window === "undefined") {
            return Math.round(Math.max(minWidth, Math.min(maxWidth, requestedWidth)))
        }
        const otherWidth = side === "left"
            ? (rightDockedVisible ? rightPanelWidthClamped : 0)
            : (leftDockedVisible ? leftPanelWidthClamped : 0)
        const viewportBound = Math.max(minWidth, window.innerWidth - otherWidth - MIN_MAIN_VIEWPORT_WIDTH)
        const effectiveMax = Math.max(minWidth, Math.min(maxWidth, viewportBound))
        return Math.round(Math.max(minWidth, Math.min(effectiveMax, requestedWidth)))
    }, [leftDockedVisible, leftPanelWidthClamped, rightDockedVisible, rightPanelWidthClamped])

    const startResize = useCallback((
        side: "left" | "right",
        event: React.PointerEvent<HTMLElement>
    ) => {
        const startWidth = side === "left" ? leftPanelWidthClamped : rightPanelWidthClamped
        resizeStateRef.current = {
            side,
            startX: event.clientX,
            startWidth,
        }
        setActiveResizeSide(side)
        document.body.style.cursor = "col-resize"
        document.body.style.userSelect = "none"
    }, [leftPanelWidthClamped, rightPanelWidthClamped])

    const stopResize = useCallback(() => {
        resizeStateRef.current = null
        setActiveResizeSide(null)
        document.body.style.removeProperty("cursor")
        document.body.style.removeProperty("user-select")
    }, [])

    useEffect(() => {
        if (!activeResizeSide) return
        const handlePointerMove = (event: PointerEvent) => {
            const state = resizeStateRef.current
            if (!state) return
            const deltaX = event.clientX - state.startX
            const nextRawWidth = state.side === "left"
                ? state.startWidth + deltaX
                : state.startWidth - deltaX
            const nextWidth = clampPanelWidth(state.side, nextRawWidth)
            if (state.side === "left") {
                setLeftPanelWidth(nextWidth)
                return
            }
            setRightPanelWidth(nextWidth)
        }

        const handlePointerUp = () => {
            stopResize()
        }

        window.addEventListener("pointermove", handlePointerMove)
        window.addEventListener("pointerup", handlePointerUp)
        window.addEventListener("pointercancel", handlePointerUp)

        return () => {
            window.removeEventListener("pointermove", handlePointerMove)
            window.removeEventListener("pointerup", handlePointerUp)
            window.removeEventListener("pointercancel", handlePointerUp)
            document.body.style.removeProperty("cursor")
            document.body.style.removeProperty("user-select")
        }
    }, [activeResizeSide, clampPanelWidth, stopResize])

    const handleSplitterKeyDown = useCallback((
        side: "left" | "right",
        event: React.KeyboardEvent<HTMLElement>
    ) => {
        const step = event.shiftKey ? 24 : 12
        const isDecreaseKey = side === "left" ? event.key === "ArrowLeft" : event.key === "ArrowRight"
        const isIncreaseKey = side === "left" ? event.key === "ArrowRight" : event.key === "ArrowLeft"
        if (!isDecreaseKey && !isIncreaseKey) return
        event.preventDefault()
        const current = side === "left" ? leftPanelWidthClamped : rightPanelWidthClamped
        const nextRequested = isIncreaseKey ? current + step : current - step
        const nextWidth = clampPanelWidth(side, nextRequested)
        if (side === "left") {
            setLeftPanelWidth(nextWidth)
            return
        }
        setRightPanelWidth(nextWidth)
    }, [clampPanelWidth, leftPanelWidthClamped, rightPanelWidthClamped])

    useEffect(() => {
        if (typeof window === "undefined") return
        window.localStorage.setItem(
            LEFT_PANEL_WIDTH_STORAGE_KEY,
            String(Math.round(leftPanelWidthClamped))
        )
    }, [leftPanelWidthClamped])

    useEffect(() => {
        if (typeof window === "undefined") return
        window.localStorage.setItem(
            RIGHT_PANEL_WIDTH_STORAGE_KEY,
            String(Math.round(rightPanelWidthClamped))
        )
    }, [rightPanelWidthClamped])

    return (
        <ErrorBoundary>
            <GlobalPasteHandler>
                <DragDropZone
                    onFilesDropped={handleFilesDropped}
                    accept={EDITOR_IMAGE_ACCEPT}
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
                                <div className="hidden md:flex items-center gap-1 rounded-lg border border-border/70 bg-card/70 px-1 py-1">
                                    <Button
                                        type="button"
                                        variant={leftPanelOpen ? "secondary" : "ghost"}
                                        size="sm"
                                        className="h-8 px-2 text-xs"
                                        onClick={() => setLeftPanelOpen((prev) => !prev)}
                                    >
                                        <ChevronLeft className={`h-3.5 w-3.5 mr-1 transition-transform ${leftPanelOpen ? "" : "rotate-180"}`} />
                                        {locale === "zh" ? "左侧栏" : "Left Panel"}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={leftPanelFloating ? "secondary" : "ghost"}
                                        size="sm"
                                        className="h-8 px-2 text-xs"
                                        onClick={() => {
                                            setLeftPanelOpen(true)
                                            setLeftPanelFloating((prev) => !prev)
                                        }}
                                    >
                                        {locale === "zh" ? (leftPanelFloating ? "停靠左栏" : "浮动左栏") : (leftPanelFloating ? "Dock Left" : "Float Left")}
                                    </Button>
                                    <div className="mx-1 h-5 w-px bg-border hidden lg:block" />
                                    <Button
                                        type="button"
                                        variant={rightPanelOpen ? "secondary" : "ghost"}
                                        size="sm"
                                        className="hidden lg:inline-flex h-8 px-2 text-xs"
                                        onClick={() => setRightPanelOpen((prev) => !prev)}
                                    >
                                        {locale === "zh" ? "右侧栏" : "Right Panel"}
                                        <ChevronRight className={`h-3.5 w-3.5 ml-1 transition-transform ${rightPanelOpen ? "" : "rotate-180"}`} />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={rightPanelFloating ? "secondary" : "ghost"}
                                        size="sm"
                                        className="hidden lg:inline-flex h-8 px-2 text-xs"
                                        onClick={() => {
                                            setRightPanelOpen(true)
                                            setRightPanelFloating((prev) => !prev)
                                        }}
                                    >
                                        {locale === "zh" ? (rightPanelFloating ? "停靠右栏" : "浮动右栏") : (rightPanelFloating ? "Dock Right" : "Float Right")}
                                    </Button>
                                </div>

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
                        <div className="relative flex-1 flex overflow-hidden">
                            {/* 左侧边栏 - 移动端隐藏 */}
                            {leftDockedVisible && (
                                <aside
                                    className="hidden md:block h-full shrink-0 border-r border-border/70 bg-background/80 backdrop-blur overflow-hidden"
                                    style={{ width: `${leftPanelWidthClamped}px` }}
                                >
                                    <EditorSidebar className="h-full w-full border-r-0" />
                                </aside>
                            )}

                            {leftDockedVisible && (
                                <button
                                    type="button"
                                    aria-label={locale === "zh" ? "调整左侧栏宽度" : "Resize left panel"}
                                    title={locale === "zh" ? "拖拽或方向键调整左侧栏宽度" : "Drag or use arrow keys to resize left panel"}
                                    className={`relative hidden md:flex w-2 shrink-0 cursor-col-resize items-center justify-center bg-border/40 transition-colors hover:bg-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${activeResizeSide === "left" ? "bg-primary/70" : ""}`}
                                    onPointerDown={(event) => startResize("left", event)}
                                    onKeyDown={(event) => handleSplitterKeyDown("left", event)}
                                >
                                    <span className="h-9 w-px rounded-full bg-border/80" />
                                </button>
                            )}

                            {/* 画布区域 */}
                            <main id="main-content" className="relative flex-1 min-w-0 overflow-hidden">
                                <EditorCanvas />
                            </main>

                            {/* 右侧选区面板 - 移动端隐藏 */}
                            {rightDockedVisible && (
                                <button
                                    type="button"
                                    aria-label={locale === "zh" ? "调整右侧栏宽度" : "Resize right panel"}
                                    title={locale === "zh" ? "拖拽或方向键调整右侧栏宽度" : "Drag or use arrow keys to resize right panel"}
                                    className={`relative hidden lg:flex w-2 shrink-0 cursor-col-resize items-center justify-center bg-border/40 transition-colors hover:bg-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${activeResizeSide === "right" ? "bg-primary/70" : ""}`}
                                    onPointerDown={(event) => startResize("right", event)}
                                    onKeyDown={(event) => handleSplitterKeyDown("right", event)}
                                >
                                    <span className="h-9 w-px rounded-full bg-border/80" />
                                </button>
                            )}

                            {rightDockedVisible && (
                                <aside
                                    className="hidden lg:block h-full shrink-0 border-l border-border/70 bg-background/80 backdrop-blur overflow-hidden"
                                    style={{ width: `${rightPanelWidthClamped}px` }}
                                >
                                    <SelectionPanel className="h-full w-full border-l-0" />
                                </aside>
                            )}

                            {leftFloatingVisible && (
                                <aside className="absolute inset-y-3 left-3 z-30 hidden md:flex w-[min(94vw,420px)] flex-col overflow-hidden rounded-xl border border-border/70 bg-background/95 shadow-2xl backdrop-blur">
                                    <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
                                        <p className="text-sm font-medium">{leftPanelTitle}</p>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 px-2 text-xs"
                                                onClick={() => setLeftPanelFloating(false)}
                                            >
                                                {locale === "zh" ? "停靠" : "Dock"}
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 px-2 text-xs"
                                                onClick={() => setLeftPanelOpen(false)}
                                            >
                                                {locale === "zh" ? "收起" : "Hide"}
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="min-h-0 flex-1 overflow-hidden">
                                        <EditorSidebar className="h-full w-full border-r-0" />
                                    </div>
                                </aside>
                            )}

                            {rightFloatingVisible && (
                                <aside className="absolute inset-y-3 right-3 z-30 hidden lg:flex w-[min(90vw,380px)] flex-col overflow-hidden rounded-xl border border-border/70 bg-background/95 shadow-2xl backdrop-blur">
                                    <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
                                        <p className="text-sm font-medium">{rightPanelTitle}</p>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 px-2 text-xs"
                                                onClick={() => setRightPanelFloating(false)}
                                            >
                                                {locale === "zh" ? "停靠" : "Dock"}
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 px-2 text-xs"
                                                onClick={() => setRightPanelOpen(false)}
                                            >
                                                {locale === "zh" ? "收起" : "Hide"}
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="min-h-0 flex-1 overflow-hidden">
                                        <SelectionPanel className="h-full w-full border-l-0" />
                                    </div>
                                </aside>
                            )}

                            {!leftPanelOpen && (
                                <div className="absolute left-2 top-1/2 z-20 hidden md:block -translate-y-1/2">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        className="h-9 px-2 text-xs shadow-md"
                                        onClick={() => setLeftPanelOpen(true)}
                                    >
                                        <ChevronRight className="h-3.5 w-3.5 mr-1" />
                                        {locale === "zh" ? "工具" : "Tools"}
                                    </Button>
                                </div>
                            )}

                            {!rightPanelOpen && (
                                <div className="absolute right-2 top-1/2 z-20 hidden lg:block -translate-y-1/2">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        className="h-9 px-2 text-xs shadow-md"
                                        onClick={() => setRightPanelOpen(true)}
                                    >
                                        {locale === "zh" ? "选区" : "Selections"}
                                        <ChevronLeft className="h-3.5 w-3.5 ml-1" />
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </DragDropZone>
            </GlobalPasteHandler>
        </ErrorBoundary>
    )
}


