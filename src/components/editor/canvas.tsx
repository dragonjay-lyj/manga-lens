"use client"

import { useRef, useState, useEffect, useCallback, MouseEvent, TouchEvent } from "react"
import { useEditorStore, useCurrentImage } from "@/lib/stores/editor-store"
import { Button } from "@/components/ui/button"
import {
    ZoomIn,
    ZoomOut,
    Maximize,
    RotateCcw,
    Trash2,
    ImageIcon
} from "lucide-react"
import { getMessages } from "@/lib/i18n"
import type { Selection } from "@/types/database"

interface Point {
    x: number
    y: number
}

// 选区调整手柄类型
type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | null

export function EditorCanvas() {
    const containerRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const imageRef = useRef<HTMLImageElement | null>(null)
    const panSessionRef = useRef<{
        mouseX: number
        mouseY: number
        originPanX: number
        originPanY: number
    } | null>(null)

    const currentImage = useCurrentImage()
    const {
        showResult,
        zoom,
        panX,
        panY,
        locale,
        setZoom,
        setPan,
        resetView,
        updateSelections,
        clearSelections,
    } = useEditorStore()

    const t = getMessages(locale)

    const [isDrawing, setIsDrawing] = useState(false)
    const [isPanning, setIsPanning] = useState(false)
    const [startPoint, setStartPoint] = useState<Point | null>(null)
    const [currentSelection, setCurrentSelection] = useState<Selection | null>(null)
    const [isSpacePressed, setIsSpacePressed] = useState(false)

    // 选区调整状态
    const [isResizing, setIsResizing] = useState(false)
    const [resizingSelectionId, setResizingSelectionId] = useState<string | null>(null)
    const [resizeHandle, setResizeHandle] = useState<ResizeHandle>(null)
    const [resizeStartPoint, setResizeStartPoint] = useState<Point | null>(null)
    const [originalSelection, setOriginalSelection] = useState<Selection | null>(null)

    // 获取显示的图片 URL
    const displayUrl = showResult && currentImage?.resultUrl
        ? currentImage.resultUrl
        : currentImage?.originalUrl

    // 绘制选区
    function drawSelection(
        ctx: CanvasRenderingContext2D,
        selection: Selection,
        offsetX: number,
        offsetY: number,
        scale: number,
        isActive: boolean = false,
        status: "pending" | "processing" | "completed" | "failed" = "pending"
    ) {
        const x = offsetX + selection.x * scale
        const y = offsetY + selection.y * scale
        const width = selection.width * scale
        const height = selection.height * scale

        const palette = {
            pending: {
                fill: "rgba(99, 102, 241, 0.15)",
                fillActive: "rgba(99, 102, 241, 0.2)",
                stroke: "#818cf8",
                strokeActive: "#6366f1",
            },
            processing: {
                fill: "rgba(59, 130, 246, 0.18)",
                fillActive: "rgba(59, 130, 246, 0.24)",
                stroke: "#3b82f6",
                strokeActive: "#2563eb",
            },
            completed: {
                fill: "rgba(34, 197, 94, 0.16)",
                fillActive: "rgba(34, 197, 94, 0.22)",
                stroke: "#22c55e",
                strokeActive: "#16a34a",
            },
            failed: {
                fill: "rgba(239, 68, 68, 0.16)",
                fillActive: "rgba(239, 68, 68, 0.22)",
                stroke: "#ef4444",
                strokeActive: "#dc2626",
            },
        }[status]

        // 填充
        ctx.fillStyle = isActive
            ? palette.fillActive
            : palette.fill
        ctx.fillRect(x, y, width, height)

        // 边框
        ctx.strokeStyle = isActive ? palette.strokeActive : palette.stroke
        ctx.lineWidth = 2
        ctx.setLineDash(isActive ? [] : [5, 5])
        ctx.strokeRect(x, y, width, height)
        ctx.setLineDash([])

        // 角标
        const handleSize = 8
        ctx.fillStyle = palette.strokeActive
        // 四个角
        ctx.fillRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize)
        ctx.fillRect(x + width - handleSize / 2, y - handleSize / 2, handleSize, handleSize)
        ctx.fillRect(x - handleSize / 2, y + height - handleSize / 2, handleSize, handleSize)
        ctx.fillRect(x + width - handleSize / 2, y + height - handleSize / 2, handleSize, handleSize)
    }

    // 绘制 Canvas
    const drawCanvas = useCallback(() => {
        const canvas = canvasRef.current
        const container = containerRef.current
        const image = imageRef.current

        if (!canvas || !container || !image) return

        const ctx = canvas.getContext("2d")
        if (!ctx) return

        // 设置 Canvas 尺寸
        const containerRect = container.getBoundingClientRect()
        canvas.width = containerRect.width
        canvas.height = containerRect.height

        // 清除画布
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        // 计算图片绘制位置
        const scaledWidth = image.width * zoom
        const scaledHeight = image.height * zoom
        const x = (canvas.width - scaledWidth) / 2 + panX
        const y = (canvas.height - scaledHeight) / 2 + panY

        // 绘制图片
        ctx.drawImage(image, x, y, scaledWidth, scaledHeight)

        // 绘制已有选区
        if (currentImage && !showResult) {
            const selections = currentImage.selections || []
            for (const sel of selections) {
                const status = currentImage.selectionProgress?.[sel.id]?.status ?? "pending"
                drawSelection(ctx, sel, x, y, zoom, false, status)
            }
        }

        // 绘制当前正在创建的选区
        if (currentSelection && !showResult) {
            drawSelection(ctx, currentSelection, x, y, zoom, true)
        }
    }, [zoom, panX, panY, currentImage, showResult, currentSelection])

    // 加载图片
    useEffect(() => {
        if (!displayUrl) {
            imageRef.current = null
            drawCanvas()
            return
        }

        const img = new Image()
        img.onload = () => {
            imageRef.current = img
            drawCanvas()
        }
        img.onerror = () => {
            imageRef.current = null
            drawCanvas()
        }
        img.src = displayUrl
    }, [displayUrl, drawCanvas])

    // 监听重绘
    useEffect(() => {
        drawCanvas()
    }, [drawCanvas])

    // 窗口大小变化时重绘
    useEffect(() => {
        const handleResize = () => drawCanvas()
        window.addEventListener("resize", handleResize)
        return () => window.removeEventListener("resize", handleResize)
    }, [drawCanvas])

    // 支持空格 + 左键拖拽平移
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null
            const isEditable =
                target?.tagName === "INPUT" ||
                target?.tagName === "TEXTAREA" ||
                target?.tagName === "SELECT" ||
                Boolean(target?.isContentEditable)
            if (isEditable) return
            if (e.code === "Space") {
                setIsSpacePressed(true)
            }
        }
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.code === "Space") {
                setIsSpacePressed(false)
            }
        }
        const onBlur = () => setIsSpacePressed(false)

        window.addEventListener("keydown", onKeyDown)
        window.addEventListener("keyup", onKeyUp)
        window.addEventListener("blur", onBlur)
        return () => {
            window.removeEventListener("keydown", onKeyDown)
            window.removeEventListener("keyup", onKeyUp)
            window.removeEventListener("blur", onBlur)
        }
    }, [])

    // 获取鼠标在图片上的坐标
    const getImageCoordinates = (clientX: number, clientY: number): Point | null => {
        const canvas = canvasRef.current
        const image = imageRef.current
        if (!canvas || !image) return null

        const rect = canvas.getBoundingClientRect()
        const canvasX = clientX - rect.left
        const canvasY = clientY - rect.top

        const scaledWidth = image.width * zoom
        const scaledHeight = image.height * zoom
        const imageX = (canvas.width - scaledWidth) / 2 + panX
        const imageY = (canvas.height - scaledHeight) / 2 + panY

        const x = (canvasX - imageX) / zoom
        const y = (canvasY - imageY) / zoom

        // 检查是否在图片范围内
        if (x < 0 || x > image.width || y < 0 || y > image.height) {
            return null
        }

        return { x, y }
    }

    // 检测鼠标是否在选区调整手柄上
    const getHitHandle = useCallback((clientX: number, clientY: number): { selectionId: string, handle: ResizeHandle } | null => {
        const canvas = canvasRef.current
        const image = imageRef.current
        if (!canvas || !image || !currentImage || showResult) return null

        const rect = canvas.getBoundingClientRect()
        const canvasX = clientX - rect.left
        const canvasY = clientY - rect.top

        const scaledWidth = image.width * zoom
        const scaledHeight = image.height * zoom
        const offsetX = (canvas.width - scaledWidth) / 2 + panX
        const offsetY = (canvas.height - scaledHeight) / 2 + panY

        const handleSize = 12 // 检测范围略大于绘制的 8px

        for (const sel of currentImage.selections || []) {
            const selX = offsetX + sel.x * zoom
            const selY = offsetY + sel.y * zoom
            const selW = sel.width * zoom
            const selH = sel.height * zoom

            const hitTest = (hx: number, hy: number) =>
                Math.abs(canvasX - hx) < handleSize && Math.abs(canvasY - hy) < handleSize

            // 四个角
            if (hitTest(selX, selY)) return { selectionId: sel.id, handle: "nw" }
            if (hitTest(selX + selW, selY)) return { selectionId: sel.id, handle: "ne" }
            if (hitTest(selX, selY + selH)) return { selectionId: sel.id, handle: "sw" }
            if (hitTest(selX + selW, selY + selH)) return { selectionId: sel.id, handle: "se" }

            // 四条边中点
            if (hitTest(selX + selW / 2, selY)) return { selectionId: sel.id, handle: "n" }
            if (hitTest(selX + selW, selY + selH / 2)) return { selectionId: sel.id, handle: "e" }
            if (hitTest(selX + selW / 2, selY + selH)) return { selectionId: sel.id, handle: "s" }
            if (hitTest(selX, selY + selH / 2)) return { selectionId: sel.id, handle: "w" }
        }
        return null
    }, [currentImage, showResult, zoom, panX, panY])

    // 获取调整手柄对应的光标样式
    const getResizeCursor = (handle: ResizeHandle): string => {
        switch (handle) {
            case "nw": case "se": return "nwse-resize"
            case "ne": case "sw": return "nesw-resize"
            case "n": case "s": return "ns-resize"
            case "e": case "w": return "ew-resize"
            default: return "crosshair"
        }
    }

    // 鼠标按下
    const handleMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
        if (!currentImage) return

        // 中键/右键，或空格+左键，或结果模式左键拖拽平移
        const shouldPan =
            e.button === 1 ||
            e.button === 2 ||
            (e.button === 0 && (isSpacePressed || showResult))

        if (shouldPan) {
            setIsPanning(true)
            panSessionRef.current = {
                mouseX: e.clientX,
                mouseY: e.clientY,
                originPanX: panX,
                originPanY: panY,
            }
            if (canvasRef.current) {
                canvasRef.current.style.cursor = "grabbing"
            }
            return
        }

        if (showResult) return

        // 检测是否点击在调整手柄上
        const hitResult = getHitHandle(e.clientX, e.clientY)
        if (hitResult) {
            const selection = currentImage.selections?.find(s => s.id === hitResult.selectionId)
            if (selection) {
                setIsResizing(true)
                setResizingSelectionId(hitResult.selectionId)
                setResizeHandle(hitResult.handle)
                setResizeStartPoint({ x: e.clientX, y: e.clientY })
                setOriginalSelection({ ...selection })
                return
            }
        }

        // 左键绘制新选区
        const coords = getImageCoordinates(e.clientX, e.clientY)
        if (coords) {
            setIsDrawing(true)
            setStartPoint(coords)
            setCurrentSelection({
                id: `sel-${Date.now()}`,
                x: coords.x,
                y: coords.y,
                width: 0,
                height: 0,
            })
        }
    }

    // 鼠标移动
    const handleMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
        // 更新光标样式
        if (!isDrawing && !isPanning && !isResizing) {
            const canvas = canvasRef.current
            if (canvas) {
                if (showResult || isSpacePressed) {
                    canvas.style.cursor = "grab"
                } else {
                    const hitResult = getHitHandle(e.clientX, e.clientY)
                    canvas.style.cursor = hitResult ? getResizeCursor(hitResult.handle) : "crosshair"
                }
            }
        }

        // 拖拽平移
        if (isPanning && panSessionRef.current) {
            const dx = e.clientX - panSessionRef.current.mouseX
            const dy = e.clientY - panSessionRef.current.mouseY
            setPan(
                panSessionRef.current.originPanX + dx,
                panSessionRef.current.originPanY + dy
            )
            return
        }

        // 选区调整
        if (isResizing && resizeStartPoint && originalSelection && resizingSelectionId && resizeHandle) {
            const dx = (e.clientX - resizeStartPoint.x) / zoom
            const dy = (e.clientY - resizeStartPoint.y) / zoom
            const orig = originalSelection

            let newX = orig.x
            let newY = orig.y
            let newW = orig.width
            let newH = orig.height

            switch (resizeHandle) {
                case "nw":
                    newX = orig.x + dx
                    newY = orig.y + dy
                    newW = orig.width - dx
                    newH = orig.height - dy
                    break
                case "ne":
                    newY = orig.y + dy
                    newW = orig.width + dx
                    newH = orig.height - dy
                    break
                case "sw":
                    newX = orig.x + dx
                    newW = orig.width - dx
                    newH = orig.height + dy
                    break
                case "se":
                    newW = orig.width + dx
                    newH = orig.height + dy
                    break
                case "n":
                    newY = orig.y + dy
                    newH = orig.height - dy
                    break
                case "e":
                    newW = orig.width + dx
                    break
                case "s":
                    newH = orig.height + dy
                    break
                case "w":
                    newX = orig.x + dx
                    newW = orig.width - dx
                    break
            }

            // 确保最小尺寸
            const minSize = 10
            if (newW < minSize) {
                if (resizeHandle.includes("w")) newX = orig.x + orig.width - minSize
                newW = minSize
            }
            if (newH < minSize) {
                if (resizeHandle.includes("n")) newY = orig.y + orig.height - minSize
                newH = minSize
            }

            // 更新选区
            if (currentImage) {
                const newSelections = (currentImage.selections || []).map(s =>
                    s.id === resizingSelectionId
                        ? { ...s, x: Math.round(newX), y: Math.round(newY), width: Math.round(newW), height: Math.round(newH) }
                        : s
                )
                updateSelections(currentImage.id, newSelections)
            }
            return
        }

        // 绘制新选区
        if (isDrawing && startPoint) {
            const coords = getImageCoordinates(e.clientX, e.clientY)
            if (coords) {
                const x = Math.min(startPoint.x, coords.x)
                const y = Math.min(startPoint.y, coords.y)
                const width = Math.abs(coords.x - startPoint.x)
                const height = Math.abs(coords.y - startPoint.y)

                setCurrentSelection((prev) =>
                    prev ? { ...prev, x, y, width, height } : null
                )
                drawCanvas()
            }
        }
    }

    // 鼠标松开
    const handleMouseUp = () => {
        const canvas = canvasRef.current

        if (isPanning) {
            setIsPanning(false)
            panSessionRef.current = null
            if (canvas) {
                canvas.style.cursor = showResult || isSpacePressed ? "grab" : "crosshair"
            }
            return
        }

        // 结束选区调整
        if (isResizing) {
            setIsResizing(false)
            setResizingSelectionId(null)
            setResizeHandle(null)
            setResizeStartPoint(null)
            setOriginalSelection(null)
            if (canvas) {
                canvas.style.cursor = showResult || isSpacePressed ? "grab" : "crosshair"
            }
            return
        }

        if (isDrawing && currentSelection && currentImage) {
            // 只有当选区有一定大小时才添加
            if (currentSelection.width > 10 && currentSelection.height > 10) {
                const newSelections = [...(currentImage.selections || []), currentSelection]
                updateSelections(currentImage.id, newSelections)
            }
            setIsDrawing(false)
            setStartPoint(null)
            setCurrentSelection(null)
        }

        if (canvas) {
            canvas.style.cursor = showResult || isSpacePressed ? "grab" : "crosshair"
        }
    }

    // 滚轮缩放
    const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
        e.preventDefault()
        const delta = e.deltaY > 0 ? -0.1 : 0.1
        setZoom(zoom + delta)
    }

    // 阻止右键菜单
    const handleContextMenu = (e: MouseEvent<HTMLCanvasElement>) => {
        e.preventDefault()
    }

    // 清除所有选区
    const handleClearSelections = () => {
        if (currentImage) {
            clearSelections(currentImage.id)
        }
    }

    // 适应屏幕
    const handleFitToScreen = () => {
        const container = containerRef.current
        const image = imageRef.current
        if (!container || !image) return

        const containerRect = container.getBoundingClientRect()
        const scaleX = (containerRect.width - 40) / image.width
        const scaleY = (containerRect.height - 40) / image.height
        const newZoom = Math.min(scaleX, scaleY, 1)

        setZoom(newZoom)
        setPan(0, 0)
    }

    return (
        <div className="flex flex-col h-full">
            {/* 工具栏 */}
            <div className="flex items-center gap-2 p-2 border-b border-border glass">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11"
                    onClick={() => setZoom(zoom + 0.1)}
                    title={t.editor.canvas.zoomIn}
                    aria-label={t.editor.canvas.zoomIn}
                >
                    <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11"
                    onClick={() => setZoom(zoom - 0.1)}
                    title={t.editor.canvas.zoomOut}
                    aria-label={t.editor.canvas.zoomOut}
                >
                    <ZoomOut className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11"
                    onClick={handleFitToScreen}
                    title={t.editor.canvas.fitToScreen}
                    aria-label={t.editor.canvas.fitToScreen}
                >
                    <Maximize className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11"
                    onClick={resetView}
                    title={t.editor.canvas.resetZoom}
                    aria-label={t.editor.canvas.resetZoom}
                >
                    <RotateCcw className="h-4 w-4" />
                </Button>
                <div className="flex-1" />
                <span className="hidden lg:inline text-xs text-muted-foreground">
                    {locale === "zh" ? "拖拽: 中键/右键，或空格+左键" : "Pan: middle/right click, or Space + left click"}
                </span>
                <span className="text-sm text-muted-foreground">
                    {Math.round(zoom * 100)}%
                </span>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11"
                    onClick={handleClearSelections}
                    title={t.editor.canvas.clearSelections}
                    aria-label={t.editor.canvas.clearSelections}
                    disabled={!currentImage?.selections?.length}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>

            {/* Canvas 区域 */}
            <div
                ref={containerRef}
                className="flex-1 relative overflow-hidden bg-black/5 dark:bg-white/5 touch-none"
            >
                {currentImage ? (
                    <canvas
                        ref={canvasRef}
                        aria-label={locale === "zh" ? "图片编辑画布" : "Image editing canvas"}
                        className={`absolute inset-0 touch-none ${showResult || isSpacePressed ? "cursor-grab" : "cursor-crosshair"}`}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                        onWheel={handleWheel}
                        onContextMenu={handleContextMenu}
                        onTouchStart={(e: TouchEvent<HTMLCanvasElement>) => {
                            e.preventDefault()
                            const touch = e.touches[0]
                            if (touch) {
                                if (showResult) {
                                    setIsPanning(true)
                                    panSessionRef.current = {
                                        mouseX: touch.clientX,
                                        mouseY: touch.clientY,
                                        originPanX: panX,
                                        originPanY: panY,
                                    }
                                    return
                                }
                                const coords = getImageCoordinates(touch.clientX, touch.clientY)
                                if (coords) {
                                    setIsDrawing(true)
                                    setStartPoint(coords)
                                    setCurrentSelection({
                                        id: `sel-${Date.now()}`,
                                        x: coords.x,
                                        y: coords.y,
                                        width: 0,
                                        height: 0,
                                    })
                                }
                            }
                        }}
                        onTouchMove={(e: TouchEvent<HTMLCanvasElement>) => {
                            e.preventDefault()
                            if (isPanning && panSessionRef.current && e.touches[0]) {
                                const touch = e.touches[0]
                                const dx = touch.clientX - panSessionRef.current.mouseX
                                const dy = touch.clientY - panSessionRef.current.mouseY
                                setPan(
                                    panSessionRef.current.originPanX + dx,
                                    panSessionRef.current.originPanY + dy
                                )
                                return
                            }
                            if (isDrawing && startPoint && e.touches[0]) {
                                const touch = e.touches[0]
                                const coords = getImageCoordinates(touch.clientX, touch.clientY)
                                if (coords) {
                                    const x = Math.min(startPoint.x, coords.x)
                                    const y = Math.min(startPoint.y, coords.y)
                                    const width = Math.abs(coords.x - startPoint.x)
                                    const height = Math.abs(coords.y - startPoint.y)
                                    setCurrentSelection((prev) =>
                                        prev ? { ...prev, x, y, width, height } : null
                                    )
                                    drawCanvas()
                                }
                            }
                        }}
                        onTouchEnd={(e: TouchEvent<HTMLCanvasElement>) => {
                            e.preventDefault()
                            if (isPanning) {
                                setIsPanning(false)
                                panSessionRef.current = null
                                return
                            }
                            if (isDrawing && currentSelection && currentImage) {
                                if (currentSelection.width > 10 && currentSelection.height > 10) {
                                    const newSelections = [...(currentImage.selections || []), currentSelection]
                                    updateSelections(currentImage.id, newSelections)
                                }
                                setIsDrawing(false)
                                setStartPoint(null)
                                setCurrentSelection(null)
                            }
                        }}
                    />
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                        <ImageIcon className="h-12 w-12 mb-4 opacity-50" />
                        <p>{t.editor.canvas.noImage}</p>
                    </div>
                )}
            </div>
        </div>
    )
}
