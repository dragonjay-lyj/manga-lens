"use client"

import Image from "next/image"
import {
    HoverCard,
    HoverCardContent,
    HoverCardTrigger,
} from "@/components/ui/hover-card"
import { Badge } from "@/components/ui/badge"
import { IconButton } from "@/components/ui/icon-button"
import { cn } from "@/lib/utils"
import type { ImageItem } from "@/lib/stores/editor-store"
import { X } from "lucide-react"

interface ImagePreviewProps {
    image: ImageItem
    isSelected?: boolean
    onClick?: () => void
    onRemove?: () => void
}

/**
 * 图片预览组件 - 支持悬停放大
 */
export function ImagePreview({
    image,
    isSelected,
    onClick,
    onRemove,
}: ImagePreviewProps) {
    const getStatusColor = (status: ImageItem["status"]) => {
        switch (status) {
            case "processing":
                return "bg-blue-500 animate-pulse"
            case "completed":
                return "bg-green-500"
            case "failed":
                return "bg-red-500"
            default:
                return "bg-gray-400"
        }
    }

    const getStatusText = (status: ImageItem["status"]) => {
        switch (status) {
            case "processing":
                return "处理中"
            case "completed":
                return "已完成"
            case "failed":
                return "失败"
            default:
                return "待处理"
        }
    }

    return (
        <HoverCard openDelay={300} closeDelay={100}>
            <div className="relative group">
                <HoverCardTrigger asChild>
                    <button
                        type="button"
                        className={cn(
                            "relative w-full aspect-video rounded-lg overflow-hidden transition-all text-left",
                            "border-2 hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                            isSelected
                                ? "border-primary ring-2 ring-primary/20"
                                : "border-transparent"
                        )}
                        onClick={onClick}
                        aria-label={`选择图片: ${image.file.name}`}
                    >
                        {/* 缩略图 */}
                        <Image
                            src={image.resultUrl || image.originalUrl}
                            alt={image.file.name}
                            fill
                            className="object-cover"
                            sizes="200px"
                        />

                        {/* 状态指示器 */}
                        <div className="absolute top-1 right-1 pointer-events-none">
                            <div
                                className={cn(
                                    "w-2 h-2 rounded-full",
                                    getStatusColor(image.status)
                                )}
                            />
                        </div>

                        {/* 选区数量 */}
                        {image.selections?.length > 0 && (
                            <Badge
                                variant="secondary"
                                className="absolute bottom-1 left-1 text-xs px-1 py-0 pointer-events-none"
                            >
                                {image.selections.length} 选区
                            </Badge>
                        )}
                    </button>
                </HoverCardTrigger>

                {onRemove && (
                    <IconButton
                        variant="destructive"
                        ariaLabel={`删除图片: ${image.file.name}`}
                        className={cn(
                            "absolute top-1 left-1 z-10 h-11 w-11",
                            "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity"
                        )}
                        onClick={(e) => {
                            e.stopPropagation()
                            onRemove()
                        }}
                    >
                        <X className="h-4 w-4" />
                    </IconButton>
                )}
            </div>

            {/* 悬停预览 */}
            <HoverCardContent
                side="right"
                align="start"
                className="w-80 p-2"
            >
                <div className="space-y-2">
                    <div className="relative aspect-video rounded-md overflow-hidden">
                        <Image
                            src={image.resultUrl || image.originalUrl}
                            alt={image.file.name}
                            fill
                            className="object-contain bg-muted"
                            sizes="320px"
                        />
                    </div>
                    <div className="space-y-1 text-sm">
                        <p className="font-medium truncate">{image.file.name}</p>
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <span>{(image.file.size / 1024).toFixed(1)} KB</span>
                            <span>•</span>
                            <Badge variant="outline" className="text-xs">
                                {getStatusText(image.status)}
                            </Badge>
                        </div>
                        {image.selections?.length > 0 && (
                            <p className="text-muted-foreground">
                                {image.selections.length} 个选区
                            </p>
                        )}
                        {image.error && (
                            <p className="text-destructive text-xs">{image.error}</p>
                        )}
                    </div>
                </div>
            </HoverCardContent>
        </HoverCard>
    )
}
