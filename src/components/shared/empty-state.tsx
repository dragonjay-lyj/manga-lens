"use client"

import { Button } from "@/components/ui/button"
import { Upload, FolderOpen, Clipboard, ImageIcon } from "lucide-react"

interface EmptyStateProps {
    onUploadClick?: () => void
    onFolderClick?: () => void
    onPasteClick?: () => void
}

/**
 * 编辑器空状态组件 - 当没有图片时显示
 */
export function EditorEmptyState({
    onUploadClick,
    onFolderClick,
    onPasteClick,
}: EmptyStateProps) {
    return (
        <div className="h-full flex items-center justify-center p-8">
            <div className="text-center space-y-6 max-w-md">
                {/* 图标 */}
                <div className="relative mx-auto w-24 h-24">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5 rounded-2xl rotate-6" />
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/30 to-primary/10 rounded-2xl -rotate-3" />
                    <div className="relative h-full flex items-center justify-center bg-background border-2 border-dashed border-primary/30 rounded-2xl">
                        <ImageIcon className="h-10 w-10 text-primary/50" />
                    </div>
                </div>

                {/* 文字 */}
                <div className="space-y-2">
                    <h3 className="text-xl font-semibold">开始您的创作</h3>
                    <p className="text-muted-foreground text-sm">
                        上传图片开始使用 AI 局部重绘功能。支持单张上传、批量上传或直接粘贴。
                    </p>
                </div>

                {/* 操作按钮 */}
                <div className="flex flex-col gap-2">
                    <Button onClick={onUploadClick} className="w-full">
                        <Upload className="h-4 w-4 mr-2" />
                        上传图片
                    </Button>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            onClick={onFolderClick}
                            className="flex-1"
                        >
                            <FolderOpen className="h-4 w-4 mr-2" />
                            上传文件夹
                        </Button>
                        <Button
                            variant="outline"
                            onClick={onPasteClick}
                            className="flex-1"
                        >
                            <Clipboard className="h-4 w-4 mr-2" />
                            粘贴图片
                        </Button>
                    </div>
                </div>

                {/* 提示 */}
                <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                        <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Ctrl</kbd>
                        <span>+</span>
                        <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">V</kbd>
                        <span>粘贴</span>
                    </span>
                    <span>|</span>
                    <span>拖拽图片到此处</span>
                </div>
            </div>
        </div>
    )
}

/**
 * 通用空状态组件
 */
export function EmptyState({
    icon: Icon = ImageIcon,
    title,
    description,
    action,
}: {
    icon?: React.ElementType
    title: string
    description?: string
    action?: React.ReactNode
}) {
    return (
        <div className="h-full min-h-[200px] flex items-center justify-center p-8">
            <div className="text-center space-y-4 max-w-sm">
                <div className="w-12 h-12 mx-auto rounded-full bg-muted flex items-center justify-center">
                    <Icon className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                    <h3 className="font-medium">{title}</h3>
                    {description && (
                        <p className="text-sm text-muted-foreground">{description}</p>
                    )}
                </div>
                {action}
            </div>
        </div>
    )
}
