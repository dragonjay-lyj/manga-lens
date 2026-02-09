"use client"

import { useState, useCallback, ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Upload } from "lucide-react"

interface DragDropZoneProps {
    children: ReactNode
    onFilesDropped: (files: File[]) => void
    accept?: string
    className?: string
    disabled?: boolean
}

/**
 * 拖拽上传区域组件
 */
export function DragDropZone({
    children,
    onFilesDropped,
    accept = "image/*",
    className,
    disabled = false,
}: DragDropZoneProps) {
    const [isDragging, setIsDragging] = useState(false)

    const handleDragEnter = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault()
            e.stopPropagation()
            if (!disabled) {
                setIsDragging(true)
            }
        },
        [disabled]
    )

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        // 只有当离开整个区域时才设置为 false
        if (e.currentTarget === e.target) {
            setIsDragging(false)
        }
    }, [])

    const handleDragOver = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault()
            e.stopPropagation()
            if (!disabled) {
                setIsDragging(true)
            }
        },
        [disabled]
    )

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDragging(false)

            if (disabled) return

            const files = Array.from(e.dataTransfer.files)
            const acceptedTypes = accept.split(",").map((t) => t.trim())

            const filteredFiles = files.filter((file) => {
                return acceptedTypes.some((type) => {
                    if (type === "image/*") {
                        return file.type.startsWith("image/")
                    }
                    return file.type === type
                })
            })

            if (filteredFiles.length > 0) {
                onFilesDropped(filteredFiles)
            }
        },
        [accept, disabled, onFilesDropped]
    )

    return (
        // Drag-and-drop area is intentionally pointer-driven; keyboard upload lives in sidebar actions.
        // eslint-disable-next-line a11y/no-static-element-interactions
        <div
            className={cn("relative", className)}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            {children}

            {/* 拖拽覆盖层 */}
            {isDragging && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary/10 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg transition-all">
                    <div className="text-center space-y-2">
                        <div className="w-16 h-16 mx-auto rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
                            <Upload className="h-8 w-8 text-primary" />
                        </div>
                        <p className="text-primary font-medium">释放以上传图片</p>
                    </div>
                </div>
            )}
        </div>
    )
}
