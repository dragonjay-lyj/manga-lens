"use client"

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
import Link from "next/link"
import { Sparkles, Home } from "lucide-react"

export default function EditorPage() {
    const { locale, setLocale, addImages } = useEditorStore()

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
                        <header className="h-12 border-b border-border glass flex items-center justify-between px-4">
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
                            </div>

                            <div className="flex items-center gap-2">
                                <ThemeSwitcher locale={locale} />
                                <LanguageSwitcher locale={locale} onChange={setLocale} />
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


