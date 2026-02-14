"use client"

import { useMemo, useState } from "react"
import type { Selection } from "@/types/database"
import { useEditorStore, useCurrentImage } from "@/lib/stores/editor-store"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
    Square,
    Trash2,
    ImageIcon,
    Info,
    Layers,
    ArrowUpDown,
    AlertTriangle,
    Copy,
    ClipboardPaste,
    Plus,
    Minus,
    Circle,
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
        setGuides,
        clearGuides,
        setAnnotationShapes,
        clearAnnotationShapes,
    } = useEditorStore()

    const currentImage = useCurrentImage()
    const selections = currentImage?.selections || []
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [copiedSelections, setCopiedSelections] = useState<Selection[]>([])
    const [guideOrientation, setGuideOrientation] = useState<"vertical" | "horizontal">("vertical")
    const [guidePosition, setGuidePosition] = useState("")
    const [shapeType, setShapeType] = useState<"rect" | "ellipse">("rect")
    const [shapeStrokeColor, setShapeStrokeColor] = useState("#ef4444")
    const [shapeFillColor, setShapeFillColor] = useState("#ef4444")
    const [shapeOpacity, setShapeOpacity] = useState("30")
    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
    const guides = currentImage?.guides || []
    const shapes = currentImage?.annotationShapes || []

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
        setSelectedIds((prev) => prev.filter((id) => id !== selectionId))
    }

    const toggleSelection = (selectionId: string, checked: boolean) => {
        setSelectedIds((prev) => {
            if (checked) return prev.includes(selectionId) ? prev : [...prev, selectionId]
            return prev.filter((id) => id !== selectionId)
        })
    }

    const handleCopySelectedAreas = () => {
        const copied = selections.filter((selection) => selectedSet.has(selection.id))
        if (!copied.length) return
        setCopiedSelections(copied.map((selection) => ({ ...selection })))
    }

    const handleSelectAll = () => {
        setSelectedIds(selections.map((selection) => selection.id))
    }

    const handleClearSelected = () => {
        setSelectedIds([])
    }

    const handlePasteSideBySide = () => {
        if (!currentImage || !copiedSelections.length) return
        const minX = Math.min(...copiedSelections.map((selection) => selection.x))
        const currentMaxRight = selections.reduce((max, selection) => Math.max(max, selection.x + selection.width), 0)
        const targetStartX = currentMaxRight + 16
        const shiftX = targetStartX - minX

        const pastedSelections = copiedSelections.map((selection, index) => ({
            ...selection,
            id: `sel-copy-${Date.now()}-${index}`,
            x: Math.max(0, Math.round(selection.x + shiftX)),
            y: Math.max(0, Math.round(selection.y)),
        }))

        const nextSelections = [...selections, ...pastedSelections]
        updateSelections(currentImage.id, nextSelections)

        setSelectedIds(pastedSelections.map((selection) => selection.id))
    }

    const handleAddGuide = () => {
        if (!currentImage) return
        const position = Number(guidePosition)
        if (!Number.isFinite(position) || position < 0) return
        const nextGuides = [...guides, {
            id: `guide-${Date.now()}`,
            orientation: guideOrientation,
            position,
        }]
        setGuides(currentImage.id, nextGuides)
        setGuidePosition("")
    }

    const handleAddShapesFromSelected = () => {
        if (!currentImage) return
        const selected = selections.filter((selection) => selectedSet.has(selection.id))
        if (!selected.length) return

        const opacityPercent = Number(shapeOpacity)
        const opacity = Number.isFinite(opacityPercent)
            ? Math.max(0.05, Math.min(1, opacityPercent / 100))
            : 0.3

        const appended = selected.map((selection, index) => ({
            id: `shape-${Date.now()}-${index}`,
            type: shapeType,
            x: Math.round(selection.x),
            y: Math.round(selection.y),
            width: Math.max(1, Math.round(selection.width)),
            height: Math.max(1, Math.round(selection.height)),
            strokeColor: shapeStrokeColor,
            fillColor: shapeFillColor,
            opacity,
        }))

        setAnnotationShapes(currentImage.id, [...shapes, ...appended])
    }

    const handleRemoveShape = (shapeId: string) => {
        if (!currentImage) return
        setAnnotationShapes(
            currentImage.id,
            shapes.filter((shape) => shape.id !== shapeId)
        )
    }

    const handleShapeOpacityChange = (shapeId: string, nextOpacity: number) => {
        if (!currentImage) return
        setAnnotationShapes(
            currentImage.id,
            shapes.map((shape) =>
                shape.id === shapeId
                    ? { ...shape, opacity: Math.max(0.05, Math.min(1, nextOpacity)) }
                    : shape
            )
        )
    }

    const handleRemoveGuide = (guideId: string) => {
        if (!currentImage) return
        setGuides(
            currentImage.id,
            guides.filter((guide) => guide.id !== guideId)
        )
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
                    <div className="flex-1 p-4 space-y-3">
                        <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
                            {locale === "zh" ? "在画布上绘制矩形选区" : "Draw rectangles on the canvas"}
                        </div>
                        <div className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium">
                                    {locale === "zh" ? "参考线" : "Guides"}
                                </span>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => currentImage && clearGuides(currentImage.id)}
                                    disabled={guides.length === 0}
                                >
                                    {locale === "zh" ? "清空" : "Clear"}
                                </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <Button
                                    type="button"
                                    variant={guideOrientation === "vertical" ? "secondary" : "outline"}
                                    className="h-8 text-xs"
                                    onClick={() => setGuideOrientation("vertical")}
                                >
                                    {locale === "zh" ? "竖线" : "Vertical"}
                                </Button>
                                <Button
                                    type="button"
                                    variant={guideOrientation === "horizontal" ? "secondary" : "outline"}
                                    className="h-8 text-xs"
                                    onClick={() => setGuideOrientation("horizontal")}
                                >
                                    {locale === "zh" ? "横线" : "Horizontal"}
                                </Button>
                            </div>
                            <div className="flex items-center gap-2">
                                <Input
                                    type="number"
                                    min={0}
                                    value={guidePosition}
                                    onChange={(e) => setGuidePosition(e.target.value)}
                                    placeholder={locale === "zh" ? "像素位置" : "Pixel position"}
                                    className="h-8 text-xs"
                                />
                                <Button type="button" size="sm" className="h-8 px-2" onClick={handleAddGuide}>
                                    <Plus className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <ScrollArea className="flex-1 h-0 min-h-0 px-4 pb-4">
                        <div className="space-y-3">
                            <div className="rounded-md border border-border/60 bg-muted/30 p-2 space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                    <Button type="button" variant="outline" className="h-8 text-xs" onClick={handleSelectAll}>
                                        {locale === "zh" ? "全选" : "Select all"}
                                    </Button>
                                    <Button type="button" variant="outline" className="h-8 text-xs" onClick={handleClearSelected}>
                                        {locale === "zh" ? "清空选择" : "Clear selected"}
                                    </Button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button type="button" variant="outline" className="h-8 text-xs" onClick={handleCopySelectedAreas}>
                                        <Copy className="h-3.5 w-3.5 mr-1" />
                                        {locale === "zh" ? "复制" : "Copy"}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="h-8 text-xs"
                                        onClick={handlePasteSideBySide}
                                        disabled={copiedSelections.length === 0}
                                    >
                                        <ClipboardPaste className="h-3.5 w-3.5 mr-1" />
                                        {locale === "zh" ? "并排粘贴" : "Paste side-by-side"}
                                    </Button>
                                </div>
                            </div>

                            <div className="rounded-md border border-border/60 bg-muted/30 p-2 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium">
                                        {locale === "zh" ? "参考线（对齐吸附）" : "Guides (snap alignment)"}
                                    </span>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-xs"
                                        onClick={() => clearGuides(currentImage.id)}
                                        disabled={guides.length === 0}
                                    >
                                        {locale === "zh" ? "清空" : "Clear"}
                                    </Button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button
                                        type="button"
                                        variant={guideOrientation === "vertical" ? "secondary" : "outline"}
                                        className="h-8 text-xs"
                                        onClick={() => setGuideOrientation("vertical")}
                                    >
                                        {locale === "zh" ? "竖线" : "Vertical"}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={guideOrientation === "horizontal" ? "secondary" : "outline"}
                                        className="h-8 text-xs"
                                        onClick={() => setGuideOrientation("horizontal")}
                                    >
                                        {locale === "zh" ? "横线" : "Horizontal"}
                                    </Button>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="number"
                                        min={0}
                                        value={guidePosition}
                                        onChange={(e) => setGuidePosition(e.target.value)}
                                        placeholder={locale === "zh" ? "像素位置" : "Pixel position"}
                                        className="h-8 text-xs"
                                    />
                                    <Button type="button" size="sm" className="h-8 px-2" onClick={handleAddGuide}>
                                        <Plus className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                                {guides.length > 0 && (
                                    <div className="space-y-1">
                                        {guides.slice(-6).map((guide) => (
                                            <div key={guide.id} className="flex items-center justify-between rounded border border-border/50 bg-background/70 px-2 py-1">
                                                <span className="text-[11px] text-muted-foreground">
                                                    {guide.orientation === "vertical"
                                                        ? (locale === "zh" ? "竖线" : "V")
                                                        : (locale === "zh" ? "横线" : "H")}
                                                    : {Math.round(guide.position)}px
                                                </span>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7"
                                                    onClick={() => handleRemoveGuide(guide.id)}
                                                >
                                                    <Minus className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="rounded-md border border-border/60 bg-muted/30 p-2 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium">
                                        {locale === "zh" ? "形状图层" : "Shape layers"}
                                    </span>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-xs"
                                        onClick={() => clearAnnotationShapes(currentImage.id)}
                                        disabled={shapes.length === 0}
                                    >
                                        {locale === "zh" ? "清空" : "Clear"}
                                    </Button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button
                                        type="button"
                                        variant={shapeType === "rect" ? "secondary" : "outline"}
                                        className="h-8 text-xs"
                                        onClick={() => setShapeType("rect")}
                                    >
                                        <Square className="h-3.5 w-3.5 mr-1" />
                                        {locale === "zh" ? "矩形" : "Rect"}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={shapeType === "ellipse" ? "secondary" : "outline"}
                                        className="h-8 text-xs"
                                        onClick={() => setShapeType("ellipse")}
                                    >
                                        <Circle className="h-3.5 w-3.5 mr-1" />
                                        {locale === "zh" ? "椭圆" : "Ellipse"}
                                    </Button>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                        <span>{locale === "zh" ? "描边" : "Stroke"}</span>
                                        <input
                                            type="color"
                                            value={shapeStrokeColor}
                                            className="h-7 w-7 rounded border border-border bg-background p-0"
                                            aria-label={locale === "zh" ? "形状描边颜色" : "Shape stroke color"}
                                            onChange={(e) => setShapeStrokeColor(e.target.value)}
                                        />
                                    </label>
                                    <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                        <span>{locale === "zh" ? "填充" : "Fill"}</span>
                                        <input
                                            type="color"
                                            value={shapeFillColor}
                                            className="h-7 w-7 rounded border border-border bg-background p-0"
                                            aria-label={locale === "zh" ? "形状填充颜色" : "Shape fill color"}
                                            onChange={(e) => setShapeFillColor(e.target.value)}
                                        />
                                    </label>
                                    <Input
                                        type="number"
                                        min={5}
                                        max={100}
                                        value={shapeOpacity}
                                        onChange={(e) => setShapeOpacity(e.target.value)}
                                        placeholder={locale === "zh" ? "透明%" : "Opacity%"}
                                        aria-label={locale === "zh" ? "形状透明度百分比" : "Shape opacity percent"}
                                        className="h-8 text-xs"
                                    />
                                </div>
                                <Button
                                    type="button"
                                    className="h-8 w-full text-xs"
                                    onClick={handleAddShapesFromSelected}
                                    disabled={!selectedIds.length}
                                >
                                    {locale === "zh" ? "按选区创建形状" : "Create from selections"}
                                </Button>
                                {shapes.length > 0 && (
                                    <div className="space-y-1.5">
                                        {shapes.slice(-8).map((shape, index) => (
                                            <div key={shape.id} className="rounded border border-border/50 bg-background/70 px-2 py-1.5">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[11px] text-muted-foreground">
                                                        #{index + 1} {shape.type === "rect" ? (locale === "zh" ? "矩形" : "Rect") : (locale === "zh" ? "椭圆" : "Ellipse")}
                                                    </span>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 text-destructive"
                                                        onClick={() => handleRemoveShape(shape.id)}
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                                <input
                                                    type="range"
                                                    min={5}
                                                    max={100}
                                                    value={Math.round(shape.opacity * 100)}
                                                    className="w-full accent-primary"
                                                    aria-label={locale === "zh" ? `形状 #${index + 1} 透明度` : `Shape #${index + 1} opacity`}
                                                    onChange={(e) => handleShapeOpacityChange(shape.id, Number(e.target.value) / 100)}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

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
                                                    <input
                                                        type="checkbox"
                                                        className="h-3.5 w-3.5"
                                                        checked={selectedSet.has(selection.id)}
                                                        onChange={(e) => toggleSelection(selection.id, e.target.checked)}
                                                        aria-label={locale === "zh" ? `选择选区 #${index + 1}` : `Select selection #${index + 1}`}
                                                    />
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
