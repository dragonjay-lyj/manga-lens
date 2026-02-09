"use client"

import { useEffect, useCallback, ReactNode } from "react"
import { useEditorStore } from "@/lib/stores/editor-store"

interface GlobalPasteHandlerProps {
    children: ReactNode
}

/**
 * 全局粘贴处理器
 * 监听 Ctrl+V / Cmd+V 粘贴图片到编辑器
 */
export function GlobalPasteHandler({ children }: GlobalPasteHandlerProps) {
    const { addImages } = useEditorStore()

    const handlePaste = useCallback(
        async (e: ClipboardEvent) => {
            // 如果焦点在输入框中，不处理粘贴
            const target = e.target as HTMLElement
            if (
                target.tagName === "INPUT" ||
                target.tagName === "TEXTAREA" ||
                target.isContentEditable
            ) {
                return
            }

            const items = e.clipboardData?.items
            if (!items) return

            const imageFiles: File[] = []

            for (const item of items) {
                if (item.type.startsWith("image/")) {
                    const file = item.getAsFile()
                    if (file) {
                        imageFiles.push(file)
                    }
                }
            }

            if (imageFiles.length > 0) {
                e.preventDefault()
                addImages(imageFiles)
            }
        },
        [addImages]
    )

    useEffect(() => {
        document.addEventListener("paste", handlePaste)
        return () => {
            document.removeEventListener("paste", handlePaste)
        }
    }, [handlePaste])

    return <>{children}</>
}
