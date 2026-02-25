"use client"

import { useEffect, useCallback } from "react"
import { useEditorStore, useCurrentImage } from "@/lib/stores/editor-store"
import { toast } from "sonner"

interface KeyboardShortcutsOptions {
    onGenerate?: () => void
    onBatchGenerate?: () => void
}

/**
 * 键盘快捷键 Hook
 * - Ctrl+V: 粘贴图片（由 GlobalPasteHandler 处理）
 * - Ctrl+Z: 撤销
 * - Ctrl+Shift+Z / Ctrl+Y: 重做
 * - Ctrl+S: 保存项目（阻止默认行为）
 * - Delete / Backspace: 删除当前活动选区
 * - Escape: 取消当前操作
 * - +/-: 缩放
 * - 0: 重置视图
 */
export function useKeyboardShortcuts(options: KeyboardShortcutsOptions = {}) {
    const {
        images,
        currentImageId,
        showResult,
        zoom,
        setZoom,
        resetView,
        setShowResult,
        setCurrentImage,
        undo,
        redo,
        canUndo,
        canRedo,
    } = useEditorStore()

    const currentImage = useCurrentImage()

    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            // 如果焦点在输入框中，不处理快捷键
            const target = e.target as HTMLElement
            if (
                target.tagName === "INPUT" ||
                target.tagName === "TEXTAREA" ||
                target.isContentEditable
            ) {
                return
            }

            const isCtrlOrCmd = e.ctrlKey || e.metaKey

            // Ctrl+Z: 撤销
            if (isCtrlOrCmd && e.key === "z" && !e.shiftKey) {
                e.preventDefault()
                if (canUndo?.()) {
                    undo?.()
                    toast.info("已撤销")
                }
                return
            }

            // Ctrl+Shift+Z 或 Ctrl+Y: 重做
            if (
                (isCtrlOrCmd && e.key === "z" && e.shiftKey) ||
                (isCtrlOrCmd && e.key === "y")
            ) {
                e.preventDefault()
                if (canRedo?.()) {
                    redo?.()
                    toast.info("已重做")
                }
                return
            }

            // Ctrl+S: 保存（阻止默认行为）
            if (isCtrlOrCmd && e.key === "s") {
                e.preventDefault()
                toast.info("项目已自动保存到本地")
                return
            }

            // Ctrl+F: 当前页查找
            if (isCtrlOrCmd && e.key.toLowerCase() === "f") {
                e.preventDefault()
                window.dispatchEvent(new CustomEvent("mangalens:focus-find", { detail: { global: false } }))
                return
            }

            // Ctrl+G: 全局查找
            if (isCtrlOrCmd && e.key.toLowerCase() === "g") {
                e.preventDefault()
                window.dispatchEvent(new CustomEvent("mangalens:focus-find", { detail: { global: true } }))
                return
            }

            // Delete / Backspace: 删除
            if (e.key === "Delete" || e.key === "Backspace") {
                e.preventDefault()
                window.dispatchEvent(new CustomEvent("mangalens:delete-active-selection"))
                return
            }

            // Escape: 取消操作
            if (e.key === "Escape") {
                e.preventDefault()
                if (showResult) {
                    setShowResult(false)
                }
                return
            }

            // +/=: 放大
            if (e.key === "+" || e.key === "=") {
                e.preventDefault()
                setZoom(zoom + 0.1)
                return
            }

            // -: 缩小
            if (e.key === "-") {
                e.preventDefault()
                setZoom(zoom - 0.1)
                return
            }

            // 0: 重置视图
            if (e.key === "0" && !isCtrlOrCmd) {
                e.preventDefault()
                resetView()
                return
            }

            // Space: 切换原图/结果
            if (e.key === " " && currentImage?.resultUrl) {
                e.preventDefault()
                setShowResult(!showResult)
                return
            }

            // A / D / PageUp / PageDown: 翻页（切换图片）
            if (images.length > 1 && (e.key.toLowerCase() === "a" || e.key === "PageUp")) {
                e.preventDefault()
                const currentIndex = images.findIndex((img) => img.id === currentImageId)
                const prevIndex = currentIndex <= 0 ? images.length - 1 : currentIndex - 1
                setCurrentImage(images[prevIndex]?.id || null)
                return
            }
            if (images.length > 1 && (e.key.toLowerCase() === "d" || e.key === "PageDown")) {
                e.preventDefault()
                const currentIndex = images.findIndex((img) => img.id === currentImageId)
                const nextIndex = currentIndex < 0 || currentIndex >= images.length - 1 ? 0 : currentIndex + 1
                setCurrentImage(images[nextIndex]?.id || null)
                return
            }

            // Enter: 生成
            if (e.key === "Enter" && isCtrlOrCmd) {
                e.preventDefault()
                options.onGenerate?.()
                return
            }

            // Shift+Enter: 批量生成
            if (e.key === "Enter" && e.shiftKey) {
                e.preventDefault()
                options.onBatchGenerate?.()
                return
            }
        },
        [
            zoom,
            showResult,
            currentImage,
            canUndo,
            canRedo,
            undo,
            redo,
            setZoom,
            resetView,
            setShowResult,
            options,
            images,
            currentImageId,
            setCurrentImage,
        ]
    )

    useEffect(() => {
        document.addEventListener("keydown", handleKeyDown)
        return () => {
            document.removeEventListener("keydown", handleKeyDown)
        }
    }, [handleKeyDown])
}

/**
 * 快捷键提示组件
 */
export function ShortcutsHelpButton() {
    return null // 可以后续添加一个帮助按钮
}
