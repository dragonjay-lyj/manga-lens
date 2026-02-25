"use client"

import { useState, useCallback, ReactNode } from "react"
import { cn } from "@/lib/utils"
import { isEditorSupportedUploadFile } from "@/lib/utils/image-import"
import { Upload } from "lucide-react"

interface DragDropZoneProps {
    children: ReactNode
    onFilesDropped: (files: File[]) => void
    accept?: string
    className?: string
    disabled?: boolean
}

type FileSystemEntryLike = {
    isFile: boolean
    isDirectory: boolean
    name: string
}

type FileSystemFileEntryLike = FileSystemEntryLike & {
    file: (successCallback: (file: File) => void, errorCallback?: (error: DOMException) => void) => void
}

type FileSystemDirectoryEntryLike = FileSystemEntryLike & {
    createReader: () => {
        readEntries: (
            successCallback: (entries: FileSystemEntryLike[]) => void,
            errorCallback?: (error: DOMException) => void
        ) => void
    }
}

type DataTransferItemWithEntry = DataTransferItem & {
    webkitGetAsEntry?: () => FileSystemEntryLike | null
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

    const readFileEntry = useCallback((entry: FileSystemFileEntryLike) => {
        return new Promise<File[]>((resolve) => {
            entry.file(
                (file) => resolve([file]),
                () => resolve([])
            )
        })
    }, [])

    const readDirectoryEntries = useCallback((entry: FileSystemDirectoryEntryLike) => {
        const reader = entry.createReader()
        return new Promise<FileSystemEntryLike[]>((resolve) => {
            const chunks: FileSystemEntryLike[] = []
            const read = () => {
                reader.readEntries(
                    (entries) => {
                        if (!entries.length) {
                            resolve(chunks)
                            return
                        }
                        chunks.push(...entries)
                        read()
                    },
                    () => resolve(chunks)
                )
            }
            read()
        })
    }, [])

    const collectFilesFromEntry = useCallback(
        async function collectFilesFromEntryRecursive(entry: FileSystemEntryLike): Promise<File[]> {
            if (entry.isFile) {
                return readFileEntry(entry as FileSystemFileEntryLike)
            }
            if (entry.isDirectory) {
                const entries = await readDirectoryEntries(entry as FileSystemDirectoryEntryLike)
                const nested = await Promise.all(entries.map((child) => collectFilesFromEntryRecursive(child)))
                return nested.flat()
            }
            return []
        },
        [readDirectoryEntries, readFileEntry]
    )

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
        async (e: React.DragEvent) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDragging(false)

            if (disabled) return

            const dataTransferItems = Array.from(e.dataTransfer.items || [])
            const entryFiles = await Promise.all(
                dataTransferItems.map(async (item) => {
                    const withEntry = item as DataTransferItemWithEntry
                    const entry = withEntry.webkitGetAsEntry?.()
                    if (!entry) return []
                    return collectFilesFromEntry(entry)
                })
            )
            const droppedFiles = entryFiles.flat()
            const files = droppedFiles.length > 0 ? droppedFiles : Array.from(e.dataTransfer.files)
            const acceptedTypes = accept
                .split(",")
                .map((t) => t.trim().toLowerCase())
                .filter(Boolean)
            const acceptedExtensions = new Set(
                acceptedTypes
                    .filter((type) => type.startsWith("."))
                    .map((type) => type.slice(1))
            )
            const acceptedMimeTypes = new Set(
                acceptedTypes.filter((type) => type.includes("/") && type !== "image/*")
            )
            const acceptsImageWildcard = acceptedTypes.includes("image/*")

            const filteredFiles = files.filter((file) => {
                const fileType = file.type.toLowerCase()
                const ext = file.name.includes(".")
                    ? file.name.split(".").pop()?.toLowerCase() || ""
                    : ""

                if (acceptsImageWildcard && isEditorSupportedUploadFile(file)) {
                    return true
                }
                if (acceptedExtensions.has(ext)) {
                    return true
                }
                if (acceptedMimeTypes.has(fileType)) {
                    return true
                }
                return false
            })

            if (filteredFiles.length > 0) {
                onFilesDropped(filteredFiles)
            }
        },
        [accept, collectFilesFromEntry, disabled, onFilesDropped]
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
