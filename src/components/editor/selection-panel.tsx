"use client"

import { useEditorStore, useCurrentImage } from "@/lib/stores/editor-store"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import {
    Square,
    Trash2,
    ImageIcon,
    Info,
    Layers,
    ArrowUpDown,
    AlertTriangle,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface SelectionPanelProps {
    className?: string
}

export function SelectionPanel({ className }: SelectionPanelProps = {}) {
    const {
        locale,
        showResult,
        updateSelections,
    } = useEditorStore()

    const currentImage = useCurrentImage()
    const selections = currentImage?.selections || []

    const getSelectionStatusLabel = (status?: "pending" | "processing" | "completed" | "failed") => {
        if (status === "processing") return locale === "zh" ? "处理中" : "Processing"
        if (status === "completed") return locale === "zh" ? "已完成" : "Completed"
        if (status === "failed") return locale === "zh" ? "失败" : "Failed"
        return locale === "zh" ? "待处理" : "Pending"
    }

    const getSelectionStatusClasses = (status?: "pending" | "processing" | "completed" | "failed") => {
        if (status === "processing") return "bg-blue-500/10 text-blue-600 border-blue-500/30"
        if (status === "completed") return "bg-green-500/10 text-green-600 border-green-500/30"
        if (status === "failed") return "bg-red-500/10 text-red-600 border-red-500/30"
        return "bg-muted text-muted-foreground border-border"
    }

    // 删除单个选区
    const handleDeleteSelection = (selectionId: string) => {
        if (!currentImage) return
        const newSelections = selections.filter((s) => s.id !== selectionId)
        updateSelections(currentImage.id, newSelections)
    }

    // 上移选区
    const handleMoveUp = (index: number) => {
        if (!currentImage || index === 0) return
        const newSelections = [...selections]
        const temp = newSelections[index - 1]
        newSelections[index - 1] = newSelections[index]
        newSelections[index] = temp
        updateSelections(currentImage.id, newSelections)
    }

    // 下移选区
    const handleMoveDown = (index: number) => {
        if (!currentImage || index === selections.length - 1) return
        const newSelections = [...selections]
        const temp = newSelections[index + 1]
        newSelections[index + 1] = newSelections[index]
        newSelections[index] = temp
        updateSelections(currentImage.id, newSelections)
    }

    if (!currentImage) {
        return (
            <div className={cn("w-64 border-l border-border glass-card p-4", className)}>
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <ImageIcon className="h-8 w-8 mb-2 opacity-50" />
                    <p className="text-sm text-center">
                        {locale === "zh" ? "未选择图片" : "No image selected"}
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className={cn("w-64 border-l border-border glass-card flex flex-col h-full overflow-hidden", className)}>
            {/* 图片信息 */}
            <div className="p-4 border-b border-border">
                <div className="flex items-center gap-2 mb-2">
                    <Info className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">
                        {locale === "zh" ? "图片信息" : "Image Info"}
                    </span>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                    <p>{currentImage.file.name}</p>
                    <p>
                        {(currentImage.file.size / 1024).toFixed(1)} KB
                    </p>
                    <Badge
                        variant={
                            currentImage.status === "completed"
                                ? "default"
                                : currentImage.status === "processing"
                                    ? "secondary"
                                    : currentImage.status === "failed"
                                        ? "destructive"
                                        : "outline"
                        }
                        className="mt-1"
                    >
                        {currentImage.status === "completed"
                            ? locale === "zh" ? "已完成" : "Completed"
                            : currentImage.status === "processing"
                                ? locale === "zh" ? "处理中" : "Processing"
                                : currentImage.status === "failed"
                                    ? locale === "zh" ? "失败" : "Failed"
                                    : locale === "zh" ? "待处理" : "Pending"}
                    </Badge>
                    {currentImage.status === "failed" && currentImage.error && (
                        <div className="mt-2 p-2 rounded-md border border-destructive/30 bg-destructive/10 text-destructive">
                            <div className="flex items-center gap-1 mb-1 text-[11px] font-medium">
                                <AlertTriangle className="h-3 w-3" />
                                {locale === "zh" ? "失败详情" : "Failure details"}
                            </div>
                            <p className="text-[11px] leading-relaxed break-words whitespace-pre-wrap">
                                {currentImage.error}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* 选区列表 */}
            <div className="flex-1 flex flex-col min-h-0">
                <div className="p-4 pb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-sm">
                            {locale === "zh" ? "选区" : "Selections"} ({selections.length})
                        </span>
                    </div>
                </div>

                {showResult ? (
                    <div className="flex-1 flex items-center justify-center p-4">
                        <p className="text-sm text-muted-foreground text-center">
                            {locale === "zh"
                                ? "结果预览模式下无法编辑选区"
                                : "Cannot edit selections in result preview"}
                        </p>
                    </div>
                ) : selections.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center p-4">
                        <p className="text-sm text-muted-foreground text-center">
                            {locale === "zh"
                                ? "在画布上绘制矩形选区"
                                : "Draw rectangles on the canvas"}
                        </p>
                    </div>
                ) : (
                    <ScrollArea className="flex-1 h-0 min-h-0 px-4 pb-4">
                        <div className="space-y-2">
                            {selections.map((selection, index) => {
                                const selectionProgress = currentImage.selectionProgress?.[selection.id]
                                const selectionStatus = selectionProgress?.status ?? "pending"
                                const selectionError = selectionProgress?.error

                                return (
                                    <Card
                                        key={selection.id}
                                        className="bg-muted/50"
                                    >
                                        <CardContent className="p-3">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <Square
                                                        className={
                                                            selectionStatus === "completed"
                                                                ? "h-3 w-3 text-green-500"
                                                                : selectionStatus === "failed"
                                                                    ? "h-3 w-3 text-red-500"
                                                                    : selectionStatus === "processing"
                                                                        ? "h-3 w-3 text-blue-500"
                                                                        : "h-3 w-3 text-primary"
                                                        }
                                                    />
                                                    <span className="text-xs font-medium">
                                                        #{index + 1}
                                                    </span>
                                                    <Badge
                                                        variant="outline"
                                                        className={`text-[10px] px-1.5 py-0 h-5 ${getSelectionStatusClasses(selectionStatus)}`}
                                                    >
                                                        {getSelectionStatusLabel(selectionStatus)}
                                                    </Badge>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-11 w-11"
                                                        aria-label={locale === "zh" ? `上移选区 #${index + 1}` : `Move selection #${index + 1} up`}
                                                        onClick={() => handleMoveUp(index)}
                                                        disabled={index === 0}
                                                    >
                                                        <ArrowUpDown className="h-3 w-3 rotate-180" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-11 w-11"
                                                        aria-label={locale === "zh" ? `下移选区 #${index + 1}` : `Move selection #${index + 1} down`}
                                                        onClick={() => handleMoveDown(index)}
                                                        disabled={index === selections.length - 1}
                                                    >
                                                        <ArrowUpDown className="h-3 w-3" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-11 w-11 text-destructive hover:text-destructive"
                                                        aria-label={locale === "zh" ? `删除选区 #${index + 1}` : `Delete selection #${index + 1}`}
                                                        onClick={() => handleDeleteSelection(selection.id)}
                                                    >
                                                        <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                                                <span>X: {Math.round(selection.x)}</span>
                                                <span>Y: {Math.round(selection.y)}</span>
                                                <span>W: {Math.round(selection.width)}</span>
                                                <span>H: {Math.round(selection.height)}</span>
                                            </div>
                                            {selectionStatus === "failed" && selectionError && (
                                                <p className="mt-2 text-[11px] leading-relaxed text-destructive break-words whitespace-pre-wrap">
                                                    {selectionError}
                                                </p>
                                            )}
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                    </ScrollArea>
                )}
            </div>
        </div>
    )
}
