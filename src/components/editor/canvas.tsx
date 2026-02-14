"use client"

import { useRef, useState, useEffect, useCallback, useMemo, MouseEvent, TouchEvent } from "react"
import { useEditorStore, useCurrentImage } from "@/lib/stores/editor-store"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    ZoomIn,
    ZoomOut,
    Maximize,
    RotateCcw,
    Trash2,
    Eraser,
    ImageIcon,
    Brush,
    Square,
    HelpCircle,
    Upload,
    Eye,
    EyeOff,
    Wand2,
} from "lucide-react"
import { getMessages } from "@/lib/i18n"
import type { Selection } from "@/types/database"
import type { AnnotationShape } from "@/lib/stores/editor-store"
import { loadImage } from "@/lib/utils/image-utils"
import { toast } from "sonner"

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
    const resultImageRef = useRef<HTMLImageElement | null>(null)
    const sourceDataCanvasRef = useRef<HTMLCanvasElement | null>(null)
    const sourceImageDataRef = useRef<{
        width: number
        height: number
        pixels: Uint8ClampedArray
    } | null>(null)
    const maskCanvasRef = useRef<HTMLCanvasElement | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const maskInputRef = useRef<HTMLInputElement>(null)
    const lastBrushPointRef = useRef<Point | null>(null)
    const brushEraseModeRef = useRef(false)
    const panSessionRef = useRef<{
        mouseX: number
        mouseY: number
        originPanX: number
        originPanY: number
    } | null>(null)
    const wandAreaWarningTsRef = useRef(0)

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
        addImages,
        updateSelections,
        clearSelections,
        setRepairMask,
        clearRepairMask,
        setGuides,
        setAnnotationShapes,
    } = useEditorStore()

    const t = getMessages(locale)
    const guides = useMemo(() => currentImage?.guides || [], [currentImage?.guides])
    const annotationShapes = useMemo(() => currentImage?.annotationShapes || [], [currentImage?.annotationShapes])

    const [isDrawing, setIsDrawing] = useState(false)
    const [isPanning, setIsPanning] = useState(false)
    const [startPoint, setStartPoint] = useState<Point | null>(null)
    const [currentSelection, setCurrentSelection] = useState<Selection | null>(null)
    const [isSpacePressed, setIsSpacePressed] = useState(false)
    const [toolMode, setToolMode] = useState<"selection" | "brush" | "wand">("selection")
    const [brushSize, setBrushSize] = useState(32)
    const [wandTolerance, setWandTolerance] = useState(22)
    const [wandToneMode, setWandToneMode] = useState<"auto" | "dark" | "light">("auto")
    const [wandMaxAreaPercent, setWandMaxAreaPercent] = useState(18)
    const [isBrushErasePinned, setIsBrushErasePinned] = useState(false)
    const [maskOverlayOpacity, setMaskOverlayOpacity] = useState(46)
    const [originalOpacity, setOriginalOpacity] = useState(100)
    const [inpaintOpacity, setInpaintOpacity] = useState(100)
    const [showInpaintOverlay, setShowInpaintOverlay] = useState(false)

    // 选区调整状态
    const [isResizing, setIsResizing] = useState(false)
    const [resizingSelectionId, setResizingSelectionId] = useState<string | null>(null)
    const [resizeHandle, setResizeHandle] = useState<ResizeHandle>(null)
    const [resizeStartPoint, setResizeStartPoint] = useState<Point | null>(null)
    const [originalSelection, setOriginalSelection] = useState<Selection | null>(null)
    const [activeShapeId, setActiveShapeId] = useState<string | null>(null)
    const [isDraggingShape, setIsDraggingShape] = useState(false)
    const [draggingShapeId, setDraggingShapeId] = useState<string | null>(null)
    const [shapeDragStartPoint, setShapeDragStartPoint] = useState<Point | null>(null)
    const [originalShapeForDrag, setOriginalShapeForDrag] = useState<AnnotationShape | null>(null)
    const [isResizingShape, setIsResizingShape] = useState(false)
    const [resizingShapeId, setResizingShapeId] = useState<string | null>(null)
    const [shapeResizeHandle, setShapeResizeHandle] = useState<ResizeHandle>(null)
    const [shapeResizeStartPoint, setShapeResizeStartPoint] = useState<Point | null>(null)
    const [originalShapeForResize, setOriginalShapeForResize] = useState<AnnotationShape | null>(null)
    const [draggingGuideId, setDraggingGuideId] = useState<string | null>(null)
    const [draggingGuideOrientation, setDraggingGuideOrientation] = useState<"horizontal" | "vertical" | null>(null)

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

    const drawGuideLine = useCallback((
        ctx: CanvasRenderingContext2D,
        orientation: "horizontal" | "vertical",
        position: number,
        offsetX: number,
        offsetY: number,
        scale: number,
        imageWidth: number,
        imageHeight: number
    ) => {
        ctx.save()
        ctx.strokeStyle = "rgba(14, 165, 233, 0.85)"
        ctx.lineWidth = 1
        ctx.setLineDash([6, 4])
        ctx.beginPath()
        if (orientation === "vertical") {
            const x = offsetX + position * scale
            ctx.moveTo(x, offsetY)
            ctx.lineTo(x, offsetY + imageHeight * scale)
        } else {
            const y = offsetY + position * scale
            ctx.moveTo(offsetX, y)
            ctx.lineTo(offsetX + imageWidth * scale, y)
        }
        ctx.stroke()
        ctx.restore()
    }, [])

    const drawAnnotationShape = useCallback((
        ctx: CanvasRenderingContext2D,
        shape: {
            type: "rect" | "ellipse"
            x: number
            y: number
            width: number
            height: number
            strokeColor: string
            fillColor: string
            opacity: number
        },
        offsetX: number,
        offsetY: number,
        scale: number
    ) => {
        const x = offsetX + shape.x * scale
        const y = offsetY + shape.y * scale
        const width = Math.max(1, shape.width * scale)
        const height = Math.max(1, shape.height * scale)
        const opacity = Math.max(0.05, Math.min(1, shape.opacity || 0.3))

        ctx.save()
        ctx.globalAlpha = opacity
        ctx.fillStyle = shape.fillColor || "#ef4444"
        if (shape.type === "ellipse") {
            ctx.beginPath()
            ctx.ellipse(
                x + width / 2,
                y + height / 2,
                width / 2,
                height / 2,
                0,
                0,
                Math.PI * 2
            )
            ctx.fill()
        } else {
            ctx.fillRect(x, y, width, height)
        }
        ctx.restore()

        ctx.save()
        ctx.strokeStyle = shape.strokeColor || "#ef4444"
        ctx.lineWidth = 2
        if (shape.type === "ellipse") {
            ctx.beginPath()
            ctx.ellipse(
                x + width / 2,
                y + height / 2,
                width / 2,
                height / 2,
                0,
                0,
                Math.PI * 2
            )
            ctx.stroke()
        } else {
            ctx.strokeRect(x, y, width, height)
        }
        ctx.restore()
    }, [])

    const drawShapeHandles = useCallback((
        ctx: CanvasRenderingContext2D,
        shape: AnnotationShape,
        offsetX: number,
        offsetY: number,
        scale: number
    ) => {
        const x = offsetX + shape.x * scale
        const y = offsetY + shape.y * scale
        const width = Math.max(1, shape.width * scale)
        const height = Math.max(1, shape.height * scale)
        const handleSize = 8

        ctx.save()
        ctx.strokeStyle = "#0ea5e9"
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 3])
        ctx.strokeRect(x, y, width, height)
        ctx.setLineDash([])

        const points: Point[] = [
            { x, y },
            { x: x + width / 2, y },
            { x: x + width, y },
            { x: x + width, y: y + height / 2 },
            { x: x + width, y: y + height },
            { x: x + width / 2, y: y + height },
            { x, y: y + height },
            { x, y: y + height / 2 },
        ]

        ctx.fillStyle = "#0ea5e9"
        for (const point of points) {
            ctx.fillRect(
                point.x - handleSize / 2,
                point.y - handleSize / 2,
                handleSize,
                handleSize
            )
        }
        ctx.restore()
    }, [])

    const ensureMaskCanvas = useCallback((width: number, height: number) => {
        if (!maskCanvasRef.current) {
            maskCanvasRef.current = document.createElement("canvas")
        }
        const canvas = maskCanvasRef.current
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width
            canvas.height = height
        }
        return canvas
    }, [])

    const isMaskCanvasEmpty = useCallback(() => {
        const maskCanvas = maskCanvasRef.current
        if (!maskCanvas) return true
        const ctx = maskCanvas.getContext("2d")
        if (!ctx) return true
        const { data } = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height)
        for (let i = 3; i < data.length; i += 4) {
            if (data[i] > 0) return false
        }
        return true
    }, [])

    const persistMaskToStore = useCallback(() => {
        if (!currentImage) return
        const maskCanvas = maskCanvasRef.current
        if (!maskCanvas || isMaskCanvasEmpty()) {
            clearRepairMask(currentImage.id)
            return
        }
        setRepairMask(currentImage.id, maskCanvas.toDataURL("image/png"))
    }, [clearRepairMask, currentImage, isMaskCanvasEmpty, setRepairMask])

    const paintBrushStroke = useCallback((from: Point, to: Point, erase: boolean) => {
        const image = imageRef.current
        if (!image) return
        const maskCanvas = ensureMaskCanvas(image.width, image.height)
        const ctx = maskCanvas.getContext("2d")
        if (!ctx) return

        ctx.save()
        ctx.globalCompositeOperation = erase ? "destination-out" : "source-over"
        ctx.strokeStyle = "rgba(255,255,255,1)"
        ctx.fillStyle = "rgba(255,255,255,1)"
        ctx.lineWidth = brushSize
        ctx.lineCap = "round"
        ctx.lineJoin = "round"
        ctx.beginPath()
        ctx.moveTo(from.x, from.y)
        ctx.lineTo(to.x, to.y)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(to.x, to.y, brushSize / 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
    }, [brushSize, ensureMaskCanvas])

    const clearLocalMaskCanvas = useCallback(() => {
        const maskCanvas = maskCanvasRef.current
        if (!maskCanvas) return
        const ctx = maskCanvas.getContext("2d")
        if (!ctx) return
        ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height)
    }, [])

    const updateSourceImageData = useCallback((image: HTMLImageElement) => {
        if (!sourceDataCanvasRef.current) {
            sourceDataCanvasRef.current = document.createElement("canvas")
        }
        const sourceCanvas = sourceDataCanvasRef.current
        sourceCanvas.width = image.width
        sourceCanvas.height = image.height
        const sourceCtx = sourceCanvas.getContext("2d")
        if (!sourceCtx) {
            sourceImageDataRef.current = null
            return
        }
        sourceCtx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height)
        sourceCtx.drawImage(image, 0, 0)
        const imageData = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height)
        sourceImageDataRef.current = {
            width: sourceCanvas.width,
            height: sourceCanvas.height,
            pixels: imageData.data,
        }
    }, [])

    const applyMagicWandAt = useCallback((point: Point, erase: boolean) => {
        const image = imageRef.current
        if (!image) return

        if (
            !sourceImageDataRef.current ||
            sourceImageDataRef.current.width !== image.width ||
            sourceImageDataRef.current.height !== image.height
        ) {
            updateSourceImageData(image)
        }

        const source = sourceImageDataRef.current
        if (!source) return

        const width = source.width
        const height = source.height
        const startX = Math.max(0, Math.min(width - 1, Math.floor(point.x)))
        const startY = Math.max(0, Math.min(height - 1, Math.floor(point.y)))
        const startPos = startY * width + startX
        const startIdx = startPos * 4
        const src = source.pixels

        const seedA = src[startIdx + 3]
        if (seedA === 0) return
        const seedLum = 0.299 * src[startIdx] + 0.587 * src[startIdx + 1] + 0.114 * src[startIdx + 2]
        const threshold = Math.max(0, Math.min(100, wandTolerance)) * 2.55
        const cappedAreaRatio = Math.max(1, Math.min(100, wandMaxAreaPercent)) / 100
        const maxAffectedPixels = Math.max(1, Math.floor(width * height * cappedAreaRatio))
        const darkToneMaxLum = 140
        const lightToneMinLum = 170

        const toneAccepted = (lum: number) => {
            if (wandToneMode === "dark") {
                return lum <= darkToneMaxLum
            }
            if (wandToneMode === "light") {
                return lum >= lightToneMinLum
            }
            return true
        }

        if (!toneAccepted(seedLum)) {
            return
        }

        const maskCanvas = ensureMaskCanvas(width, height)
        const maskCtx = maskCanvas.getContext("2d")
        if (!maskCtx) return
        const maskImageData = maskCtx.getImageData(0, 0, width, height)
        const maskPixels = maskImageData.data

        const total = width * height
        const visited = new Uint8Array(total)
        const queue = new Int32Array(total)
        let head = 0
        let tail = 0
        let affected = 0
        let hitAreaLimit = false

        visited[startPos] = 1
        queue[tail++] = startPos

        while (head < tail) {
            const pos = queue[head++]
            const idx = pos * 4
            const alpha = src[idx + 3]
            if (alpha === 0) continue

            const lum = 0.299 * src[idx] + 0.587 * src[idx + 1] + 0.114 * src[idx + 2]
            if (Math.abs(lum - seedLum) > threshold) continue
            if (!toneAccepted(lum)) continue

            if (erase) {
                maskPixels[idx + 3] = 0
            } else {
                maskPixels[idx] = 255
                maskPixels[idx + 1] = 255
                maskPixels[idx + 2] = 255
                maskPixels[idx + 3] = 255
            }
            affected += 1
            if (affected >= maxAffectedPixels) {
                hitAreaLimit = true
                break
            }

            const px = pos % width
            const py = (pos - px) / width

            const enqueue = (nextPos: number) => {
                if (visited[nextPos]) return
                visited[nextPos] = 1
                queue[tail++] = nextPos
            }

            if (px > 0) enqueue(pos - 1)
            if (px < width - 1) enqueue(pos + 1)
            if (py > 0) enqueue(pos - width)
            if (py < height - 1) enqueue(pos + width)
        }

        if (affected === 0) return

        maskCtx.putImageData(maskImageData, 0, 0)
        persistMaskToStore()
        if (hitAreaLimit) {
            const now = Date.now()
            if (now - wandAreaWarningTsRef.current > 1200) {
                toast.info(
                    locale === "zh"
                        ? `魔棒已触发面积上限（${wandMaxAreaPercent}%），可提高上限继续扩展。`
                        : `Magic wand hit area cap (${wandMaxAreaPercent}%). Increase cap to expand more.`
                )
                wandAreaWarningTsRef.current = now
            }
        }
    }, [ensureMaskCanvas, locale, persistMaskToStore, updateSourceImageData, wandMaxAreaPercent, wandTolerance, wandToneMode])

    // 绘制 Canvas
    const drawCanvas = useCallback(() => {
        const canvas = canvasRef.current
        const container = containerRef.current
        const baseImage = imageRef.current || resultImageRef.current
        const originalImage = imageRef.current
        const resultImage = resultImageRef.current

        if (!canvas || !container || !baseImage) return

        const ctx = canvas.getContext("2d")
        if (!ctx) return

        // 设置 Canvas 尺寸
        const containerRect = container.getBoundingClientRect()
        canvas.width = containerRect.width
        canvas.height = containerRect.height

        // 清除画布
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        // 计算图片绘制位置
        const scaledWidth = baseImage.width * zoom
        const scaledHeight = baseImage.height * zoom
        const x = (canvas.width - scaledWidth) / 2 + panX
        const y = (canvas.height - scaledHeight) / 2 + panY

        const drawLayer = (img: HTMLImageElement, opacityPercent: number) => {
            const alpha = Math.max(0, Math.min(1, opacityPercent / 100))
            if (alpha <= 0) return
            ctx.save()
            ctx.globalAlpha = alpha
            ctx.drawImage(img, x, y, scaledWidth, scaledHeight)
            ctx.restore()
        }

        if (showResult) {
            if (originalImage) {
                drawLayer(originalImage, originalOpacity)
            }
            if (resultImage) {
                drawLayer(resultImage, inpaintOpacity)
            } else if (!originalImage) {
                drawLayer(baseImage, 100)
            }
        } else {
            if (originalImage) {
                drawLayer(originalImage, originalOpacity)
            } else {
                drawLayer(baseImage, 100)
            }
            if (showInpaintOverlay && resultImage) {
                drawLayer(resultImage, inpaintOpacity)
            }
        }

        // 绘制修复画笔遮罩预览（红色叠层）
        const maskCanvas = maskCanvasRef.current
        if (maskCanvas && !showResult && maskOverlayOpacity > 0) {
            const previewCanvas = document.createElement("canvas")
            const previewCtx = previewCanvas.getContext("2d")
            if (previewCtx) {
                previewCanvas.width = maskCanvas.width
                previewCanvas.height = maskCanvas.height
                previewCtx.fillStyle = `rgba(239, 68, 68, ${Math.max(0, Math.min(1, maskOverlayOpacity / 100))})`
                previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height)
                previewCtx.globalCompositeOperation = "destination-in"
                previewCtx.drawImage(maskCanvas, 0, 0)
                previewCtx.globalCompositeOperation = "source-over"
                ctx.drawImage(previewCanvas, x, y, scaledWidth, scaledHeight)
            }
        }

        if (!showResult) {
            for (const shape of annotationShapes) {
                drawAnnotationShape(ctx, shape, x, y, zoom)
            }
            if (activeShapeId) {
                const activeShape = annotationShapes.find((shape) => shape.id === activeShapeId)
                if (activeShape) {
                    drawShapeHandles(ctx, activeShape, x, y, zoom)
                }
            }
            for (const guide of guides) {
                drawGuideLine(
                    ctx,
                    guide.orientation,
                    guide.position,
                    x,
                    y,
                    zoom,
                    baseImage.width,
                    baseImage.height
                )
            }
        }

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
    }, [zoom, panX, panY, currentImage, showResult, currentSelection, annotationShapes, guides, activeShapeId, drawAnnotationShape, drawGuideLine, drawShapeHandles, showInpaintOverlay, maskOverlayOpacity, originalOpacity, inpaintOpacity])

    // 加载原图与修复遮罩
    useEffect(() => {
        const originalUrl = currentImage?.originalUrl
        if (!originalUrl) {
            imageRef.current = null
            resultImageRef.current = null
            maskCanvasRef.current = null
            sourceImageDataRef.current = null
            drawCanvas()
            return
        }

        let cancelled = false
        const img = new Image()
        img.onload = async () => {
            if (cancelled) return
            imageRef.current = img
            updateSourceImageData(img)
            const maskCanvas = ensureMaskCanvas(img.width, img.height)
            const maskCtx = maskCanvas.getContext("2d")
            if (maskCtx) {
                maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height)
                if (currentImage?.repairMaskUrl) {
                    const maskImage = new Image()
                    await new Promise<void>((resolve) => {
                        maskImage.onload = () => {
                            if (!cancelled) {
                                maskCtx.drawImage(maskImage, 0, 0, maskCanvas.width, maskCanvas.height)
                            }
                            resolve()
                        }
                        maskImage.onerror = () => resolve()
                        maskImage.src = currentImage.repairMaskUrl as string
                    })
                }
            }
            if (!cancelled) {
                drawCanvas()
            }
        }
        img.onerror = () => {
            if (cancelled) return
            imageRef.current = null
            maskCanvasRef.current = null
            sourceImageDataRef.current = null
            drawCanvas()
        }
        img.src = originalUrl

        return () => {
            cancelled = true
        }
    }, [currentImage?.id, currentImage?.originalUrl, currentImage?.repairMaskUrl, drawCanvas, ensureMaskCanvas, updateSourceImageData])

    // 加载生成结果图（用于对比叠加）
    useEffect(() => {
        const resultUrl = currentImage?.resultUrl
        if (!resultUrl) {
            resultImageRef.current = null
            drawCanvas()
            return
        }

        let cancelled = false
        const resultImg = new Image()
        resultImg.onload = () => {
            if (cancelled) return
            resultImageRef.current = resultImg
            drawCanvas()
        }
        resultImg.onerror = () => {
            if (cancelled) return
            resultImageRef.current = null
            drawCanvas()
        }
        resultImg.src = resultUrl

        return () => {
            cancelled = true
        }
    }, [currentImage?.id, currentImage?.resultUrl, drawCanvas])

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
                return
            }

            if (e.key === "Escape" && !showResult) {
                if (isDrawing && toolMode === "selection") {
                    e.preventDefault()
                    setIsDrawing(false)
                    setStartPoint(null)
                    setCurrentSelection(null)
                    lastBrushPointRef.current = null
                    brushEraseModeRef.current = false
                    drawCanvas()
                    toast.info(locale === "zh" ? "已取消当前选区" : "Current selection cancelled")
                    return
                }

                if (toolMode === "selection" && currentImage?.selections?.length) {
                    e.preventDefault()
                    const nextSelections = currentImage.selections.slice(0, -1)
                    updateSelections(currentImage.id, nextSelections)
                    toast.info(locale === "zh" ? "已删除最后一个选区" : "Deleted last selection")
                    return
                }
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
    }, [currentImage, drawCanvas, isDrawing, locale, showResult, toolMode, updateSelections])

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

    const getShapeById = useCallback((shapeId: string) => {
        return annotationShapes.find((shape) => shape.id === shapeId) ?? null
    }, [annotationShapes])

    const snapCoordinateToGuide = useCallback((
        value: number,
        orientation: "horizontal" | "vertical"
    ) => {
        if (!guides.length) return value
        const threshold = Math.max(3, 8 / Math.max(zoom, 0.1))
        let snapped = value
        let minDistance = Number.POSITIVE_INFINITY

        for (const guide of guides) {
            if (guide.orientation !== orientation) continue
            const distance = Math.abs(guide.position - value)
            if (distance <= threshold && distance < minDistance) {
                minDistance = distance
                snapped = guide.position
            }
        }

        return snapped
    }, [guides, zoom])

    const getHitGuide = useCallback((clientX: number, clientY: number): { id: string; orientation: "horizontal" | "vertical" } | null => {
        const canvas = canvasRef.current
        const image = imageRef.current
        if (!canvas || !image || showResult) return null
        if (!guides.length) return null

        const rect = canvas.getBoundingClientRect()
        const canvasX = clientX - rect.left
        const canvasY = clientY - rect.top

        const scaledWidth = image.width * zoom
        const scaledHeight = image.height * zoom
        const offsetX = (canvas.width - scaledWidth) / 2 + panX
        const offsetY = (canvas.height - scaledHeight) / 2 + panY
        const thresholdPx = 8

        for (const guide of guides) {
            if (guide.orientation === "vertical") {
                const x = offsetX + guide.position * zoom
                const inYRange = canvasY >= offsetY && canvasY <= offsetY + scaledHeight
                if (inYRange && Math.abs(canvasX - x) <= thresholdPx) {
                    return { id: guide.id, orientation: "vertical" }
                }
            } else {
                const y = offsetY + guide.position * zoom
                const inXRange = canvasX >= offsetX && canvasX <= offsetX + scaledWidth
                if (inXRange && Math.abs(canvasY - y) <= thresholdPx) {
                    return { id: guide.id, orientation: "horizontal" }
                }
            }
        }

        return null
    }, [guides, panX, panY, showResult, zoom])

    const getHitShapeHandle = useCallback((clientX: number, clientY: number): { shapeId: string; handle: ResizeHandle } | null => {
        const canvas = canvasRef.current
        const image = imageRef.current
        if (!canvas || !image || showResult) return null
        if (!annotationShapes.length) return null

        const rect = canvas.getBoundingClientRect()
        const canvasX = clientX - rect.left
        const canvasY = clientY - rect.top

        const scaledWidth = image.width * zoom
        const scaledHeight = image.height * zoom
        const offsetX = (canvas.width - scaledWidth) / 2 + panX
        const offsetY = (canvas.height - scaledHeight) / 2 + panY
        const handleSize = 10

        for (let i = annotationShapes.length - 1; i >= 0; i -= 1) {
            const shape = annotationShapes[i]
            const x = offsetX + shape.x * zoom
            const y = offsetY + shape.y * zoom
            const width = Math.max(1, shape.width * zoom)
            const height = Math.max(1, shape.height * zoom)

            const hitTest = (hx: number, hy: number) =>
                Math.abs(canvasX - hx) <= handleSize && Math.abs(canvasY - hy) <= handleSize

            if (hitTest(x, y)) return { shapeId: shape.id, handle: "nw" }
            if (hitTest(x + width, y)) return { shapeId: shape.id, handle: "ne" }
            if (hitTest(x, y + height)) return { shapeId: shape.id, handle: "sw" }
            if (hitTest(x + width, y + height)) return { shapeId: shape.id, handle: "se" }
            if (hitTest(x + width / 2, y)) return { shapeId: shape.id, handle: "n" }
            if (hitTest(x + width, y + height / 2)) return { shapeId: shape.id, handle: "e" }
            if (hitTest(x + width / 2, y + height)) return { shapeId: shape.id, handle: "s" }
            if (hitTest(x, y + height / 2)) return { shapeId: shape.id, handle: "w" }
        }
        return null
    }, [annotationShapes, panX, panY, showResult, zoom])

    const getHitShapeBody = useCallback((clientX: number, clientY: number): string | null => {
        const canvas = canvasRef.current
        const image = imageRef.current
        if (!canvas || !image || showResult) return null
        if (!annotationShapes.length) return null

        const rect = canvas.getBoundingClientRect()
        const canvasX = clientX - rect.left
        const canvasY = clientY - rect.top

        const scaledWidth = image.width * zoom
        const scaledHeight = image.height * zoom
        const offsetX = (canvas.width - scaledWidth) / 2 + panX
        const offsetY = (canvas.height - scaledHeight) / 2 + panY

        for (let i = annotationShapes.length - 1; i >= 0; i -= 1) {
            const shape = annotationShapes[i]
            const x = offsetX + shape.x * zoom
            const y = offsetY + shape.y * zoom
            const width = Math.max(1, shape.width * zoom)
            const height = Math.max(1, shape.height * zoom)

            if (shape.type === "ellipse") {
                const rx = width / 2
                const ry = height / 2
                const cx = x + rx
                const cy = y + ry
                const nx = (canvasX - cx) / Math.max(rx, 1)
                const ny = (canvasY - cy) / Math.max(ry, 1)
                if (nx * nx + ny * ny <= 1) return shape.id
            } else {
                const hit = canvasX >= x && canvasX <= x + width && canvasY >= y && canvasY <= y + height
                if (hit) return shape.id
            }
        }

        return null
    }, [annotationShapes, panX, panY, showResult, zoom])

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
        const isRepairTool = (toolMode === "brush" || toolMode === "wand") && !showResult
        const isBrushEraseGesture = isRepairTool && (e.button === 2 || isBrushErasePinned)
        const shouldPan =
            e.button === 1 ||
            (e.button === 2 && !isBrushEraseGesture) ||
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
        if (toolMode === "selection") {
            const hitGuide = getHitGuide(e.clientX, e.clientY)
            if (hitGuide) {
                setDraggingGuideId(hitGuide.id)
                setDraggingGuideOrientation(hitGuide.orientation)
                if (canvasRef.current) {
                    canvasRef.current.style.cursor = hitGuide.orientation === "vertical" ? "ew-resize" : "ns-resize"
                }
                return
            }

            const shapeHandleHit = getHitShapeHandle(e.clientX, e.clientY)
            if (shapeHandleHit) {
                const hitShape = getShapeById(shapeHandleHit.shapeId)
                if (hitShape) {
                    setActiveShapeId(hitShape.id)
                    setIsResizingShape(true)
                    setResizingShapeId(hitShape.id)
                    setShapeResizeHandle(shapeHandleHit.handle)
                    setShapeResizeStartPoint({ x: e.clientX, y: e.clientY })
                    setOriginalShapeForResize({ ...hitShape })
                    if (canvasRef.current) {
                        canvasRef.current.style.cursor = getResizeCursor(shapeHandleHit.handle)
                    }
                    return
                }
            }

            const hitShapeId = getHitShapeBody(e.clientX, e.clientY)
            if (hitShapeId) {
                const hitShape = getShapeById(hitShapeId)
                if (hitShape) {
                    setActiveShapeId(hitShape.id)
                    setIsDraggingShape(true)
                    setDraggingShapeId(hitShape.id)
                    setShapeDragStartPoint({ x: e.clientX, y: e.clientY })
                    setOriginalShapeForDrag({ ...hitShape })
                    if (canvasRef.current) {
                        canvasRef.current.style.cursor = "move"
                    }
                    return
                }
            }

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
            setActiveShapeId(null)
        }

        // 左键绘制新选区
        const coords = getImageCoordinates(e.clientX, e.clientY)
        if (coords) {
            if (toolMode === "wand") {
                const erase = isBrushErasePinned || e.altKey || e.button === 2
                applyMagicWandAt(coords, erase)
                return
            }
            const snappedStart = toolMode === "selection"
                ? {
                    x: snapCoordinateToGuide(coords.x, "vertical"),
                    y: snapCoordinateToGuide(coords.y, "horizontal"),
                }
                : coords
            setIsDrawing(true)
            setStartPoint(snappedStart)
            if (toolMode === "brush") {
                brushEraseModeRef.current = isBrushErasePinned || e.altKey || e.button === 2
                lastBrushPointRef.current = coords
                paintBrushStroke(coords, coords, brushEraseModeRef.current)
                drawCanvas()
                setCurrentSelection(null)
            } else {
                setCurrentSelection({
                    id: `sel-${Date.now()}`,
                    x: snappedStart.x,
                    y: snappedStart.y,
                    width: 0,
                    height: 0,
                })
            }
        }
    }

    // 鼠标移动
    const handleMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
        // 更新光标样式
        if (!isDrawing && !isPanning && !isResizing && !isDraggingShape && !isResizingShape && !draggingGuideId) {
            const canvas = canvasRef.current
            if (canvas) {
                if (showResult || isSpacePressed) {
                    canvas.style.cursor = "grab"
                } else {
                    if (toolMode === "brush") {
                        canvas.style.cursor = isBrushErasePinned ? "not-allowed" : "cell"
                    } else if (toolMode === "wand") {
                        canvas.style.cursor = isBrushErasePinned ? "not-allowed" : "crosshair"
                    } else {
                        const guideHit = getHitGuide(e.clientX, e.clientY)
                        if (guideHit) {
                            canvas.style.cursor = guideHit.orientation === "vertical" ? "ew-resize" : "ns-resize"
                            return
                        }
                        const shapeHandleHit = getHitShapeHandle(e.clientX, e.clientY)
                        if (shapeHandleHit) {
                            canvas.style.cursor = getResizeCursor(shapeHandleHit.handle)
                            return
                        }
                        const shapeBodyHit = getHitShapeBody(e.clientX, e.clientY)
                        if (shapeBodyHit) {
                            canvas.style.cursor = "move"
                            return
                        }
                        const hitResult = getHitHandle(e.clientX, e.clientY)
                        canvas.style.cursor = hitResult ? getResizeCursor(hitResult.handle) : "crosshair"
                    }
                }
            }
        }

        if (draggingGuideId && draggingGuideOrientation && currentImage) {
            const image = imageRef.current
            const coords = getImageCoordinates(e.clientX, e.clientY)
            if (!image || !coords) return
            const nextPosition = draggingGuideOrientation === "vertical"
                ? Math.max(0, Math.min(image.width, coords.x))
                : Math.max(0, Math.min(image.height, coords.y))
            setGuides(
                currentImage.id,
                guides.map((guide) =>
                    guide.id === draggingGuideId
                        ? { ...guide, position: Math.round(nextPosition) }
                        : guide
                )
            )
            return
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

        if (isDraggingShape && shapeDragStartPoint && originalShapeForDrag && draggingShapeId && currentImage) {
            const image = imageRef.current
            if (!image) return

            const dx = (e.clientX - shapeDragStartPoint.x) / zoom
            const dy = (e.clientY - shapeDragStartPoint.y) / zoom
            const maxX = Math.max(0, image.width - originalShapeForDrag.width)
            const maxY = Math.max(0, image.height - originalShapeForDrag.height)
            const newX = Math.max(0, Math.min(maxX, originalShapeForDrag.x + dx))
            const newY = Math.max(0, Math.min(maxY, originalShapeForDrag.y + dy))

            setAnnotationShapes(
                currentImage.id,
                annotationShapes.map((shape) =>
                    shape.id === draggingShapeId
                        ? { ...shape, x: Math.round(newX), y: Math.round(newY) }
                        : shape
                )
            )
            return
        }

        if (isResizingShape && shapeResizeStartPoint && originalShapeForResize && resizingShapeId && shapeResizeHandle && currentImage) {
            const image = imageRef.current
            if (!image) return

            const dx = (e.clientX - shapeResizeStartPoint.x) / zoom
            const dy = (e.clientY - shapeResizeStartPoint.y) / zoom
            const original = originalShapeForResize
            let newX = original.x
            let newY = original.y
            let newW = original.width
            let newH = original.height

            switch (shapeResizeHandle) {
                case "nw":
                    newX = original.x + dx
                    newY = original.y + dy
                    newW = original.width - dx
                    newH = original.height - dy
                    break
                case "ne":
                    newY = original.y + dy
                    newW = original.width + dx
                    newH = original.height - dy
                    break
                case "sw":
                    newX = original.x + dx
                    newW = original.width - dx
                    newH = original.height + dy
                    break
                case "se":
                    newW = original.width + dx
                    newH = original.height + dy
                    break
                case "n":
                    newY = original.y + dy
                    newH = original.height - dy
                    break
                case "e":
                    newW = original.width + dx
                    break
                case "s":
                    newH = original.height + dy
                    break
                case "w":
                    newX = original.x + dx
                    newW = original.width - dx
                    break
            }

            const minSize = 8
            if (newW < minSize) {
                if (shapeResizeHandle.includes("w")) newX = original.x + original.width - minSize
                newW = minSize
            }
            if (newH < minSize) {
                if (shapeResizeHandle.includes("n")) newY = original.y + original.height - minSize
                newH = minSize
            }

            if (shapeResizeHandle.includes("w")) {
                const snappedLeft = snapCoordinateToGuide(newX, "vertical")
                const delta = snappedLeft - newX
                newX = snappedLeft
                newW -= delta
            }
            if (shapeResizeHandle.includes("e")) {
                const snappedRight = snapCoordinateToGuide(newX + newW, "vertical")
                newW = snappedRight - newX
            }
            if (shapeResizeHandle.includes("n")) {
                const snappedTop = snapCoordinateToGuide(newY, "horizontal")
                const delta = snappedTop - newY
                newY = snappedTop
                newH -= delta
            }
            if (shapeResizeHandle.includes("s")) {
                const snappedBottom = snapCoordinateToGuide(newY + newH, "horizontal")
                newH = snappedBottom - newY
            }

            if (newW < minSize) newW = minSize
            if (newH < minSize) newH = minSize

            if (newX < 0) {
                if (shapeResizeHandle.includes("w")) newW += newX
                newX = 0
            }
            if (newY < 0) {
                if (shapeResizeHandle.includes("n")) newH += newY
                newY = 0
            }

            if (newX + newW > image.width) {
                if (shapeResizeHandle.includes("e")) {
                    newW = image.width - newX
                } else {
                    newX = image.width - newW
                }
            }
            if (newY + newH > image.height) {
                if (shapeResizeHandle.includes("s")) {
                    newH = image.height - newY
                } else {
                    newY = image.height - newH
                }
            }

            if (newW < minSize) newW = minSize
            if (newH < minSize) newH = minSize

            setAnnotationShapes(
                currentImage.id,
                annotationShapes.map((shape) =>
                    shape.id === resizingShapeId
                        ? {
                            ...shape,
                            x: Math.round(newX),
                            y: Math.round(newY),
                            width: Math.round(newW),
                            height: Math.round(newH),
                        }
                        : shape
                )
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

            // 参考线吸附
            if (resizeHandle.includes("w")) {
                const snappedLeft = snapCoordinateToGuide(newX, "vertical")
                const delta = snappedLeft - newX
                newX = snappedLeft
                newW -= delta
            }
            if (resizeHandle.includes("e")) {
                const snappedRight = snapCoordinateToGuide(newX + newW, "vertical")
                newW = snappedRight - newX
            }
            if (resizeHandle.includes("n")) {
                const snappedTop = snapCoordinateToGuide(newY, "horizontal")
                const delta = snappedTop - newY
                newY = snappedTop
                newH -= delta
            }
            if (resizeHandle.includes("s")) {
                const snappedBottom = snapCoordinateToGuide(newY + newH, "horizontal")
                newH = snappedBottom - newY
            }

            if (newW < minSize) {
                if (resizeHandle.includes("w")) newX = newX + (newW - minSize)
                newW = minSize
            }
            if (newH < minSize) {
                if (resizeHandle.includes("n")) newY = newY + (newH - minSize)
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
                if (toolMode === "brush") {
                    const from = lastBrushPointRef.current || coords
                    const erase = isBrushErasePinned || brushEraseModeRef.current || e.altKey
                    paintBrushStroke(from, coords, erase)
                    lastBrushPointRef.current = coords
                } else {
                    const snappedX = snapCoordinateToGuide(coords.x, "vertical")
                    const snappedY = snapCoordinateToGuide(coords.y, "horizontal")
                    const x = Math.min(startPoint.x, snappedX)
                    const y = Math.min(startPoint.y, snappedY)
                    const width = Math.abs(snappedX - startPoint.x)
                    const height = Math.abs(snappedY - startPoint.y)

                    setCurrentSelection((prev) =>
                        prev ? { ...prev, x, y, width, height } : null
                    )
                }
                drawCanvas()
            }
        }
    }

    // 鼠标松开
    const handleMouseUp = () => {
        const canvas = canvasRef.current

        if (draggingGuideId) {
            setDraggingGuideId(null)
            setDraggingGuideOrientation(null)
            if (canvas) {
                canvas.style.cursor = idleCursor
            }
            return
        }

        if (isPanning) {
            setIsPanning(false)
            panSessionRef.current = null
            if (canvas) {
                canvas.style.cursor = idleCursor
            }
            return
        }

        if (isDraggingShape) {
            setIsDraggingShape(false)
            setDraggingShapeId(null)
            setShapeDragStartPoint(null)
            setOriginalShapeForDrag(null)
            if (canvas) {
                canvas.style.cursor = idleCursor
            }
            return
        }

        if (isResizingShape) {
            setIsResizingShape(false)
            setResizingShapeId(null)
            setShapeResizeHandle(null)
            setShapeResizeStartPoint(null)
            setOriginalShapeForResize(null)
            if (canvas) {
                canvas.style.cursor = idleCursor
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
                canvas.style.cursor = idleCursor
            }
            return
        }

        if (isDrawing && currentImage) {
            if (toolMode === "brush") {
                persistMaskToStore()
            } else if (currentSelection && currentSelection.width > 10 && currentSelection.height > 10) {
                // 只有当选区有一定大小时才添加
                const newSelections = [...(currentImage.selections || []), currentSelection]
                updateSelections(currentImage.id, newSelections)
            }
            setIsDrawing(false)
            setStartPoint(null)
            setCurrentSelection(null)
            lastBrushPointRef.current = null
            brushEraseModeRef.current = false
        }

        if (canvas) {
            canvas.style.cursor = idleCursor
        }
    }

    // 滚轮缩放
    const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
        e.preventDefault()
        if (!showResult && toolMode === "brush" && e.altKey) {
            const delta = e.deltaY > 0 ? -2 : 2
            setBrushSize((prev) => Math.max(8, Math.min(128, prev + delta)))
            return
        }
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

    const handleClearRepairMask = () => {
        if (!currentImage) return
        clearLocalMaskCanvas()
        clearRepairMask(currentImage.id)
        drawCanvas()
    }

    const readFileAsDataUrl = useCallback((file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result || ""))
            reader.onerror = () => reject(new Error("READ_MASK_FAILED"))
            reader.readAsDataURL(file)
        })
    }, [])

    const handleImportMaskFile = useCallback(async (file: File) => {
        const baseImage = imageRef.current
        if (!currentImage || !baseImage) {
            toast.error(locale === "zh" ? "请先选择图片" : "Please select an image first")
            return
        }

        try {
            const dataUrl = await readFileAsDataUrl(file)
            if (!dataUrl) {
                throw new Error(locale === "zh" ? "无法读取 mask 文件" : "Failed to read mask file")
            }

            const importedMask = await loadImage(dataUrl)
            const maskCanvas = ensureMaskCanvas(baseImage.width, baseImage.height)
            const maskCtx = maskCanvas.getContext("2d")
            if (!maskCtx) {
                throw new Error(locale === "zh" ? "无法初始化遮罩画布" : "Failed to initialize mask canvas")
            }

            maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height)
            maskCtx.drawImage(importedMask, 0, 0, maskCanvas.width, maskCanvas.height)

            // 支持黑白/彩色 mask：将亮度映射到 alpha，统一成白色透明度遮罩。
            const imageData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height)
            const pixels = imageData.data
            for (let i = 0; i < pixels.length; i += 4) {
                const alpha = pixels[i + 3] / 255
                const luminance = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3
                const maskAlpha = Math.round(luminance * alpha)
                pixels[i] = 255
                pixels[i + 1] = 255
                pixels[i + 2] = 255
                pixels[i + 3] = maskAlpha
            }
            maskCtx.putImageData(imageData, 0, 0)

            persistMaskToStore()
            drawCanvas()
            toast.success(locale === "zh" ? "已导入 mask，可直接修复" : "Mask imported. Ready to inpaint.")
        } catch (error) {
            const message = error instanceof Error ? error.message : ""
            toast.error(
                message && message !== "READ_MASK_FAILED"
                    ? message
                    : (locale === "zh" ? "导入 mask 失败" : "Failed to import mask")
            )
        }
    }, [currentImage, drawCanvas, ensureMaskCanvas, locale, persistMaskToStore, readFileAsDataUrl])

    const handleFileUpload = useCallback((files: FileList | null) => {
        if (!files) return
        const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"))
        if (imageFiles.length > 0) {
            addImages(imageFiles)
        }
    }, [addImages])

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

    const applyOpacityPreset = useCallback((preset: "edit" | "compare" | "mask") => {
        if (preset === "edit") {
            setOriginalOpacity(100)
            setInpaintOpacity(100)
            setMaskOverlayOpacity(46)
            setShowInpaintOverlay(false)
            return
        }
        if (preset === "compare") {
            setOriginalOpacity(25)
            setInpaintOpacity(75)
            setMaskOverlayOpacity(0)
            setShowInpaintOverlay(true)
            return
        }
        setOriginalOpacity(25)
        setInpaintOpacity(0)
        setMaskOverlayOpacity(75)
        setShowInpaintOverlay(false)
    }, [])

    const idleCursor =
        showResult || isSpacePressed
            ? "grab"
            : toolMode === "brush"
                ? (isBrushErasePinned ? "not-allowed" : "cell")
                : toolMode === "wand"
                    ? (isBrushErasePinned ? "not-allowed" : "crosshair")
                    : "crosshair"

    const idleCursorClass =
        showResult || isSpacePressed
            ? "cursor-grab"
            : toolMode === "brush"
                ? (isBrushErasePinned ? "cursor-not-allowed" : "cursor-cell")
                : toolMode === "wand"
                    ? (isBrushErasePinned ? "cursor-not-allowed" : "cursor-crosshair")
                    : "cursor-crosshair"

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
                <Button
                    variant={toolMode === "selection" ? "secondary" : "ghost"}
                    size="icon"
                    className="h-11 w-11"
                    title={locale === "zh" ? "矩形选区模式" : "Rectangle selection mode"}
                    aria-label={locale === "zh" ? "矩形选区模式" : "Rectangle selection mode"}
                    onClick={() => setToolMode("selection")}
                >
                    <Square className="h-4 w-4" />
                </Button>
                <Button
                    variant={toolMode === "wand" ? "secondary" : "ghost"}
                    size="icon"
                    className="h-11 w-11"
                    title={locale === "zh" ? "魔棒模式（连通区域）" : "Magic Wand mode (connected region)"}
                    aria-label={locale === "zh" ? "魔棒模式（连通区域）" : "Magic Wand mode (connected region)"}
                    onClick={() => setToolMode("wand")}
                >
                    <Wand2 className="h-4 w-4" />
                </Button>
                <Button
                    variant={toolMode === "brush" ? "secondary" : "ghost"}
                    size="icon"
                    className="h-11 w-11"
                    title={locale === "zh" ? "修复画笔模式（Beta）" : "Repair brush mode (beta)"}
                    aria-label={locale === "zh" ? "修复画笔模式（Beta）" : "Repair brush mode (beta)"}
                    onClick={() => setToolMode("brush")}
                >
                    <Brush className="h-4 w-4" />
                </Button>
                {toolMode === "wand" && (
                    <div className="hidden lg:flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1">
                        <div className="flex items-center gap-1 rounded bg-background/70 px-1 py-0.5">
                            <Button
                                type="button"
                                variant={wandToneMode === "auto" ? "secondary" : "ghost"}
                                size="sm"
                                className="h-6 px-2 text-[11px]"
                                onClick={() => setWandToneMode("auto")}
                            >
                                {locale === "zh" ? "自动" : "Auto"}
                            </Button>
                            <Button
                                type="button"
                                variant={wandToneMode === "dark" ? "secondary" : "ghost"}
                                size="sm"
                                className="h-6 px-2 text-[11px]"
                                onClick={() => setWandToneMode("dark")}
                            >
                                {locale === "zh" ? "深字" : "Dark"}
                            </Button>
                            <Button
                                type="button"
                                variant={wandToneMode === "light" ? "secondary" : "ghost"}
                                size="sm"
                                className="h-6 px-2 text-[11px]"
                                onClick={() => setWandToneMode("light")}
                            >
                                {locale === "zh" ? "浅字" : "Light"}
                            </Button>
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="text-[11px] text-muted-foreground">
                                {locale === "zh" ? "容差" : "Tol"}
                            </span>
                            <input
                                type="range"
                                min={0}
                                max={100}
                                value={wandTolerance}
                                aria-label={locale === "zh" ? "魔棒容差阈值" : "Magic wand tolerance threshold"}
                                className="w-16 accent-primary"
                                onChange={(e) => setWandTolerance(Number(e.target.value))}
                            />
                            <span className="w-7 text-right text-[11px] text-muted-foreground">
                                {wandTolerance}
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="text-[11px] text-muted-foreground">
                                {locale === "zh" ? "上限" : "Cap"}
                            </span>
                            <input
                                type="range"
                                min={2}
                                max={100}
                                value={wandMaxAreaPercent}
                                aria-label={locale === "zh" ? "魔棒连通区域面积上限" : "Magic wand connected area cap"}
                                className="w-16 accent-primary"
                                onChange={(e) => setWandMaxAreaPercent(Number(e.target.value))}
                            />
                            <span className="w-9 text-right text-[11px] text-muted-foreground">
                                {wandMaxAreaPercent}%
                            </span>
                        </div>
                    </div>
                )}
                <Button
                    variant={isBrushErasePinned ? "secondary" : "ghost"}
                    size="icon"
                    className="h-11 w-11"
                    title={locale === "zh" ? "橡皮擦模式开关" : "Toggle eraser mode"}
                    aria-label={locale === "zh" ? "橡皮擦模式开关" : "Toggle eraser mode"}
                    onClick={() => setIsBrushErasePinned((prev) => !prev)}
                    disabled={toolMode !== "brush" && toolMode !== "wand"}
                >
                    <Eraser className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11"
                    title={locale === "zh" ? "导入 mask 图层" : "Import mask layer"}
                    aria-label={locale === "zh" ? "导入 mask 图层" : "Import mask layer"}
                    onClick={() => maskInputRef.current?.click()}
                    disabled={!currentImage}
                >
                    <Upload className="h-4 w-4" />
                </Button>
                <input
                    ref={maskInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    aria-label={locale === "zh" ? "导入 mask 图层文件" : "Import mask layer file"}
                    onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        void handleImportMaskFile(file)
                        e.currentTarget.value = ""
                    }}
                />
                <div className="hidden lg:flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-1.5 py-1">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => applyOpacityPreset("edit")}
                    >
                        {locale === "zh" ? "编辑" : "Edit"}
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => applyOpacityPreset("compare")}
                    >
                        {locale === "zh" ? "对比" : "Compare"}
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => applyOpacityPreset("mask")}
                    >
                        {locale === "zh" ? "遮罩" : "Mask"}
                    </Button>
                    <Button
                        type="button"
                        variant={showInpaintOverlay ? "secondary" : "ghost"}
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setShowInpaintOverlay((prev) => !prev)}
                        title={locale === "zh" ? "切换 inpaint 叠加预览" : "Toggle inpaint overlay"}
                        aria-label={locale === "zh" ? "切换 inpaint 叠加预览" : "Toggle inpaint overlay"}
                    >
                        {showInpaintOverlay ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </Button>
                </div>
                <div className="hidden 2xl:flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground">
                    <label className="inline-flex items-center gap-1">
                        <span>M</span>
                        <input
                            type="range"
                            min={0}
                            max={100}
                            value={maskOverlayOpacity}
                            aria-label={locale === "zh" ? "Mask 透明度" : "Mask opacity"}
                            className="w-14 accent-primary"
                            onChange={(e) => setMaskOverlayOpacity(Number(e.target.value))}
                        />
                    </label>
                    <label className="inline-flex items-center gap-1">
                        <span>O</span>
                        <input
                            type="range"
                            min={0}
                            max={100}
                            value={originalOpacity}
                            aria-label={locale === "zh" ? "原图透明度" : "Original opacity"}
                            className="w-14 accent-primary"
                            onChange={(e) => setOriginalOpacity(Number(e.target.value))}
                        />
                    </label>
                    <label className="inline-flex items-center gap-1">
                        <span>I</span>
                        <input
                            type="range"
                            min={0}
                            max={100}
                            value={inpaintOpacity}
                            aria-label={locale === "zh" ? "Inpaint 透明度" : "Inpaint opacity"}
                            className="w-14 accent-primary"
                            onChange={(e) => setInpaintOpacity(Number(e.target.value))}
                        />
                    </label>
                </div>
                <div className="flex-1" />
                <span className="hidden lg:inline text-xs text-muted-foreground">
                    {toolMode === "brush"
                        ? (
                            locale === "zh"
                                ? `修复画笔：${isBrushErasePinned ? "橡皮擦已锁定" : "Alt/右键擦除"}，Alt+滚轮调大小(${brushSize}px)`
                                : `Repair brush: ${isBrushErasePinned ? "eraser locked" : "Alt/right-click erase"}, Alt+wheel size (${brushSize}px)`
                        )
                        : toolMode === "wand"
                            ? (
                                locale === "zh"
                                    ? `魔棒：${wandToneMode === "auto" ? "自动" : wandToneMode === "dark" ? "深字" : "浅字"}，容差=${wandTolerance}，上限=${wandMaxAreaPercent}%${isBrushErasePinned ? "（擦除模式）" : ""}`
                                    : `Magic wand: ${wandToneMode}, tol=${wandTolerance}, cap=${wandMaxAreaPercent}%${isBrushErasePinned ? " (erase mode)" : ""}`
                            )
                        : (locale === "zh" ? "拖拽: 中键/右键，或空格+左键" : "Pan: middle/right click, or Space + left click")}
                </span>
                <span className="text-sm text-muted-foreground">
                    {Math.round(zoom * 100)}%
                </span>
                <Dialog>
                    <DialogTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11"
                            title={locale === "zh" ? "快捷帮助" : "Help"}
                            aria-label={locale === "zh" ? "快捷帮助" : "Help"}
                        >
                            <HelpCircle className="h-4 w-4" />
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-lg">
                        <DialogHeader>
                            <DialogTitle>{locale === "zh" ? "编辑器快捷帮助" : "Editor Quick Help"}</DialogTitle>
                        </DialogHeader>
                        <ul className="space-y-1 text-sm text-muted-foreground">
                            <li>{locale === "zh" ? "1. 画笔模式：Alt 或右键临时擦除；可点击橡皮擦按钮锁定擦除。" : "1. Brush mode: Alt/right-click for temporary erase; use eraser button to lock erase mode."}</li>
                            <li>{locale === "zh" ? "2. 魔棒模式：可切换自动/深字/浅字，容差决定相似度，面积上限防止一键吞掉大背景。" : "2. Magic wand: switch Auto/Dark/Light tone, tolerance controls similarity, area cap avoids huge flood fill."}</li>
                            <li>{locale === "zh" ? "3. 导入 mask：点击上传图标，可直接用外部 mask 图做修复。" : "3. Import mask: use upload icon to inpaint from an external mask image."}</li>
                            <li>{locale === "zh" ? "4. 透明度预设：编辑/对比/遮罩三个按钮可快速切换图层显示。" : "4. Opacity presets: Edit/Compare/Mask quickly switch layer visibility."}</li>
                            <li>{locale === "zh" ? "5. Esc：取消当前绘制，或删除最后一个选区（手动画框模式）。" : "5. Esc: cancel current drawing, or delete last selection (manual selection mode)."}</li>
                        </ul>
                    </DialogContent>
                </Dialog>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11"
                    onClick={handleClearRepairMask}
                    title={locale === "zh" ? "清空修复画笔掩膜" : "Clear repair brush mask"}
                    aria-label={locale === "zh" ? "清空修复画笔掩膜" : "Clear repair brush mask"}
                    disabled={!currentImage?.repairMaskUrl}
                >
                    <Eraser className="h-4 w-4" />
                </Button>
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
                        className={`absolute inset-0 touch-none ${idleCursorClass}`}
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
                                    if (toolMode === "wand") {
                                        brushEraseModeRef.current = isBrushErasePinned
                                        applyMagicWandAt(coords, brushEraseModeRef.current)
                                        return
                                    }
                                    const snappedStart = toolMode === "selection"
                                        ? {
                                            x: snapCoordinateToGuide(coords.x, "vertical"),
                                            y: snapCoordinateToGuide(coords.y, "horizontal"),
                                        }
                                        : coords
                                    setIsDrawing(true)
                                    setStartPoint(snappedStart)
                                    if (toolMode === "brush") {
                                        brushEraseModeRef.current = isBrushErasePinned
                                        lastBrushPointRef.current = coords
                                        paintBrushStroke(coords, coords, brushEraseModeRef.current)
                                        drawCanvas()
                                        setCurrentSelection(null)
                                    } else {
                                        setCurrentSelection({
                                            id: `sel-${Date.now()}`,
                                            x: snappedStart.x,
                                            y: snappedStart.y,
                                            width: 0,
                                            height: 0,
                                        })
                                    }
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
                                    if (toolMode === "brush") {
                                        const from = lastBrushPointRef.current || coords
                                        paintBrushStroke(from, coords, brushEraseModeRef.current || isBrushErasePinned)
                                        lastBrushPointRef.current = coords
                                    } else {
                                        const snappedX = snapCoordinateToGuide(coords.x, "vertical")
                                        const snappedY = snapCoordinateToGuide(coords.y, "horizontal")
                                        const x = Math.min(startPoint.x, snappedX)
                                        const y = Math.min(startPoint.y, snappedY)
                                        const width = Math.abs(snappedX - startPoint.x)
                                        const height = Math.abs(snappedY - startPoint.y)
                                        setCurrentSelection((prev) =>
                                            prev ? { ...prev, x, y, width, height } : null
                                        )
                                    }
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
                            if (isDrawing && currentImage) {
                                if (toolMode === "brush") {
                                    persistMaskToStore()
                                } else if (currentSelection && currentSelection.width > 10 && currentSelection.height > 10) {
                                    const newSelections = [...(currentImage.selections || []), currentSelection]
                                    updateSelections(currentImage.id, newSelections)
                                }
                                setIsDrawing(false)
                                setStartPoint(null)
                                setCurrentSelection(null)
                                lastBrushPointRef.current = null
                                brushEraseModeRef.current = false
                            }
                        }}
                    />
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                        <ImageIcon className="h-12 w-12 mb-4 opacity-50" />
                        <p>{t.editor.canvas.noImage}</p>
                        <p className="text-xs mt-2 text-center max-w-xs">
                            {locale === "zh"
                                ? "手机端请点击下方按钮选择图片，或使用右上角工具按钮打开完整面板。"
                                : "On mobile, tap the button below to upload, or open the full tool panel from the top-right button."}
                        </p>
                        <Button
                            className="mt-4 h-11 px-6"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            {locale === "zh" ? "上传图片" : "Upload images"}
                        </Button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            aria-label={locale === "zh" ? "上传图片" : "Upload images"}
                            className="hidden"
                            onChange={(e) => handleFileUpload(e.target.files)}
                        />
                    </div>
                )}
            </div>
        </div>
    )
}
