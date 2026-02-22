"use client"

import { useRef, useCallback, useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { useEditorStore } from "@/lib/stores/editor-store"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/ui/icon-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    File,
    FileJson,
    FolderOpen,
    Clipboard,
    X,
    ChevronDown,
    Settings,
    Coins,
    Languages,
    Loader2,
    Trash2,
} from "lucide-react"
import { getMessages } from "@/lib/i18n"
import { detectTextBlocks, GEMINI_MODELS, OPENAI_MODELS, type DetectTextResponse } from "@/lib/ai/ai-service"
import { imageToDataUrl, loadImage } from "@/lib/utils/image-utils"
import { EDITOR_IMAGE_ACCEPT, normalizeEditorImageFiles } from "@/lib/utils/image-import"
import type { Selection } from "@/types/database"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { RechargePanel } from "@/components/profile/recharge-panel"
import { RichTextEditor } from "@/components/editor/rich-text-editor"

interface EditorSidebarProps {
    className?: string
}

interface SidecarZipRestoreRecord {
    file: File
    payload: Record<string, unknown>
}

interface SidecarPreviewDetail {
    fileName: string
    blockCount: number
    selectionCount: number
    hasPrompt: boolean
    previewTexts: Array<{
        sourceText: string
        translatedText: string
    }>
}

type SidecarImportPlan =
    | {
        kind: "json"
        sourceFileName: string
        payload: Record<string, unknown>
        blockCount: number
        selectionCount: number
        hasPrompt: boolean
        previewDetails: SidecarPreviewDetail[]
    }
    | {
        kind: "zip"
        sourceFileName: string
        restoreRecords: SidecarZipRestoreRecord[]
        skippedItems: string[]
        imageCount: number
        blockCount: number
        selectionCount: number
        promptCount: number
        previewDetails: SidecarPreviewDetail[]
    }

function richHtmlToPlainText(html: string): string {
    if (!html) return ""
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, "text/html")
    doc.querySelectorAll("br").forEach((br) => br.replaceWith("\n"))
    doc.querySelectorAll("p,div,li").forEach((node) => {
        node.appendChild(doc.createTextNode("\n"))
    })
    return (doc.body.textContent || "")
        .replace(/\u00a0/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
}

export function EditorSidebar({ className }: EditorSidebarProps = {}) {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const folderInputRef = useRef<HTMLInputElement>(null)
    const sidecarImportInputRef = useRef<HTMLInputElement>(null)
    const wordImportInputRef = useRef<HTMLInputElement>(null)
    const textLayerImportInputRef = useRef<HTMLInputElement>(null)
    const findInputRef = useRef<HTMLInputElement>(null)
    const [isAutoDetecting, setIsAutoDetecting] = useState(false)
    const [rechargeDialogOpen, setRechargeDialogOpen] = useState(false)
    const [manualJsonOpen, setManualJsonOpen] = useState(false)
    const [manualJsonInput, setManualJsonInput] = useState("")
    const [findText, setFindText] = useState("")
    const [replaceText, setReplaceText] = useState("")
    const [replaceScope, setReplaceScope] = useState<"translated" | "source" | "both">("translated")
    const [selectedBlockIndexes, setSelectedBlockIndexes] = useState<number[]>([])
    const [bulkTextValue, setBulkTextValue] = useState("")
    const [copiedBlocks, setCopiedBlocks] = useState<Array<{ sourceText: string; translatedText: string; richTextHtml?: string; bbox: { x: number; y: number; width: number; height: number }; style?: Record<string, unknown> }>>([])
    const [clearGalleryArmed, setClearGalleryArmed] = useState(false)
    const [sidecarPreviewOpen, setSidecarPreviewOpen] = useState(false)
    const [sidecarImportPlan, setSidecarImportPlan] = useState<SidecarImportPlan | null>(null)
    const [isPreparingSidecarImport, setIsPreparingSidecarImport] = useState(false)
    const [isApplyingSidecarImport, setIsApplyingSidecarImport] = useState(false)

    const {
        images,
        currentImageId,
        settings,
        prompt,
        applyToAll,
        locale,
        coins,
        coinsLoading,
        addImages,
        removeImage,
        clearImages,
        setCurrentImage,
        updateSettings,
        updateSelections,
        setDetectedTextBlocks,
        clearDetectedTextBlocks,
        setPrompt,
        setApplyToAll,
        setCoins,
        setCoinsLoading,
    } = useEditorStore()

    const t = getMessages(locale)
    const currentImage = images.find((img) => img.id === currentImageId) || null
    const fileNameCollator = useMemo(
        () =>
            new Intl.Collator(locale === "zh" ? "zh-Hans-u-kn-true" : "en-u-kn-true", {
                numeric: true,
                sensitivity: "base",
            }),
        [locale]
    )
    const sortedImages = useMemo(
        () => [...images].sort((a, b) => fileNameCollator.compare(a.file.name, b.file.name)),
        [images, fileNameCollator]
    )
    const SAFE_DETECT_PAYLOAD_CHARS = 2_000_000
    const isComicModuleEnabled = settings.enableComicModule ?? true
    const isBubbleDetectionEnabled = isComicModuleEnabled && (settings.enableBubbleDetection ?? true)
    const isPatchEditorEnabled = isComicModuleEnabled && (settings.enablePatchEditor ?? true)
    const defaultOrientation: "vertical" | "horizontal" =
        (settings.defaultVerticalText ?? true) ? "vertical" : "horizontal"

    const applyDefaultOrientationToBlocks = useCallback((
        blocks: Array<{
            sourceText: string
            translatedText: string
            richTextHtml?: string
            bbox: { x: number; y: number; width: number; height: number }
            sourceLanguage?: string
            lines?: string[]
            segments?: Array<{ x: number; y: number; width: number; height: number }>
            style?: {
                textColor?: string
                outlineColor?: string
                strokeColor?: string
                strokeWidth?: number
                textOpacity?: number
                fontFamily?: string
                angle?: number
                orientation?: "vertical" | "horizontal" | "auto"
                alignment?: "start" | "center" | "end" | "justify" | "auto"
                fontWeight?: string
            }
        }>
    ) => (
        blocks.map((block) => {
            const orientation = block.style?.orientation
            if (orientation === "vertical" || orientation === "horizontal" || orientation === "auto") {
                return block
            }
            return {
                ...block,
                style: {
                    ...(block.style || {}),
                    orientation: defaultOrientation,
                },
            }
        })
    ), [defaultOrientation])

    // 自动迁移已下线的 Gemini 模型
    useEffect(() => {
        if (settings.provider !== "gemini") return
        const deprecatedModels = new Set([
            "gemini-2.5-flash-preview-05-20",
            "gemini-2.5-pro-preview-05-06",
            "gemini-2.0-flash-exp-image-generation",
            "gemini-2.0-flash",
            "gemini-1.5-pro",
        ])
        if (deprecatedModels.has(settings.model)) {
            updateSettings({ model: "gemini-2.5-flash-image" })
        }
    }, [settings.provider, settings.model, updateSettings])

    // 获取 Coin 余额
    const refreshCoins = useCallback(async () => {
        setCoinsLoading(true)
        try {
            const res = await fetch("/api/user/coins")
            if (res.ok) {
                const data = await res.json()
                setCoins(data.coins || 0)
            }
        } catch (error) {
            console.error("Failed to fetch coins:", error)
        } finally {
            setCoinsLoading(false)
        }
    }, [setCoins, setCoinsLoading])

    useEffect(() => {
        void refreshCoins()
    }, [refreshCoins])

    useEffect(() => {
        const handleFocusFind = (event: Event) => {
            const detail = (event as CustomEvent<{ global?: boolean }>).detail
            findInputRef.current?.focus()
            if (detail?.global) {
                toast.info(locale === "zh" ? "已定位到全局查找，请输入后点击“全局替换”" : "Global find ready. Type keyword then click Replace all.")
            }
        }

        window.addEventListener("mangalens:focus-find", handleFocusFind)
        return () => {
            window.removeEventListener("mangalens:focus-find", handleFocusFind)
        }
    }, [locale])

    // 处理文件上传
    const handleFileUpload = useCallback(async (files: FileList | null) => {
        if (!files) return

        const normalizeResult = await normalizeEditorImageFiles(Array.from(files))
        if (normalizeResult.files.length > 0) {
            addImages(normalizeResult.files)
        }

        if (normalizeResult.convertedCount > 0) {
            toast.success(
                locale === "zh"
                    ? `已将 ${normalizeResult.convertedCount} 个 TIFF/PSD 文件转换为 PNG`
                    : `Converted ${normalizeResult.convertedCount} TIFF/PSD files to PNG`
            )
        }

        if (normalizeResult.pdfExpandedPages > 0) {
            toast.success(
                locale === "zh"
                    ? `已拆分 ${normalizeResult.pdfSourceFiles} 个 PDF，共 ${normalizeResult.pdfExpandedPages} 页`
                    : `Expanded ${normalizeResult.pdfSourceFiles} PDF file(s) into ${normalizeResult.pdfExpandedPages} pages`
            )
        }

        if (normalizeResult.failed.length > 0) {
            const preview = normalizeResult.failed
                .slice(0, 2)
                .map((item) => `${item.fileName} (${item.reason})`)
                .join("; ")
            toast.warning(
                locale === "zh"
                    ? `有 ${normalizeResult.failed.length} 个文件未导入：${preview}`
                    : `${normalizeResult.failed.length} files were not imported: ${preview}`
            )
        }
    }, [addImages, locale])

    // 处理粘贴
    const handlePaste = useCallback(async () => {
        try {
            const clipboardItems = await navigator.clipboard.read()
            for (const item of clipboardItems) {
                const imageType = item.types.find((type) => type.startsWith("image/"))
                if (imageType) {
                    const blob = await item.getType(imageType)
                    // 使用明确的类型声明避免 TypeScript 类型问题
                    const options: FilePropertyBag = { type: imageType }
                    const file = new globalThis.File([blob], `paste-${Date.now()}.png`, options)
                    addImages([file])
                    return
                }
            }
        } catch (error) {
            console.error("Failed to read clipboard:", error)
        }
    }, [addImages])

    // 监听全局粘贴事件
    // useEffect(() => {
    //   const handleGlobalPaste = (e: ClipboardEvent) => {
    //     const files = e.clipboardData?.files
    //     if (files && files.length > 0) {
    //       handleFileUpload(files)
    //     }
    //   }
    //   document.addEventListener("paste", handleGlobalPaste)
    //   return () => document.removeEventListener("paste", handleGlobalPaste)
    // }, [handleFileUpload])

    const models = settings.provider === "gemini" ? GEMINI_MODELS : OPENAI_MODELS
    const canRunAutoDetect = settings.useServerApi || Boolean(settings.apiKey)
    const detectedBlocks = useMemo(() => currentImage?.detectedTextBlocks || [], [currentImage?.detectedTextBlocks])
    const selectedBlockSet = useMemo(() => new Set(selectedBlockIndexes), [selectedBlockIndexes])

    useEffect(() => {
        setSelectedBlockIndexes([])
        setBulkTextValue("")
    }, [currentImage?.id])

    useEffect(() => {
        if (!clearGalleryArmed) return
        const timer = window.setTimeout(() => setClearGalleryArmed(false), 1800)
        return () => window.clearTimeout(timer)
    }, [clearGalleryArmed])
    const getTargetLanguageForDetection = useCallback(() => {
        const direction = settings.translationDirection ?? "ja2zh"
        if (direction === "ja2en") return "English"
        if (direction === "en2ja") return "日本語"
        return "简体中文"
    }, [settings.translationDirection])

    const parseApiError = useCallback(async (res: Response, fallback: string) => {
        const data = await res.json().catch(() => ({}))
        return data?.error || `${fallback} (${res.status})`
    }, [])

    const buildDetectPayloadCandidates = useCallback(async (imageData: string) => {
        if (imageData.length <= SAFE_DETECT_PAYLOAD_CHARS) {
            return [imageData]
        }

        const source = await loadImage(imageData)
        const variants: Array<{ maxLongEdge: number; quality: number; mimeType: "image/jpeg" | "image/png" }> = [
            { maxLongEdge: 3072, quality: 0.9, mimeType: "image/jpeg" },
            { maxLongEdge: 2560, quality: 0.86, mimeType: "image/jpeg" },
            { maxLongEdge: 2048, quality: 0.82, mimeType: "image/jpeg" },
            { maxLongEdge: 1600, quality: 0.78, mimeType: "image/jpeg" },
            { maxLongEdge: 1280, quality: 0.74, mimeType: "image/jpeg" },
            { maxLongEdge: 1024, quality: 0.7, mimeType: "image/jpeg" },
        ]
        const candidates: string[] = [imageData]
        const dedupe = new Set<string>([`${imageData.length}:${imageData.slice(0, 64)}`])

        for (const variant of variants) {
            const scale = Math.min(1, variant.maxLongEdge / Math.max(source.width, source.height))
            const width = Math.max(1, Math.round(source.width * scale))
            const height = Math.max(1, Math.round(source.height * scale))
            const canvas = document.createElement("canvas")
            const ctx = canvas.getContext("2d")
            if (!ctx) continue
            canvas.width = width
            canvas.height = height
            ctx.drawImage(source, 0, 0, width, height)
            const compressed = canvas.toDataURL(variant.mimeType, variant.quality)
            const key = `${compressed.length}:${compressed.slice(0, 64)}`
            if (!dedupe.has(key)) {
                dedupe.add(key)
                candidates.push(compressed)
            }
            if (compressed.length <= SAFE_DETECT_PAYLOAD_CHARS) {
                break
            }
        }

        return candidates
    }, [SAFE_DETECT_PAYLOAD_CHARS])

    const runAutoDetect = useCallback(async (
        imageData: string,
        imageWidth?: number,
        imageHeight?: number
    ): Promise<DetectTextResponse> => {
        const tryServerDetect = async () => {
            const candidates = await buildDetectPayloadCandidates(imageData)
            let lastError = locale === "zh" ? "网站 API 文本检测失败" : "Server text detection failed"

            for (let i = 0; i < candidates.length; i++) {
                const payload = candidates[i]
                const res = await fetch("/api/ai/detect-text", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        imageData: payload,
                        targetLanguage: getTargetLanguageForDetection(),
                        imageWidth,
                        imageHeight,
                        preferComicDetector: true,
                    }),
                })

                if (!res.ok) {
                    const parsedError = await parseApiError(
                        res,
                        locale === "zh" ? "网站 API 文本检测失败" : "Server text detection failed"
                    )
                    lastError = parsedError
                    const canRetryWithSmallerPayload = res.status === 413 && i < candidates.length - 1
                    if (canRetryWithSmallerPayload) {
                        continue
                    }
                    throw new Error(parsedError)
                }

                const data = await res.json()
                return {
                    success: true,
                    blocks: data.blocks || [],
                } as DetectTextResponse
            }

            throw new Error(lastError)
        }

        if (settings.useServerApi) {
            return tryServerDetect()
        }

        // 非网站 API 模式下，也尝试优先使用后台配置的 comic-text-detector。
        try {
            const serverResult = await tryServerDetect()
            if (serverResult.success && serverResult.blocks.length > 0) {
                return serverResult
            }
        } catch {
            // Fallback to user-provided model key.
        }

        return detectTextBlocks({
                imageData,
                config: {
                provider: settings.provider,
                apiKey: settings.apiKey,
                baseUrl: settings.baseUrl,
                model: settings.model,
                imageSize: settings.imageSize || "2K",
                },
                targetLanguage: getTargetLanguageForDetection(),
            })
    }, [
        buildDetectPayloadCandidates,
        getTargetLanguageForDetection,
        locale,
        parseApiError,
        settings.apiKey,
        settings.baseUrl,
        settings.imageSize,
        settings.model,
        settings.provider,
        settings.useServerApi,
    ])

    const handleAutoDetectText = useCallback(async () => {
        if (!currentImage) {
            toast.error(locale === "zh" ? "请先选择图片" : "Please select an image first")
            return
        }
        if (!canRunAutoDetect) {
            toast.error(
                locale === "zh"
                    ? "自动检测需要填写 API Key 或启用网站 API"
                    : "Auto-detection requires API key or server API"
            )
            return
        }

        setIsAutoDetecting(true)
        try {
            const image = await loadImage(currentImage.originalUrl)
            const imageData = imageToDataUrl(image)

            const result = await runAutoDetect(imageData, image.width, image.height)

            if (!result.success) {
                throw new Error(result.error || (locale === "zh" ? "自动识别失败" : "Auto detection failed"))
            }

            const detectedSelections = result.blocks
                .map((block, index) => {
                    const x = Math.max(0, Math.round(block.bbox.x * image.width))
                    const y = Math.max(0, Math.round(block.bbox.y * image.height))
                    const width = Math.max(12, Math.round(block.bbox.width * image.width))
                    const height = Math.max(12, Math.round(block.bbox.height * image.height))
                    return {
                        id: `auto-${Date.now()}-${index}`,
                        x: Math.min(x, Math.max(0, image.width - 1)),
                        y: Math.min(y, Math.max(0, image.height - 1)),
                        width: Math.min(width, Math.max(1, image.width - x)),
                        height: Math.min(height, Math.max(1, image.height - y)),
                    }
                })
                .filter((selection) => selection.width > 4 && selection.height > 4)

            if (!detectedSelections.length) {
                clearDetectedTextBlocks(currentImage.id)
                toast.warning(locale === "zh" ? "未检测到可用文本区域" : "No text regions detected")
                return
            }

            updateSelections(currentImage.id, detectedSelections)
            setDetectedTextBlocks(currentImage.id, applyDefaultOrientationToBlocks(result.blocks))
            toast.success(
                locale === "zh"
                    ? `已自动创建 ${detectedSelections.length} 个选区`
                    : `${detectedSelections.length} selections created automatically`
            )
        } catch (error) {
            const message = error instanceof Error ? error.message : (locale === "zh" ? "自动识别失败" : "Auto detection failed")
            toast.error(message)
        } finally {
            setIsAutoDetecting(false)
        }
    }, [
        canRunAutoDetect,
        clearDetectedTextBlocks,
        currentImage,
        locale,
        setDetectedTextBlocks,
        runAutoDetect,
        applyDefaultOrientationToBlocks,
        updateSelections,
    ])

    const parseManualJsonBlocks = useCallback((raw: string) => {
        const text = raw.trim()
        if (!text) return []

        const parseText = (input: string): unknown => {
            try {
                return JSON.parse(input)
            } catch {
                const codeBlock = input.match(/```(?:json)?\s*([\s\S]*?)```/i)
                if (codeBlock?.[1]) {
                    return JSON.parse(codeBlock[1].trim())
                }
                throw new Error(locale === "zh" ? "JSON 格式错误" : "Invalid JSON format")
            }
        }

        const parsed = parseText(text) as unknown
        const rawBlocks = Array.isArray(parsed)
            ? parsed
            : (
                parsed &&
                typeof parsed === "object" &&
                Array.isArray((parsed as { blocks?: unknown[] }).blocks)
            )
                ? ((parsed as { blocks: unknown[] }).blocks)
                : []

        const toNumber = (value: unknown) => {
            if (typeof value === "number" && Number.isFinite(value)) return value
            if (typeof value === "string" && value.trim()) {
                const parsedNumber = Number(value)
                if (Number.isFinite(parsedNumber)) return parsedNumber
            }
            return null
        }

        const clamp = (value: number) => Math.max(0, Math.min(1, value))

        return rawBlocks.flatMap((item) => {
            if (!item || typeof item !== "object") return []
            const block = item as Record<string, unknown>
            const bboxRaw = (block.bbox || block.box || block.position) as Record<string, unknown> | undefined
            if (!bboxRaw) return []

            const x = toNumber(bboxRaw.x ?? bboxRaw.left)
            const y = toNumber(bboxRaw.y ?? bboxRaw.top)
            const width = toNumber(bboxRaw.width ?? bboxRaw.w)
            const height = toNumber(bboxRaw.height ?? bboxRaw.h)
            if (x === null || y === null || width === null || height === null) return []
            if (width <= 0 || height <= 0) return []

            const styleRaw = (block.style || block.styleHints || block.layout) as Record<string, unknown> | undefined
            const lines = Array.isArray(block.lines)
                ? block.lines.map((line) => String(line ?? "").trim()).filter(Boolean)
                : []
            const segmentRaw = Array.isArray(block.segments) ? block.segments : []
            const segments = segmentRaw.flatMap((segment) => {
                if (!segment || typeof segment !== "object") return []
                const s = segment as Record<string, unknown>
                const sx = toNumber(s.x ?? s.left)
                const sy = toNumber(s.y ?? s.top)
                const sw = toNumber(s.width ?? s.w)
                const sh = toNumber(s.height ?? s.h)
                if (sx === null || sy === null || sw === null || sh === null || sw <= 0 || sh <= 0) return []
                return [{
                    x: clamp(sx),
                    y: clamp(sy),
                    width: clamp(sw),
                    height: clamp(sh),
                }]
            })

            return [{
                sourceText: String(block.sourceText ?? block.source_text ?? block.text ?? "").trim(),
                translatedText: String(block.translatedText ?? block.translated_text ?? block.translation ?? "").trim(),
                richTextHtml: String(block.richTextHtml ?? block.rich_text_html ?? block.translatedText ?? block.translated_text ?? block.translation ?? "").trim() || undefined,
                bbox: {
                    x: clamp(x),
                    y: clamp(y),
                    width: clamp(width),
                    height: clamp(height),
                },
                sourceLanguage: String(block.sourceLanguage ?? block.source_language ?? block.lang ?? "").trim() || undefined,
                lines: lines.length ? lines : undefined,
                segments: segments.length ? segments : undefined,
                style: styleRaw
                    ? {
                        textColor: typeof styleRaw.textColor === "string" ? styleRaw.textColor : (typeof styleRaw.color === "string" ? styleRaw.color : undefined),
                        outlineColor: typeof styleRaw.outlineColor === "string" ? styleRaw.outlineColor : (typeof styleRaw.strokeColor === "string" ? styleRaw.strokeColor : undefined),
                        strokeColor: typeof styleRaw.strokeColor === "string" ? styleRaw.strokeColor : (typeof styleRaw.outlineColor === "string" ? styleRaw.outlineColor : undefined),
                        strokeWidth: toNumber(styleRaw.strokeWidth ?? styleRaw.stroke_width) ?? undefined,
                        textOpacity: toNumber(styleRaw.textOpacity ?? styleRaw.opacity) ?? undefined,
                        fontFamily: typeof styleRaw.fontFamily === "string" ? styleRaw.fontFamily : undefined,
                        angle: toNumber(styleRaw.angle ?? styleRaw.rotation) ?? undefined,
                        orientation: typeof styleRaw.orientation === "string"
                            ? styleRaw.orientation as "vertical" | "horizontal" | "auto"
                            : defaultOrientation,
                        alignment: typeof styleRaw.alignment === "string" ? styleRaw.alignment as "start" | "center" | "end" | "justify" | "auto" : undefined,
                        fontWeight: typeof styleRaw.fontWeight === "string" ? styleRaw.fontWeight : undefined,
                    }
                    : { orientation: defaultOrientation },
            }]
        })
    }, [defaultOrientation, locale])

    const blocksToSelections = useCallback((
        blocks: Array<{ bbox: { x: number; y: number; width: number; height: number } }>,
        imageWidth: number,
        imageHeight: number,
        idPrefix: string
    ): Selection[] => {
        return blocks
            .map((block, index) => {
                const x = Math.max(0, Math.round(block.bbox.x * imageWidth))
                const y = Math.max(0, Math.round(block.bbox.y * imageHeight))
                const width = Math.max(12, Math.round(block.bbox.width * imageWidth))
                const height = Math.max(12, Math.round(block.bbox.height * imageHeight))
                return {
                    id: `${idPrefix}-${index}`,
                    x: Math.min(x, Math.max(0, imageWidth - 1)),
                    y: Math.min(y, Math.max(0, imageHeight - 1)),
                    width: Math.min(width, Math.max(1, imageWidth - x)),
                    height: Math.min(height, Math.max(1, imageHeight - y)),
                }
            })
            .filter((selection) => selection.width > 4 && selection.height > 4)
    }, [])

    const normalizeSelectionsFromPayload = useCallback((
        rawSelections: unknown[],
        imageWidth: number,
        imageHeight: number,
        idPrefix: string
    ): Selection[] => {
        const toNumber = (value: unknown) => {
            if (typeof value === "number" && Number.isFinite(value)) return value
            if (typeof value === "string" && value.trim()) {
                const parsedNumber = Number(value)
                if (Number.isFinite(parsedNumber)) return parsedNumber
            }
            return null
        }

        return rawSelections.flatMap((item, index) => {
            if (!item || typeof item !== "object") return []
            const record = item as Record<string, unknown>
            const rawX = toNumber(record.x ?? record.left)
            const rawY = toNumber(record.y ?? record.top)
            const rawW = toNumber(record.width ?? record.w)
            const rawH = toNumber(record.height ?? record.h)
            if (rawX === null || rawY === null || rawW === null || rawH === null) return []
            if (rawW <= 0 || rawH <= 0) return []

            const useNormalized =
                rawX >= 0 && rawX <= 1 &&
                rawY >= 0 && rawY <= 1 &&
                rawW > 0 && rawW <= 1 &&
                rawH > 0 && rawH <= 1

            const absX = useNormalized ? Math.round(rawX * imageWidth) : Math.round(rawX)
            const absY = useNormalized ? Math.round(rawY * imageHeight) : Math.round(rawY)
            const absW = useNormalized ? Math.round(rawW * imageWidth) : Math.round(rawW)
            const absH = useNormalized ? Math.round(rawH * imageHeight) : Math.round(rawH)

            const x = Math.max(0, Math.min(imageWidth - 1, absX))
            const y = Math.max(0, Math.min(imageHeight - 1, absY))
            const width = Math.max(4, Math.min(imageWidth - x, absW))
            const height = Math.max(4, Math.min(imageHeight - y, absH))

            if (width <= 0 || height <= 0) return []
            return [{
                id: `${idPrefix}-${index}`,
                x,
                y,
                width,
                height,
            }]
        })
    }, [])

    const parseBlocksFromSidecarPayload = useCallback((payload: unknown) => {
        if (!payload || typeof payload !== "object") return []
        const obj = payload as Record<string, unknown>
        const rawBlocks = Array.isArray(obj.detectedTextBlocks)
            ? obj.detectedTextBlocks
            : (Array.isArray(obj.blocks) ? obj.blocks : [])
        if (!rawBlocks.length) return []
        return applyDefaultOrientationToBlocks(
            parseManualJsonBlocks(JSON.stringify({ blocks: rawBlocks }))
        )
    }, [applyDefaultOrientationToBlocks, parseManualJsonBlocks])

    const buildSidecarPreviewTexts = useCallback((
        blocks: Array<{
            sourceText: string
            translatedText: string
            richTextHtml?: string
        }>
    ) => {
        return blocks
            .flatMap((block) => {
                const sourceText = block.sourceText.trim()
                const translatedFromRich = block.richTextHtml
                    ? richHtmlToPlainText(block.richTextHtml)
                    : ""
                const translatedText = (block.translatedText || translatedFromRich).trim()
                if (!sourceText && !translatedText) return []
                return [{ sourceText, translatedText }]
            })
            .slice(0, 3)
    }, [])

    const parseSidecarJsonFile = useCallback(async (file: File) => {
        const payload = JSON.parse(await file.text()) as Record<string, unknown>
        const blocks = parseBlocksFromSidecarPayload(payload)
        const selectionCount = Array.isArray(payload.selections) ? payload.selections.length : 0
        if (!blocks.length && selectionCount === 0) {
            throw new Error(locale === "zh" ? "Sidecar JSON 中没有可恢复的数据" : "No restorable content found in Sidecar JSON")
        }

        return {
            kind: "json" as const,
            sourceFileName: file.name,
            payload,
            blockCount: blocks.length,
            selectionCount,
            hasPrompt: typeof payload.prompt === "string" && payload.prompt.trim().length > 0,
        }
    }, [locale, parseBlocksFromSidecarPayload])

    const buildSidecarZipRestoreRecords = useCallback(async (file: File) => {
        const JSZip = (await import("jszip")).default
        const zip = await JSZip.loadAsync(file)
        const zipEntries = Object.values(zip.files).filter((entry) => !entry.dir)

        const normalizePath = (input: string) =>
            input.replace(/^\/+/, "").replace(/\\/g, "/").toLowerCase()
        const extractFileName = (input: string) => {
            const normalized = input.replace(/\\/g, "/")
            const parts = normalized.split("/")
            return parts[parts.length - 1]
        }
        const findZipEntry = (pathOrName?: string | null): (typeof zipEntries[number] | null) => {
            if (!pathOrName) return null
            const normalized = normalizePath(pathOrName)
            const exact = zipEntries.find((entry) => normalizePath(entry.name) === normalized)
            if (exact) return exact
            return zipEntries.find((entry) => normalizePath(entry.name).endsWith(`/${normalized}`)) ?? null
        }

        type ManifestRecord = { image?: string; sidecar?: string }
        const manifestEntry = zip.file(/(^|\/)manifest\.json$/i)?.[0]
        let manifestRecords: ManifestRecord[] = []
        if (manifestEntry) {
            try {
                const manifest = JSON.parse(await manifestEntry.async("string")) as { files?: ManifestRecord[] }
                if (Array.isArray(manifest.files)) {
                    manifestRecords = manifest.files
                }
            } catch {
                // ignore invalid manifest and fallback to scanning sidecars
            }
        }

        const sidecarCandidates: Array<{ sidecarPath: string; imagePath?: string }> = []
        if (manifestRecords.length) {
            for (const record of manifestRecords) {
                if (typeof record.sidecar === "string" && record.sidecar.trim()) {
                    sidecarCandidates.push({
                        sidecarPath: record.sidecar,
                        imagePath: typeof record.image === "string" ? record.image : undefined,
                    })
                }
            }
        }
        if (!sidecarCandidates.length) {
            zip.file(/\.sidecar\.json$/i).forEach((entry) => {
                sidecarCandidates.push({ sidecarPath: entry.name })
            })
        }

        if (!sidecarCandidates.length) {
            throw new Error(locale === "zh" ? "ZIP 中未找到 sidecar 文件" : "No sidecar files found in ZIP")
        }

        const restoreRecords: SidecarZipRestoreRecord[] = []
        const skippedItems: string[] = []
        for (const candidate of sidecarCandidates) {
            const sidecarEntry = findZipEntry(candidate.sidecarPath)
            if (!sidecarEntry) {
                skippedItems.push(candidate.sidecarPath)
                continue
            }

            let payload: Record<string, unknown>
            try {
                payload = JSON.parse(await sidecarEntry.async("string")) as Record<string, unknown>
            } catch {
                skippedItems.push(sidecarEntry.name)
                continue
            }

            const baseName = extractFileName(sidecarEntry.name).replace(/\.sidecar\.json$/i, "")
            const candidates = [
                candidate.imagePath,
                typeof payload.exportImageName === "string" ? payload.exportImageName : undefined,
                `${baseName}.png`,
                `${baseName}.jpg`,
                `${baseName}.jpeg`,
                `${baseName}.webp`,
            ].filter((value): value is string => Boolean(value && value.trim()))

            let imageEntry = null as (typeof zipEntries[number] | null)
            for (const imagePath of candidates) {
                imageEntry = findZipEntry(imagePath)
                if (imageEntry) break
            }

            if (!imageEntry) {
                skippedItems.push(sidecarEntry.name)
                continue
            }

            const imageBlob = await imageEntry.async("blob")
            const imageName = extractFileName(imageEntry.name)
            const imageType = imageBlob.type || "image/png"
            const imageFile = new globalThis.File([imageBlob], imageName, {
                type: imageType,
                lastModified: Date.now(),
            })
            restoreRecords.push({ file: imageFile, payload })
        }

        if (!restoreRecords.length) {
            throw new Error(locale === "zh" ? "没有可恢复的图片与 sidecar 对应关系" : "No restorable image/sidecar pairs found")
        }

        return { restoreRecords, skippedItems }
    }, [locale])

    const restoreSidecarJsonPayload = useCallback(async (payload: Record<string, unknown>) => {
        if (!currentImage) {
            throw new Error(locale === "zh" ? "请先选择图片，再导入 Sidecar JSON" : "Select an image before importing Sidecar JSON")
        }

        const blocks = parseBlocksFromSidecarPayload(payload)
        const image = await loadImage(currentImage.originalUrl)
        const rawSelections = Array.isArray(payload.selections) ? payload.selections : []
        let selections = normalizeSelectionsFromPayload(rawSelections, image.width, image.height, `sidecar-json-${Date.now()}`)
        if (!selections.length && blocks.length) {
            selections = blocksToSelections(blocks, image.width, image.height, `sidecar-json-block-${Date.now()}`)
        }

        if (!blocks.length && !selections.length) {
            throw new Error(locale === "zh" ? "Sidecar JSON 中没有可恢复的数据" : "No restorable content found in Sidecar JSON")
        }

        if (blocks.length) {
            setDetectedTextBlocks(currentImage.id, blocks)
        }
        if (selections.length) {
            updateSelections(currentImage.id, selections)
        }
        const promptApplied = typeof payload.prompt === "string" && payload.prompt.trim().length > 0
        if (promptApplied) {
            setPrompt(String(payload.prompt).trim())
        }

        return {
            blockCount: blocks.length,
            selectionCount: selections.length,
            promptApplied,
        }
    }, [
        blocksToSelections,
        currentImage,
        locale,
        normalizeSelectionsFromPayload,
        parseBlocksFromSidecarPayload,
        setDetectedTextBlocks,
        setPrompt,
        updateSelections,
    ])

    const restoreSidecarZipRecords = useCallback(async (
        restoreRecords: SidecarZipRestoreRecord[],
        baseSkippedItems: string[]
    ) => {
        addImages(restoreRecords.map((record) => record.file))
        const stateAfterImport = useEditorStore.getState()
        const imageByFile = new Map(
            stateAfterImport.images.map((img) => [img.file, { id: img.id, originalUrl: img.originalUrl }])
        )

        const skippedItems = [...baseSkippedItems]
        let restoredImageCount = 0
        let restoredSelectionCount = 0
        let restoredBlockCount = 0
        let restoredPromptCount = 0
        let firstImportedImageId: string | null = null

        for (const [index, record] of restoreRecords.entries()) {
            const target = imageByFile.get(record.file)
            if (!target) {
                skippedItems.push(record.file.name)
                continue
            }
            if (!firstImportedImageId) {
                firstImportedImageId = target.id
            }

            const image = await loadImage(target.originalUrl)
            const blocks = parseBlocksFromSidecarPayload(record.payload)
            const rawSelections = Array.isArray(record.payload.selections) ? record.payload.selections : []
            let selections = normalizeSelectionsFromPayload(
                rawSelections,
                image.width,
                image.height,
                `sidecar-zip-${Date.now()}-${index}`
            )
            if (!selections.length && blocks.length) {
                selections = blocksToSelections(
                    blocks,
                    image.width,
                    image.height,
                    `sidecar-zip-block-${Date.now()}-${index}`
                )
            }

            if (blocks.length) {
                setDetectedTextBlocks(target.id, blocks)
                restoredBlockCount += blocks.length
            }
            if (selections.length) {
                updateSelections(target.id, selections)
                restoredSelectionCount += selections.length
            }
            if (typeof record.payload.prompt === "string" && record.payload.prompt.trim()) {
                if (restoredPromptCount === 0) {
                    setPrompt(record.payload.prompt.trim())
                }
                restoredPromptCount += 1
            }
            restoredImageCount += 1
        }

        if (firstImportedImageId) {
            setCurrentImage(firstImportedImageId)
        }

        return {
            restoredImageCount,
            restoredSelectionCount,
            restoredBlockCount,
            restoredPromptCount,
            skippedItems,
        }
    }, [
        addImages,
        blocksToSelections,
        normalizeSelectionsFromPayload,
        parseBlocksFromSidecarPayload,
        setCurrentImage,
        setDetectedTextBlocks,
        setPrompt,
        updateSelections,
    ])

    const prepareSidecarImportPlan = useCallback(async (file: File): Promise<SidecarImportPlan> => {
        const name = file.name.toLowerCase()
        if (name.endsWith(".zip")) {
            const { restoreRecords, skippedItems } = await buildSidecarZipRestoreRecords(file)
            let blockCount = 0
            let selectionCount = 0
            let promptCount = 0
            const previewDetails: SidecarPreviewDetail[] = []

            for (const record of restoreRecords) {
                const blocks = parseBlocksFromSidecarPayload(record.payload)
                const pageSelectionCount = Array.isArray(record.payload.selections)
                    ? record.payload.selections.length
                    : 0
                const hasPrompt = typeof record.payload.prompt === "string" && record.payload.prompt.trim().length > 0
                previewDetails.push({
                    fileName: record.file.name,
                    blockCount: blocks.length,
                    selectionCount: pageSelectionCount,
                    hasPrompt,
                    previewTexts: buildSidecarPreviewTexts(blocks),
                })
                blockCount += blocks.length
                selectionCount += pageSelectionCount
                if (hasPrompt) promptCount += 1
            }

            return {
                kind: "zip",
                sourceFileName: file.name,
                restoreRecords,
                skippedItems,
                imageCount: restoreRecords.length,
                blockCount,
                selectionCount,
                promptCount,
                previewDetails,
            }
        }
        const parsedJson = await parseSidecarJsonFile(file)
        const jsonBlocks = parseBlocksFromSidecarPayload(parsedJson.payload)
        return {
            ...parsedJson,
            previewDetails: [{
                fileName: currentImage?.file.name || (locale === "zh" ? "当前选中图片" : "Selected image"),
                blockCount: parsedJson.blockCount,
                selectionCount: parsedJson.selectionCount,
                hasPrompt: parsedJson.hasPrompt,
                previewTexts: buildSidecarPreviewTexts(jsonBlocks),
            }],
        }
    }, [buildSidecarPreviewTexts, buildSidecarZipRestoreRecords, currentImage?.file.name, locale, parseBlocksFromSidecarPayload, parseSidecarJsonFile])

    const handleConfirmSidecarImport = useCallback(async () => {
        if (!sidecarImportPlan) return
        setIsApplyingSidecarImport(true)
        try {
            if (sidecarImportPlan.kind === "json") {
                const result = await restoreSidecarJsonPayload(sidecarImportPlan.payload)
                toast.success(
                    locale === "zh"
                        ? `已恢复 ${result.blockCount} 个文本块、${result.selectionCount} 个选区`
                        : `Restored ${result.blockCount} text blocks and ${result.selectionCount} selections`
                )
            } else {
                const result = await restoreSidecarZipRecords(
                    sidecarImportPlan.restoreRecords,
                    sidecarImportPlan.skippedItems
                )
                toast.success(
                    locale === "zh"
                        ? `已恢复 ${result.restoredImageCount} 张图片，${result.restoredSelectionCount} 个选区，${result.restoredBlockCount} 个文本块`
                        : `Restored ${result.restoredImageCount} images, ${result.restoredSelectionCount} selections, ${result.restoredBlockCount} text blocks`
                )
                if (result.skippedItems.length > 0) {
                    const preview = result.skippedItems.slice(0, 2).join(", ")
                    toast.warning(
                        locale === "zh"
                            ? `有 ${result.skippedItems.length} 项未恢复：${preview}`
                            : `${result.skippedItems.length} items were skipped: ${preview}`
                    )
                }
            }
            setSidecarPreviewOpen(false)
            setSidecarImportPlan(null)
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : (locale === "zh" ? "Sidecar 导入失败" : "Sidecar import failed")
            )
        } finally {
            setIsApplyingSidecarImport(false)
        }
    }, [locale, restoreSidecarJsonPayload, restoreSidecarZipRecords, sidecarImportPlan])

    const handleImportSidecar = useCallback(async (file: File) => {
        setSidecarPreviewOpen(false)
        setSidecarImportPlan(null)
        setIsPreparingSidecarImport(true)
        try {
            const plan = await prepareSidecarImportPlan(file)
            setSidecarImportPlan(plan)
            setSidecarPreviewOpen(true)
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : (locale === "zh" ? "Sidecar 文件解析失败" : "Failed to parse Sidecar file")
            )
        } finally {
            setIsPreparingSidecarImport(false)
        }
    }, [locale, prepareSidecarImportPlan])

    const handleSidecarPreviewOpenChange = useCallback((open: boolean) => {
        if (isApplyingSidecarImport) return
        setSidecarPreviewOpen(open)
        if (!open) {
            setSidecarImportPlan(null)
        }
    }, [isApplyingSidecarImport])

    const handleCopyManualJsonPrompt = useCallback(async () => {
        const targetLanguage = getTargetLanguageForDetection()
        const manualPrompt = [
            locale === "zh"
                ? `请识别图片中的漫画文本并翻译为${targetLanguage}，按 JSON 返回：`
                : `Please detect manga text and translate to ${targetLanguage}, return JSON:`,
            '{"blocks":[{"sourceText":"原文","translatedText":"译文","bbox":{"x":0.1,"y":0.2,"width":0.3,"height":0.15}}]}',
            locale === "zh"
                ? "要求：bbox 使用 0-1 归一化坐标；只返回 JSON，不要 markdown。"
                : "Rules: bbox must be normalized (0-1). Return JSON only, no markdown.",
        ].join("\n")

        try {
            await navigator.clipboard.writeText(manualPrompt)
            toast.success(locale === "zh" ? "已复制提示词" : "Prompt copied")
        } catch {
            toast.error(locale === "zh" ? "复制失败，请手动复制" : "Copy failed, please copy manually")
        }
    }, [getTargetLanguageForDetection, locale])

    const handleImportManualJson = useCallback(async () => {
        if (!currentImage) {
            toast.error(locale === "zh" ? "请先选择图片" : "Please select an image first")
            return
        }
        try {
            const blocks = parseManualJsonBlocks(manualJsonInput)
            if (!blocks.length) {
                throw new Error(locale === "zh" ? "未解析到有效文本框" : "No valid text blocks parsed")
            }

            const image = await loadImage(currentImage.originalUrl)
            const selections = blocks.map((block, index) => {
                const x = Math.max(0, Math.round(block.bbox.x * image.width))
                const y = Math.max(0, Math.round(block.bbox.y * image.height))
                const width = Math.max(12, Math.round(block.bbox.width * image.width))
                const height = Math.max(12, Math.round(block.bbox.height * image.height))
                return {
                    id: `json-${Date.now()}-${index}`,
                    x: Math.min(x, Math.max(0, image.width - 1)),
                    y: Math.min(y, Math.max(0, image.height - 1)),
                    width: Math.min(width, Math.max(1, image.width - x)),
                    height: Math.min(height, Math.max(1, image.height - y)),
                }
            })

            updateSelections(currentImage.id, selections)
            setDetectedTextBlocks(currentImage.id, blocks)
            setManualJsonOpen(false)
            setManualJsonInput("")
            toast.success(
                locale === "zh"
                    ? `已导入 ${selections.length} 个选区`
                    : `Imported ${selections.length} selections`
            )
        } catch (error) {
            const message = error instanceof Error ? error.message : (locale === "zh" ? "JSON 导入失败" : "JSON import failed")
            toast.error(message)
        }
    }, [currentImage, locale, manualJsonInput, parseManualJsonBlocks, setDetectedTextBlocks, updateSelections])

    const handleDetectedTextEdit = useCallback((index: number, richTextHtml: string) => {
        if (!currentImage) return
        const nextBlocks = [...(currentImage.detectedTextBlocks || [])]
        if (!nextBlocks[index]) return
        const normalizedHtml = richTextHtml.trim()
        nextBlocks[index] = {
            ...nextBlocks[index],
            translatedText: richHtmlToPlainText(normalizedHtml),
            richTextHtml: normalizedHtml,
        }
        setDetectedTextBlocks(currentImage.id, nextBlocks)
    }, [currentImage, setDetectedTextBlocks])

    const toggleBlockSelection = useCallback((index: number, checked: boolean) => {
        setSelectedBlockIndexes((prev) => {
            if (checked) {
                return prev.includes(index) ? prev : [...prev, index]
            }
            return prev.filter((item) => item !== index)
        })
    }, [])

    const handleSelectAllBlocks = useCallback(() => {
        setSelectedBlockIndexes(detectedBlocks.map((_, index) => index))
    }, [detectedBlocks])

    const handleClearBlockSelection = useCallback(() => {
        setSelectedBlockIndexes([])
    }, [])

    const handleApplyBulkText = useCallback(() => {
        if (!currentImage) return
        if (!selectedBlockIndexes.length) {
            toast.warning(locale === "zh" ? "请先选择文本块" : "Select text blocks first")
            return
        }
        if (!bulkTextValue.trim()) {
            toast.warning(locale === "zh" ? "请输入批量文本" : "Enter bulk text")
            return
        }

        const richHtml = bulkTextValue
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\n/g, "<br/>")

        const selectedSet = new Set(selectedBlockIndexes)
        const nextBlocks = (currentImage.detectedTextBlocks || []).map((block, index) =>
            selectedSet.has(index)
                ? {
                    ...block,
                    translatedText: bulkTextValue,
                    richTextHtml: richHtml,
                }
                : block
        )
        setDetectedTextBlocks(currentImage.id, nextBlocks)
        toast.success(
            locale === "zh"
                ? `已将同一文本应用到 ${selectedSet.size} 个文本块`
                : `Applied same text to ${selectedSet.size} blocks`
        )
    }, [bulkTextValue, currentImage, locale, selectedBlockIndexes, setDetectedTextBlocks])

    const handlePasteClipboardToSelected = useCallback(async () => {
        if (!navigator.clipboard) {
            toast.error(locale === "zh" ? "当前浏览器不支持剪贴板读取" : "Clipboard read is not supported")
            return
        }
        try {
            const text = await navigator.clipboard.readText()
            if (!text.trim()) {
                toast.warning(locale === "zh" ? "剪贴板为空" : "Clipboard is empty")
                return
            }
            setBulkTextValue(text)
            const selectedSet = new Set(selectedBlockIndexes)
            if (currentImage && selectedSet.size) {
                const richHtml = text
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/\n/g, "<br/>")
                const nextBlocks = (currentImage.detectedTextBlocks || []).map((block, index) =>
                    selectedSet.has(index)
                        ? {
                            ...block,
                            translatedText: text,
                            richTextHtml: richHtml,
                        }
                        : block
                )
                setDetectedTextBlocks(currentImage.id, nextBlocks)
                toast.success(
                    locale === "zh"
                        ? `已粘贴并应用到 ${selectedSet.size} 个文本块`
                        : `Pasted and applied to ${selectedSet.size} blocks`
                )
                return
            }
            toast.success(locale === "zh" ? "已粘贴到批量文本输入框" : "Pasted into bulk text input")
        } catch (error) {
            toast.error(error instanceof Error ? error.message : (locale === "zh" ? "读取剪贴板失败" : "Failed to read clipboard"))
        }
    }, [currentImage, locale, selectedBlockIndexes, setDetectedTextBlocks])

    const handleCopySelectedBlocks = useCallback(() => {
        if (!currentImage) return
        const selectedSet = new Set(selectedBlockIndexes)
        const blocks = (currentImage.detectedTextBlocks || [])
            .filter((_, index) => selectedSet.has(index))
            .map((block) => ({
                sourceText: block.sourceText,
                translatedText: block.translatedText,
                richTextHtml: block.richTextHtml,
                bbox: { ...block.bbox },
                style: block.style ? { ...block.style } as Record<string, unknown> : undefined,
            }))

        if (!blocks.length) {
            toast.warning(locale === "zh" ? "请先选择要复制的文本块" : "Select blocks to copy first")
            return
        }
        setCopiedBlocks(blocks)
        toast.success(
            locale === "zh"
                ? `已复制 ${blocks.length} 个文本块`
                : `Copied ${blocks.length} text blocks`
        )
    }, [currentImage, locale, selectedBlockIndexes])

    const handlePasteCopiedBlocksSideBySide = useCallback(async () => {
        if (!currentImage) return
        if (!copiedBlocks.length) {
            toast.warning(locale === "zh" ? "请先复制文本块" : "Copy blocks first")
            return
        }

        const image = await loadImage(currentImage.originalUrl)
        const existing = currentImage.detectedTextBlocks || []
        const maxRight = existing.reduce((max, block) => Math.max(max, block.bbox.x + block.bbox.width), 0)
        const minX = Math.min(...copiedBlocks.map((block) => block.bbox.x))
        const minY = Math.min(...copiedBlocks.map((block) => block.bbox.y))
        const maxX = Math.max(...copiedBlocks.map((block) => block.bbox.x + block.bbox.width))
        const widthSpan = maxX - minX
        const targetStartX = Math.min(0.98 - widthSpan, Math.max(0.02, maxRight + 0.02))

        const appendedBlocks = copiedBlocks.map((block) => {
            const rawX = targetStartX + (block.bbox.x - minX)
            const rawY = minY + (block.bbox.y - minY)
            const x = Math.max(0, Math.min(1 - block.bbox.width, rawX))
            const y = Math.max(0, Math.min(1 - block.bbox.height, rawY))
            return {
                ...block,
                sourceText: block.sourceText,
                translatedText: block.translatedText,
                richTextHtml: block.richTextHtml || block.translatedText,
                style: block.style as never,
                bbox: {
                    x,
                    y,
                    width: block.bbox.width,
                    height: block.bbox.height,
                },
            }
        })

        const nextBlocks = [...existing, ...appendedBlocks]
        setDetectedTextBlocks(currentImage.id, nextBlocks)

        const baseSelections = currentImage.selections || []
        const newSelections = appendedBlocks.map((block, index) => {
            const x = Math.max(0, Math.round(block.bbox.x * image.width))
            const y = Math.max(0, Math.round(block.bbox.y * image.height))
            const width = Math.max(12, Math.round(block.bbox.width * image.width))
            const height = Math.max(12, Math.round(block.bbox.height * image.height))
            return {
                id: `paste-block-${Date.now()}-${index}`,
                x,
                y,
                width,
                height,
            }
        })
        updateSelections(currentImage.id, [...baseSelections, ...newSelections])
        setSelectedBlockIndexes(
            appendedBlocks.map((_, index) => existing.length + index)
        )
        toast.success(
            locale === "zh"
                ? `已并排粘贴 ${appendedBlocks.length} 个文本块`
                : `Pasted ${appendedBlocks.length} blocks side by side`
        )
    }, [copiedBlocks, currentImage, locale, setDetectedTextBlocks, updateSelections])

    const replaceDetectedBlocksText = useCallback((
        blocks: typeof detectedBlocks,
        findKeyword: string,
        replaceValue: string,
        scope: "translated" | "source" | "both"
    ) => {
        if (!findKeyword) return { changed: 0, blocks }

        let changed = 0
        const escaped = findKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        const matcher = new RegExp(escaped, "g")
        const nextBlocks = blocks.map((block) => {
            let nextSource = block.sourceText || ""
            let nextTranslated = block.translatedText || ""
            const prevSource = nextSource
            const prevTranslated = nextTranslated

            if (scope === "source" || scope === "both") {
                nextSource = nextSource.replace(matcher, replaceValue)
            }
            if (scope === "translated" || scope === "both") {
                nextTranslated = nextTranslated.replace(matcher, replaceValue)
            }

            if (nextSource !== prevSource || nextTranslated !== prevTranslated) {
                changed++
            }

            return {
                ...block,
                sourceText: nextSource,
                translatedText: nextTranslated,
                richTextHtml: nextTranslated !== prevTranslated
                    ? nextTranslated
                    : block.richTextHtml,
            }
        })

        return { changed, blocks: nextBlocks }
    }, [])

    const handleReplaceCurrent = useCallback(() => {
        if (!currentImage) return
        if (!findText.trim()) {
            toast.warning(locale === "zh" ? "请输入查找内容" : "Please enter text to find")
            return
        }

        const result = replaceDetectedBlocksText(
            currentImage.detectedTextBlocks || [],
            findText,
            replaceText,
            replaceScope
        )
        if (!result.changed) {
            toast.info(locale === "zh" ? "当前页未匹配到文本" : "No matches in current image")
            return
        }
        setDetectedTextBlocks(currentImage.id, result.blocks)
        toast.success(
            locale === "zh"
                ? `当前页替换 ${result.changed} 处`
                : `${result.changed} replacements in current image`
        )
    }, [currentImage, findText, locale, replaceDetectedBlocksText, replaceScope, replaceText, setDetectedTextBlocks])

    const handleReplaceGlobal = useCallback(() => {
        if (!findText.trim()) {
            toast.warning(locale === "zh" ? "请输入查找内容" : "Please enter text to find")
            return
        }

        let totalChanged = 0
        let changedImages = 0
        images.forEach((img) => {
            const blocks = img.detectedTextBlocks || []
            if (!blocks.length) return
            const result = replaceDetectedBlocksText(blocks, findText, replaceText, replaceScope)
            if (result.changed > 0) {
                changedImages++
                totalChanged += result.changed
                setDetectedTextBlocks(img.id, result.blocks)
            }
        })

        if (!totalChanged) {
            toast.info(locale === "zh" ? "全局未匹配到文本" : "No global matches")
            return
        }
        toast.success(
            locale === "zh"
                ? `全局替换 ${totalChanged} 处（${changedImages} 张图）`
                : `${totalChanged} global replacements (${changedImages} images)`
        )
    }, [findText, images, locale, replaceDetectedBlocksText, replaceScope, replaceText, setDetectedTextBlocks])

    const handleExportWord = useCallback(async () => {
        if (!currentImage || !(currentImage.detectedTextBlocks || []).length) {
            toast.warning(locale === "zh" ? "没有可导出的文本块" : "No text blocks to export")
            return
        }

        try {
            const {
                Document,
                Packer,
                Paragraph,
                Table,
                TableCell,
                TableRow,
                WidthType,
                HeadingLevel,
            } = await import("docx")
            const { saveAs } = await import("file-saver")

            const headerRow = new TableRow({
                children: ["#", "Source", "Translation", "bbox"].map((text) =>
                    new TableCell({
                        children: [new Paragraph({ text, heading: HeadingLevel.HEADING_5 })],
                    })
                ),
            })

            const bodyRows = (currentImage.detectedTextBlocks || []).map((block, index) => (
                new TableRow({
                    children: [
                        new TableCell({
                            children: [new Paragraph(String(index + 1))],
                        }),
                        new TableCell({
                            children: [new Paragraph(block.sourceText || "")],
                        }),
                        new TableCell({
                            children: [new Paragraph(block.translatedText || "")],
                        }),
                        new TableCell({
                            children: [
                                new Paragraph(
                                    `${block.bbox.x.toFixed(4)},${block.bbox.y.toFixed(4)},${block.bbox.width.toFixed(4)},${block.bbox.height.toFixed(4)}`
                                ),
                            ],
                        }),
                    ],
                })
            ))

            const table = new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [headerRow, ...bodyRows],
            })

            const doc = new Document({
                sections: [{
                    children: [
                        new Paragraph({
                            text: "MangaLens Text Export",
                            heading: HeadingLevel.HEADING_2,
                        }),
                        new Paragraph(`Image: ${currentImage.file.name}`),
                        table,
                    ],
                }],
            })

            const blob = await Packer.toBlob(doc)
            saveAs(blob, `${currentImage.file.name.replace(/\.[^.]+$/, "")}-text.docx`)
        } catch (error) {
            toast.error(
                locale === "zh"
                    ? `DOCX 导出失败：${error instanceof Error ? error.message : "未知错误"}`
                    : `DOCX export failed: ${error instanceof Error ? error.message : "Unknown error"}`
            )
        }
    }, [currentImage, locale])

    const handleImportWord = useCallback(async (file: File) => {
        if (!currentImage) return
        try {
            let html = ""
            if (file.name.toLowerCase().endsWith(".docx")) {
                const mammoth = await import("mammoth/mammoth.browser")
                const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() })
                html = result.value || ""
            } else {
                html = await file.text()
            }

            const parser = new DOMParser()
            const doc = parser.parseFromString(html, "text/html")
            const rows = Array.from(doc.querySelectorAll("tbody tr"))
            const fallbackRows = rows.length ? rows : Array.from(doc.querySelectorAll("tr"))
            if (!fallbackRows.length) {
                throw new Error(
                    locale === "zh"
                        ? "未解析到可用行，请导入由本工具导出的 DOCX 文档"
                        : "No rows found. Import a DOCX file exported by this app."
                )
            }

            const blocks = [...(currentImage.detectedTextBlocks || [])]
            let changed = 0
            fallbackRows.forEach((row) => {
                const cells = row.querySelectorAll("td")
                if (cells.length < 3) return
                const index = Number((cells[0].textContent || "").trim()) - 1
                const translated = (cells[2].textContent || "").trim()
                if (!Number.isFinite(index) || index < 0 || index >= blocks.length) return
                if (translated && blocks[index].translatedText !== translated) {
                    blocks[index] = {
                        ...blocks[index],
                        translatedText: translated,
                        richTextHtml: translated,
                    }
                    changed++
                }
            })

            if (!changed) {
                toast.info(locale === "zh" ? "未检测到可更新的译文" : "No translatable rows were updated")
                return
            }
            setDetectedTextBlocks(currentImage.id, blocks)
            toast.success(locale === "zh" ? `已导入并更新 ${changed} 条译文` : `Imported ${changed} translations`)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : (locale === "zh" ? "Word 导入失败" : "Word import failed"))
        }
    }, [currentImage, locale, setDetectedTextBlocks])

    const handleExportDetectedJson = useCallback(() => {
        if (!currentImage) return
        const payload = {
            imageId: currentImage.id,
            fileName: currentImage.file.name,
            exportedAt: new Date().toISOString(),
            blocks: currentImage.detectedTextBlocks || [],
        }
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${currentImage.file.name.replace(/\.[^.]+$/, "")}-detected-text.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }, [currentImage])

    const handleExportTextLayer = useCallback(() => {
        if (!currentImage) return
        const payload = {
            schemaVersion: 1,
            type: "mangalens.text-layer",
            imageId: currentImage.id,
            fileName: currentImage.file.name,
            exportedAt: new Date().toISOString(),
            blocks: currentImage.detectedTextBlocks || [],
        }
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "text/plain;charset=utf-8" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${currentImage.file.name.replace(/\.[^.]+$/, "")}-text-layer.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }, [currentImage])

    const handleImportTextLayer = useCallback(async (file: File) => {
        if (!currentImage) return
        try {
            const raw = await file.text()
            const parsed = JSON.parse(raw) as { blocks?: unknown[] }
            if (!Array.isArray(parsed.blocks)) {
                throw new Error(locale === "zh" ? "无效文本层文件：缺少 blocks" : "Invalid text-layer file: missing blocks")
            }
            const normalized = parseManualJsonBlocks(JSON.stringify({ blocks: parsed.blocks }))
            if (!normalized.length) {
                throw new Error(locale === "zh" ? "未解析到可用文本块" : "No valid text blocks parsed")
            }
            setDetectedTextBlocks(currentImage.id, normalized)

            const image = await loadImage(currentImage.originalUrl)
            const selections = normalized.map((block, index) => {
                const x = Math.max(0, Math.round(block.bbox.x * image.width))
                const y = Math.max(0, Math.round(block.bbox.y * image.height))
                const width = Math.max(12, Math.round(block.bbox.width * image.width))
                const height = Math.max(12, Math.round(block.bbox.height * image.height))
                return {
                    id: `text-layer-${Date.now()}-${index}`,
                    x,
                    y,
                    width,
                    height,
                }
            })
            updateSelections(currentImage.id, selections)
            toast.success(
                locale === "zh"
                    ? `已导入 ${normalized.length} 个文本层并恢复选区`
                    : `Imported ${normalized.length} text layers and restored selections`
            )
        } catch (error) {
            toast.error(error instanceof Error ? error.message : (locale === "zh" ? "导入文本层失败" : "Failed to import text layer"))
        }
    }, [currentImage, locale, parseManualJsonBlocks, setDetectedTextBlocks, updateSelections])

    return (
        <>
            <div className={cn("w-80 border-r border-border glass-card flex flex-col h-full overflow-hidden", className)}>
            <ScrollArea className="flex-1 h-full">
                <div className="p-4 space-y-6 min-h-0">
                    {/* 文件上传区域 */}
                    <div className="space-y-3">
                        <p className="text-sm font-medium">{t.editor.sidebar.files}</p>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="flex-1"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <File className="h-4 w-4 mr-2" />
                                {t.editor.sidebar.uploadFile}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="flex-1"
                                onClick={() => folderInputRef.current?.click()}
                            >
                                <FolderOpen className="h-4 w-4 mr-2" />
                                {t.editor.sidebar.uploadFolder}
                            </Button>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={handlePaste}
                        >
                            <Clipboard className="h-4 w-4 mr-2" />
                            {t.editor.sidebar.paste}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => sidecarImportInputRef.current?.click()}
                            disabled={isPreparingSidecarImport || isApplyingSidecarImport}
                        >
                            {isPreparingSidecarImport ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                                <FileJson className="h-4 w-4 mr-2" />
                            )}
                            {isPreparingSidecarImport
                                ? (locale === "zh" ? "解析中..." : "Parsing...")
                                : (locale === "zh" ? "导入 Sidecar ZIP/JSON" : "Import Sidecar ZIP/JSON")}
                        </Button>

                        {/* 隐藏的文件输入 */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept={EDITOR_IMAGE_ACCEPT}
                            multiple
                            aria-label={locale === "zh" ? "上传图片文件" : "Upload image files"}
                            className="hidden"
                            onChange={(e) => {
                                void handleFileUpload(e.target.files)
                                e.currentTarget.value = ""
                            }}
                        />
                        <input
                            ref={folderInputRef}
                            type="file"
                            accept={EDITOR_IMAGE_ACCEPT}
                            multiple
                            aria-label={locale === "zh" ? "上传图片文件夹" : "Upload image folder"}
                            // @ts-expect-error webkitdirectory is not in types
                            webkitdirectory="true"
                            className="hidden"
                            onChange={(e) => {
                                void handleFileUpload(e.target.files)
                                e.currentTarget.value = ""
                            }}
                        />
                        <input
                            ref={sidecarImportInputRef}
                            type="file"
                            accept=".zip,.json,.txt"
                            aria-label={locale === "zh" ? "导入 Sidecar 文件" : "Import sidecar file"}
                            className="hidden"
                            disabled={isPreparingSidecarImport || isApplyingSidecarImport}
                            onChange={(e) => {
                                const sidecarFile = e.target.files?.[0]
                                if (!sidecarFile) return
                                void handleImportSidecar(sidecarFile)
                                e.currentTarget.value = ""
                            }}
                        />
                    </div>

                    {/* 图片列表 */}
                    {images.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-sm font-medium">
                                {t.editor.sidebar.files} ({images.length})
                            </p>
                            <div className="grid grid-cols-3 gap-2">
                                {sortedImages.map((img) => (
                                    <div
                                        key={img.id}
                                        className={cn(
                                            "relative aspect-square rounded-md overflow-hidden border-2 transition-all",
                                            currentImageId === img.id
                                                ? "border-primary ring-2 ring-primary/30"
                                                : "border-transparent hover:border-primary/50"
                                        )}
                                    >
                                        <button
                                            type="button"
                                            className="absolute inset-0"
                                            onClick={() => setCurrentImage(img.id)}
                                            aria-label={`${locale === "zh" ? "选择图片" : "Select image"}: ${img.file.name}`}
                                        >
                                            <Image
                                                src={img.originalUrl}
                                                alt={img.file.name}
                                                fill
                                                unoptimized
                                                sizes="(max-width: 768px) 33vw, 120px"
                                                className="object-cover"
                                            />
                                        </button>
                                        {img.status === "processing" && (
                                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center pointer-events-none">
                                                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                                            </div>
                                        )}
                                        {img.status === "completed" && (
                                            <div className="absolute top-1 right-1 w-3 h-3 bg-green-500 rounded-full pointer-events-none" />
                                        )}
                                        {img.status === "failed" && (
                                            <div className="absolute top-1 right-1 w-3 h-3 bg-red-500 rounded-full pointer-events-none" />
                                        )}
                                        <IconButton
                                            variant="secondary"
                                            ariaLabel={`${locale === "zh" ? "删除图片" : "Remove image"}: ${img.file.name}`}
                                            className="absolute top-1 left-1 z-10 h-11 w-11 bg-black/60 hover:bg-black/80 text-white"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                removeImage(img.id)
                                            }}
                                        >
                                            <X className="h-3 w-3 text-white" />
                                        </IconButton>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <Separator />

                    {/* 提示词输入 */}
                    <div className="space-y-3">
                        <Label htmlFor="prompt">{t.editor.sidebar.prompt}</Label>
                        <Textarea
                            id="prompt"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={t.editor.sidebar.promptPlaceholder}
                            className="min-h-[120px] resize-none"
                        />
                        <div className="flex items-center space-x-2">
                            <Switch
                                id="apply-to-all"
                                checked={applyToAll}
                                onCheckedChange={setApplyToAll}
                            />
                            <Label htmlFor="apply-to-all" className="text-sm cursor-pointer">
                                {t.editor.sidebar.applyToAll}
                            </Label>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="translation-direction" className="text-xs">
                                    {locale === "zh" ? "翻译方向" : "Direction"}
                                </Label>
                                <Select
                                    value={settings.translationDirection ?? "ja2zh"}
                                    onValueChange={(value: "ja2zh" | "en2zh" | "ja2en" | "en2ja") =>
                                        updateSettings({ translationDirection: value })
                                    }
                                >
                                    <SelectTrigger id="translation-direction" className="h-9">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ja2zh">日 → 中</SelectItem>
                                        <SelectItem value="en2zh">英 → 中</SelectItem>
                                        <SelectItem value="ja2en">日 → 英</SelectItem>
                                        <SelectItem value="en2ja">英 → 日</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="comic-type" className="text-xs">
                                    {locale === "zh" ? "漫画类型" : "Comic type"}
                                </Label>
                                <Select
                                    value={settings.comicType ?? "auto"}
                                    onValueChange={(value: "auto" | "manga" | "western") =>
                                        updateSettings({ comicType: value })
                                    }
                                >
                                    <SelectTrigger id="comic-type" className="h-9">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="auto">{locale === "zh" ? "自动" : "Auto"}</SelectItem>
                                        <SelectItem value="manga">{locale === "zh" ? "日漫" : "Manga"}</SelectItem>
                                        <SelectItem value="western">{locale === "zh" ? "美漫" : "Western"}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="text-style-preset" className="text-xs">
                                {locale === "zh" ? "字体样式预设" : "Text style preset"}
                            </Label>
                            <Select
                                value={settings.textStylePreset ?? "match-original"}
                                onValueChange={(value: "match-original" | "comic-bold" | "clean-serif") =>
                                    updateSettings({ textStylePreset: value })
                                }
                            >
                                <SelectTrigger id="text-style-preset" className="h-9">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="match-original">{locale === "zh" ? "匹配原文" : "Match original"}</SelectItem>
                                    <SelectItem value="comic-bold">{locale === "zh" ? "漫画粗体" : "Comic bold"}</SelectItem>
                                    <SelectItem value="clean-serif">{locale === "zh" ? "清晰衬线" : "Clean serif"}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {isBubbleDetectionEnabled ? (
                            <>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        className="w-full"
                                        onClick={handleAutoDetectText}
                                        disabled={!currentImage || isAutoDetecting || !canRunAutoDetect}
                                    >
                                        {isAutoDetecting ? (
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        ) : (
                                            <Languages className="h-4 w-4 mr-2" />
                                        )}
                                        {locale === "zh" ? "自动检测" : "Auto Detect"}
                                    </Button>
                                    <Dialog open={manualJsonOpen} onOpenChange={setManualJsonOpen}>
                                        <DialogTrigger asChild>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="w-full"
                                                disabled={!currentImage}
                                            >
                                                <FileJson className="h-4 w-4 mr-2" />
                                                JSON
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="sm:max-w-2xl">
                                            <DialogHeader>
                                                <DialogTitle>
                                                    {locale === "zh" ? "手动 JSON 导入" : "Manual JSON Import"}
                                                </DialogTitle>
                                                <DialogDescription>
                                                    {locale === "zh"
                                                        ? "当不走站内检测时，可把图片发给任意 AI 网页端，拿到 JSON 后粘贴回来。"
                                                        : "If you don't use built-in detection, ask any AI web client and paste the returned JSON here."}
                                                </DialogDescription>
                                            </DialogHeader>
                                            <div className="space-y-3">
                                                <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs space-y-1">
                                                    <p>
                                                        {locale === "zh"
                                                            ? "1) 点击“复制提示词”并发给外部 AI（附上当前图片）"
                                                            : "1) Copy prompt and send it to external AI with the image"}
                                                    </p>
                                                    <p>
                                                        {locale === "zh"
                                                            ? "2) 让对方仅返回 JSON（含 sourceText/translatedText/bbox）"
                                                            : "2) Ask it to return JSON only (sourceText/translatedText/bbox)"}
                                                    </p>
                                                    <p>
                                                        {locale === "zh"
                                                            ? "3) 粘贴 JSON，导入后会自动创建选区"
                                                            : "3) Paste JSON here; selections will be created automatically"}
                                                    </p>
                                                </div>
                                                <Textarea
                                                    value={manualJsonInput}
                                                    onChange={(e) => setManualJsonInput(e.target.value)}
                                                    placeholder='{"blocks":[{"sourceText":"...","translatedText":"...","bbox":{"x":0.1,"y":0.2,"width":0.3,"height":0.15}}]}'
                                                    className="min-h-[220px] font-mono text-xs"
                                                />
                                                <div className="flex items-center justify-end gap-2">
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        onClick={handleCopyManualJsonPrompt}
                                                    >
                                                        {locale === "zh" ? "复制提示词" : "Copy Prompt"}
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        onClick={handleImportManualJson}
                                                        disabled={!manualJsonInput.trim() || !currentImage}
                                                    >
                                                        {locale === "zh" ? "导入并生成选区" : "Import to selections"}
                                                    </Button>
                                                </div>
                                            </div>
                                        </DialogContent>
                                    </Dialog>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {locale === "zh" ? "自动检测文本并生成选区" : "Detect text and generate selections"}
                                </p>
                                {!canRunAutoDetect && (
                                    <p className="text-xs text-muted-foreground">
                                        {locale === "zh"
                                            ? "自动检测需要填写 API Key，或启用网站 API"
                                            : "Auto-detection needs API key or server API"}
                                    </p>
                                )}
                            </>
                        ) : (
                            <p className="text-xs text-muted-foreground rounded-md border border-border/60 bg-muted/30 p-2">
                                {locale === "zh"
                                    ? "气泡检测模块已关闭，可在“漫画模块”中重新开启。"
                                    : "Bubble detection is disabled. Re-enable it in Comic Module settings."}
                            </p>
                        )}

                        {isBubbleDetectionEnabled && (detectedBlocks.length > 0 || currentImage?.detectedTextUpdatedAt) && (
                            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-medium">
                                        {locale === "zh" ? "预翻译结果" : "Pre-translation Results"} ({detectedBlocks.length})
                                    </p>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 px-2 text-xs"
                                            onClick={handleExportTextLayer}
                                            disabled={!currentImage || detectedBlocks.length === 0}
                                        >
                                            {locale === "zh" ? "文本层" : "Text Layer"}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 px-2 text-xs"
                                            onClick={() => textLayerImportInputRef.current?.click()}
                                            disabled={!currentImage}
                                        >
                                            {locale === "zh" ? "导入文本层" : "Import Layer"}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 px-2 text-xs"
                                            onClick={handleExportDetectedJson}
                                            disabled={!currentImage || detectedBlocks.length === 0}
                                        >
                                            JSON
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 px-2 text-xs"
                                            onClick={() => currentImage && clearDetectedTextBlocks(currentImage.id)}
                                            disabled={!currentImage || detectedBlocks.length === 0}
                                        >
                                            {locale === "zh" ? "清空" : "Clear"}
                                        </Button>
                                    </div>
                                </div>
                                <input
                                    ref={textLayerImportInputRef}
                                    type="file"
                                    accept=".json,.txt"
                                    className="hidden"
                                    aria-label={locale === "zh" ? "导入文本层文件" : "Import text layer file"}
                                    onChange={(e) => {
                                        const file = e.target.files?.[0]
                                        if (!file) return
                                        void handleImportTextLayer(file)
                                        e.currentTarget.value = ""
                                    }}
                                />
                                {currentImage?.detectedTextUpdatedAt && (
                                    <p className="text-[11px] text-muted-foreground">
                                        {locale === "zh" ? "更新时间" : "Updated"}:{" "}
                                        {new Date(currentImage.detectedTextUpdatedAt).toLocaleString()}
                                    </p>
                                )}

                                <div className="rounded-md border border-border/60 bg-background/60 p-2.5 space-y-2">
                                    <p className="text-[11px] font-medium">
                                        {locale === "zh" ? "文本查找替换（条漫友好）" : "Find & Replace (webtoon friendly)"}
                                    </p>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Input
                                            ref={findInputRef}
                                            value={findText}
                                            onChange={(e) => setFindText(e.target.value)}
                                            placeholder={locale === "zh" ? "查找" : "Find"}
                                            className="h-8 text-xs"
                                        />
                                        <Input
                                            value={replaceText}
                                            onChange={(e) => setReplaceText(e.target.value)}
                                            placeholder={locale === "zh" ? "替换为" : "Replace with"}
                                            className="h-8 text-xs"
                                        />
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        <Select
                                            value={replaceScope}
                                            onValueChange={(value: "translated" | "source" | "both") => setReplaceScope(value)}
                                        >
                                            <SelectTrigger className="h-8">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="translated">{locale === "zh" ? "仅译文" : "Translation"}</SelectItem>
                                                <SelectItem value="source">{locale === "zh" ? "仅原文" : "Source"}</SelectItem>
                                                <SelectItem value="both">{locale === "zh" ? "原文+译文" : "Both"}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <Button type="button" variant="outline" className="h-8 text-xs" onClick={handleReplaceCurrent}>
                                            {locale === "zh" ? "当前页替换" : "Replace page"}
                                        </Button>
                                        <Button type="button" variant="outline" className="h-8 text-xs" onClick={handleReplaceGlobal}>
                                            {locale === "zh" ? "全局替换" : "Replace all"}
                                        </Button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="h-8 text-xs"
                                            onClick={handleExportWord}
                                            disabled={!currentImage || detectedBlocks.length === 0}
                                        >
                                            {locale === "zh" ? "导出 Word" : "Export Word"}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="h-8 text-xs"
                                            onClick={() => wordImportInputRef.current?.click()}
                                            disabled={!currentImage || detectedBlocks.length === 0}
                                        >
                                            {locale === "zh" ? "导入 Word" : "Import Word"}
                                        </Button>
                                        <input
                                            id="editor-word-import"
                                            ref={wordImportInputRef}
                                            type="file"
                                            accept=".docx,.doc,.html,.htm"
                                            aria-label={locale === "zh" ? "导入 Word 文档" : "Import Word document"}
                                            className="hidden"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0]
                                                if (!file) return
                                                void handleImportWord(file)
                                                e.currentTarget.value = ""
                                            }}
                                        />
                                    </div>
                                    <div className="rounded-md border border-border/60 bg-muted/30 p-2 space-y-2">
                                        <p className="text-[11px] font-medium">
                                            {locale === "zh"
                                                ? "多选文本块批量操作（同文案/复制并排）"
                                                : "Multi-block operations (same text / side-by-side paste)"}
                                        </p>
                                        <div className="grid grid-cols-2 gap-2">
                                            <Button type="button" variant="outline" className="h-8 text-xs" onClick={handleSelectAllBlocks}>
                                                {locale === "zh" ? "全选文本块" : "Select all blocks"}
                                            </Button>
                                            <Button type="button" variant="outline" className="h-8 text-xs" onClick={handleClearBlockSelection}>
                                                {locale === "zh" ? "清空选择" : "Clear selection"}
                                            </Button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <Button type="button" variant="outline" className="h-8 text-xs" onClick={handleCopySelectedBlocks}>
                                                {locale === "zh" ? "复制选中块" : "Copy selected"}
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="h-8 text-xs"
                                                onClick={() => void handlePasteCopiedBlocksSideBySide()}
                                                disabled={!copiedBlocks.length}
                                            >
                                                {locale === "zh" ? "并排粘贴" : "Paste side-by-side"}
                                            </Button>
                                        </div>
                                        <Textarea
                                            value={bulkTextValue}
                                            onChange={(e) => setBulkTextValue(e.target.value)}
                                            placeholder={locale === "zh" ? "输入同一文本（可 Ctrl+V）" : "Enter same text for selected blocks"}
                                            className="min-h-[64px] text-xs"
                                        />
                                        <div className="grid grid-cols-2 gap-2">
                                            <Button type="button" className="h-8 text-xs" onClick={handleApplyBulkText}>
                                                {locale === "zh" ? "应用到选中块" : "Apply to selected"}
                                            </Button>
                                            <Button type="button" variant="outline" className="h-8 text-xs" onClick={() => void handlePasteClipboardToSelected()}>
                                                {locale === "zh" ? "粘贴并应用" : "Paste & apply"}
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                {detectedBlocks.length === 0 ? (
                                    <p className="text-[11px] text-muted-foreground">
                                        {locale === "zh"
                                            ? "暂无结果。可点击上方按钮手动检测，或在生成时自动预翻译。"
                                            : "No results yet. Use auto-detect or run generation with pre-translate."}
                                    </p>
                                ) : (
                                    <ScrollArea className="max-h-44 pr-1">
                                        <div className="space-y-2">
                                            {detectedBlocks.slice(0, 20).map((block, index) => (
                                                <div key={`${index}-${block.sourceText}-${block.translatedText}`} className="rounded-md border border-border/60 bg-background/80 p-2">
                                                    <div className="mb-1 flex items-center justify-between">
                                                        <label className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">
                                                            <input
                                                                type="checkbox"
                                                                className="h-3.5 w-3.5"
                                                                checked={selectedBlockSet.has(index)}
                                                                aria-label={locale === "zh" ? `选择文本块 #${index + 1}` : `Select block #${index + 1}`}
                                                                onChange={(e) => toggleBlockSelection(index, e.target.checked)}
                                                            />
                                                            {locale === "zh" ? `文本块 #${index + 1}` : `Block #${index + 1}`}
                                                        </label>
                                                    </div>
                                                    <p className="text-[11px] leading-snug">
                                                        <span className="text-muted-foreground">{locale === "zh" ? "原文" : "Src"}:</span>{" "}
                                                        {block.sourceText || "-"}
                                                    </p>
                                                    <div className="mt-1 space-y-1">
                                                        <Label className="text-[10px] text-muted-foreground">
                                                            {locale === "zh" ? "译文（富文本 WYSIWYG）" : "Translation (WYSIWYG)"}
                                                        </Label>
                                                        <RichTextEditor
                                                            value={block.richTextHtml || block.translatedText || ""}
                                                            locale={locale}
                                                            placeholder={locale === "zh" ? "输入修正译文" : "Edit translated text"}
                                                            onChange={(html) => handleDetectedTextEdit(index, html)}
                                                        />
                                                    </div>
                                                    <p className="text-[10px] text-muted-foreground">
                                                        bbox: x={block.bbox.x.toFixed(3)}, y={block.bbox.y.toFixed(3)}, w={block.bbox.width.toFixed(3)}, h={block.bbox.height.toFixed(3)}
                                                    </p>
                                                    {(block.lines?.length || block.style) && (
                                                        <p className="text-[10px] text-muted-foreground">
                                                            {block.lines?.length
                                                                ? `${locale === "zh" ? "行文本" : "Lines"}: ${block.lines.join(" / ")}`
                                                                : `${locale === "zh" ? "排版参考" : "Layout hints"}: `}
                                                            {block.style
                                                                ? ` ${locale === "zh" ? "颜色" : "Color"}=${block.style.textColor || "?"}, ${locale === "zh" ? "轮廓" : "Outline"}=${block.style.outlineColor || "?"}, ${locale === "zh" ? "描边" : "Stroke"}=${block.style.strokeColor || "?"}/${block.style.strokeWidth ?? "?"}, ${locale === "zh" ? "透明" : "Opacity"}=${block.style.textOpacity ?? "?"}, ${locale === "zh" ? "角度" : "Angle"}=${block.style.angle ?? "?"}, ${locale === "zh" ? "朝向" : "Orientation"}=${block.style.orientation || "auto"}`
                                                                : ""}
                                                        </p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                )}
                            </div>
                        )}
                    </div>

                    <Separator />

                    {/* API 设置 */}
                    <Collapsible>
                        <CollapsibleTrigger className="flex items-center justify-between w-full py-2">
                            <div className="flex items-center gap-2">
                                <Settings className="h-4 w-4" />
                                <span className="font-medium">{t.editor.settings.title}</span>
                            </div>
                            <ChevronDown className="h-4 w-4" />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-4 pt-4">
                            {/* 使用网站 API 开关 */}
                            <div className="space-y-3 p-3 rounded-lg bg-muted/50">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Coins className="h-4 w-4 text-amber-500" />
                                        <Label htmlFor="use-server-api" className="text-sm cursor-pointer">
                                            {locale === "zh" ? "使用网站 API" : "Use Server API"}
                                        </Label>
                                    </div>
                                    <Switch
                                        id="use-server-api"
                                        checked={settings.useServerApi}
                                        onCheckedChange={(checked) => updateSettings({ useServerApi: checked })}
                                    />
                                </div>
                                {settings.useServerApi && (
                                    <div className="text-xs text-muted-foreground space-y-1">
                                        <div className="flex items-center justify-between">
                                            <span>{locale === "zh" ? "当前余额" : "Balance"}:</span>
                                            <span className="font-medium text-amber-500">
                                                {coinsLoading ? "..." : `${coins} Coins`}
                                            </span>
                                        </div>
                                        <p className="text-muted-foreground/70">
                                            {locale === "zh"
                                                ? "每次生成消耗 10 Coins"
                                                : "10 Coins per generation"}
                                        </p>
                                        <p className="text-muted-foreground/70">
                                            {locale === "zh"
                                                ? "网站 API 由管理员在 /admin/settings/ai 配置"
                                                : "Server API is configured by admin at /admin/settings/ai"}
                                        </p>
                                        {coins < 10 && (
                                            <p className="text-destructive font-medium">
                                                {locale === "zh" ? "余额不足，请充值" : "Insufficient balance"}
                                            </p>
                                        )}

                                        <Dialog open={rechargeDialogOpen} onOpenChange={setRechargeDialogOpen}>
                                            <DialogTrigger asChild>
                                                <Button type="button" size="sm" variant="outline" className="w-full mt-2">
                                                    {locale === "zh" ? "充值 Coins" : "Recharge Coins"}
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
                                                <DialogHeader>
                                                    <DialogTitle>
                                                        {locale === "zh" ? "充值 Coins" : "Recharge Coins"}
                                                    </DialogTitle>
                                                    <DialogDescription>
                                                        {locale === "zh"
                                                            ? "充值后可继续使用网站 API 进行翻译生成。"
                                                            : "Recharge to continue using the server API for generation."}
                                                    </DialogDescription>
                                                </DialogHeader>
                                                <RechargePanel
                                                    embedded
                                                    onPaid={() => {
                                                        void refreshCoins()
                                                        setRechargeDialogOpen(false)
                                                    }}
                                                />
                                            </DialogContent>
                                        </Dialog>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-3 rounded-lg border border-border/60 bg-muted/40 p-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="space-y-0.5">
                                        <Label htmlFor="comic-module-enable" className="cursor-pointer">
                                            {locale === "zh" ? "启用漫画模块" : "Enable Comic Module"}
                                        </Label>
                                        <p className="text-xs text-muted-foreground">
                                            {locale === "zh"
                                                ? "统一启用漫画汉化辅助：气泡检测 / OCR / 修补编辑。"
                                                : "Master switch for bubble detect / OCR / repair editor features."}
                                        </p>
                                    </div>
                                    <Switch
                                        id="comic-module-enable"
                                        checked={settings.enableComicModule ?? true}
                                        onCheckedChange={(checked) =>
                                            updateSettings({
                                                enableComicModule: checked,
                                                enableBubbleDetection: checked ? (settings.enableBubbleDetection ?? true) : false,
                                                enableSelectionOcr: checked ? (settings.enableSelectionOcr ?? true) : false,
                                                enablePatchEditor: checked ? (settings.enablePatchEditor ?? true) : false,
                                                enablePretranslate: checked ? settings.enablePretranslate : false,
                                                useMaskMode: checked ? settings.useMaskMode : false,
                                                useReverseMaskMode: checked ? settings.useReverseMaskMode : false,
                                            })
                                        }
                                    />
                                </div>

                                <Separator />

                                <div className="grid gap-2">
                                    <div className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/60 px-2.5 py-2">
                                        <Label htmlFor="comic-bubble-detection" className="text-xs cursor-pointer">
                                            {locale === "zh" ? "启用气泡检测（侧边栏自动检测工具）" : "Enable Bubble Detection (sidebar auto detect)"}
                                        </Label>
                                        <Switch
                                            id="comic-bubble-detection"
                                            checked={settings.enableBubbleDetection ?? true}
                                            disabled={!isComicModuleEnabled}
                                            onCheckedChange={(checked) =>
                                                updateSettings({
                                                    enableBubbleDetection: checked,
                                                    enablePretranslate: checked ? settings.enablePretranslate : false,
                                                })
                                            }
                                        />
                                    </div>
                                    <div className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/60 px-2.5 py-2">
                                        <Label htmlFor="comic-selection-ocr" className="text-xs cursor-pointer">
                                            {locale === "zh" ? "启用 OCR 识别（选区 OCR 按钮）" : "Enable OCR (selection OCR button)"}
                                        </Label>
                                        <Switch
                                            id="comic-selection-ocr"
                                            checked={settings.enableSelectionOcr ?? true}
                                            disabled={!isComicModuleEnabled}
                                            onCheckedChange={(checked) => updateSettings({ enableSelectionOcr: checked })}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/60 px-2.5 py-2">
                                        <Label htmlFor="comic-repair-editor" className="text-xs cursor-pointer">
                                            {locale === "zh" ? "启用修补编辑器（画笔/魔棒/嵌字）" : "Enable Repair Editor (brush/wand/typeset)"}
                                        </Label>
                                        <Switch
                                            id="comic-repair-editor"
                                            checked={settings.enablePatchEditor ?? true}
                                            disabled={!isComicModuleEnabled}
                                            onCheckedChange={(checked) =>
                                                updateSettings({
                                                    enablePatchEditor: checked,
                                                    useMaskMode: checked ? settings.useMaskMode : false,
                                                    useReverseMaskMode: checked ? settings.useReverseMaskMode : false,
                                                })
                                            }
                                        />
                                    </div>
                                    <div className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/60 px-2.5 py-2">
                                        <Label htmlFor="comic-default-vertical" className="text-xs cursor-pointer">
                                            {locale === "zh" ? "默认竖排文字（新文本框）" : "Default vertical text (new text boxes)"}
                                        </Label>
                                        <Switch
                                            id="comic-default-vertical"
                                            checked={settings.defaultVerticalText ?? true}
                                            onCheckedChange={(checked) => updateSettings({ defaultVerticalText: checked })}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="editor-image-size">
                                    {locale === "zh" ? "生成分辨率（Gemini）" : "Output Resolution (Gemini)"}
                                </Label>
                                <Select
                                    value={settings.imageSize || "2K"}
                                    onValueChange={(value: "1K" | "2K" | "4K") =>
                                        updateSettings({ imageSize: value })
                                    }
                                >
                                    <SelectTrigger id="editor-image-size">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1K">1K（快）</SelectItem>
                                        <SelectItem value="2K">2K（平衡）</SelectItem>
                                        <SelectItem value="4K">4K（更清晰）</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    {locale === "zh"
                                        ? "4K 能降低文字边缘发糊，但生成更慢、成本更高；仅 Gemini 图像模型生效。"
                                        : "4K helps text sharpness but costs more and runs slower; applies to Gemini image models."}
                                </p>
                            </div>

                            <div className="space-y-3 rounded-lg border border-border/60 bg-muted/40 p-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="space-y-0.5">
                                        <Label htmlFor="editor-pretranslate" className="cursor-pointer">
                                            {locale === "zh" ? "预翻译（位置增强）" : "Pre-translate (layout hints)"}
                                        </Label>
                                        <p className="text-xs text-muted-foreground">
                                            {locale === "zh"
                                                ? "生成前先做视觉文本检测与翻译，并把文本位置写入提示词。"
                                                : "Run vision OCR+translation first and inject text positions into prompts."}
                                        </p>
                                    </div>
                                    <Switch
                                        id="editor-pretranslate"
                                        checked={settings.enablePretranslate}
                                        disabled={!isBubbleDetectionEnabled}
                                        onCheckedChange={(checked) => updateSettings({ enablePretranslate: checked })}
                                    />
                                </div>

                                <Separator />

                                <div className="flex items-center justify-between gap-3">
                                    <div className="space-y-0.5">
                                        <Label htmlFor="editor-mask-mode" className="cursor-pointer">
                                            {locale === "zh" ? "遮罩模式（单次全图请求）" : "Mask mode (single full-image call)"}
                                        </Label>
                                        <p className="text-xs text-muted-foreground">
                                            {locale === "zh"
                                                ? "只请求一次：默认遮罩仅保留选区，其余全白。"
                                                : "Single request: keep selections, mask non-selected area with white."}
                                        </p>
                                    </div>
                                    <Switch
                                        id="editor-mask-mode"
                                        checked={settings.useMaskMode}
                                        disabled={!isPatchEditorEnabled}
                                        onCheckedChange={(checked) =>
                                            updateSettings({
                                                useMaskMode: checked,
                                                useReverseMaskMode: checked ? (settings.useReverseMaskMode ?? false) : false,
                                            })
                                        }
                                    />
                                </div>

                                {settings.useMaskMode && (
                                    <div className="ml-1 flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/60 p-2.5">
                                        <div className="space-y-0.5">
                                            <Label htmlFor="editor-inverse-mask" className="cursor-pointer">
                                                {locale === "zh" ? "反向遮罩模式" : "Inverse mask mode"}
                                            </Label>
                                            <p className="text-xs text-muted-foreground">
                                                {locale === "zh"
                                                    ? "仅框选区域不发送（置白），其余画面作为上下文发送。"
                                                    : "Selected regions are blanked out; the rest is sent as context."}
                                            </p>
                                        </div>
                                        <Switch
                                            id="editor-inverse-mask"
                                            checked={settings.useReverseMaskMode ?? false}
                                            onCheckedChange={(checked) => updateSettings({ useReverseMaskMode: checked })}
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="editor-max-retries">
                                    {locale === "zh" ? "失败自动重试次数" : "Auto retry count"}
                                </Label>
                                <Select
                                    value={String(settings.maxRetries ?? 2)}
                                    onValueChange={(value) => updateSettings({ maxRetries: Number(value) })}
                                >
                                    <SelectTrigger id="editor-max-retries">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {[0, 1, 2, 3, 4, 5].map((n) => (
                                            <SelectItem key={n} value={String(n)}>
                                                {n}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    {locale === "zh"
                                        ? "网络波动/限流时自动重试，减少你盯界面的时间。"
                                        : "Automatically retries on network/rate-limit errors to reduce manual watching."}
                                </p>
                            </div>

                            {/* 自有 API Key 设置 - 仅当不使用网站 API 时显示 */}
                            {!settings.useServerApi && (
                                <>
                                    {/* Provider 选择 */}
                                    <div className="space-y-2">
                                        <Label htmlFor="editor-provider-select">{t.editor.settings.provider}</Label>
                                        <Select
                                            value={settings.provider}
                                            onValueChange={(value: "gemini" | "openai") =>
                                                updateSettings({ provider: value })
                                            }
                                        >
                                            <SelectTrigger id="editor-provider-select">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="gemini">Google Gemini</SelectItem>
                                                <SelectItem value="openai">OpenAI / 兼容接口</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* API Key */}
                                    <div className="space-y-2">
                                        <Label htmlFor="editor-api-key">{t.editor.settings.apiKey}</Label>
                                        <Input
                                            id="editor-api-key"
                                            type="password"
                                            value={settings.apiKey}
                                            onChange={(e) => updateSettings({ apiKey: e.target.value })}
                                            placeholder={t.editor.settings.apiKeyPlaceholder}
                                        />
                                    </div>

                                    {/* Base URL (仅 OpenAI) */}
                                    {settings.provider === "openai" && (
                                        <div className="space-y-2">
                                            <Label htmlFor="editor-base-url">{t.editor.settings.baseUrl}</Label>
                                            <Input
                                                id="editor-base-url"
                                                value={settings.baseUrl}
                                                onChange={(e) => updateSettings({ baseUrl: e.target.value })}
                                                placeholder={t.editor.settings.baseUrlPlaceholder}
                                            />
                                        </div>
                                    )}

                                    {/* 模型选择 */}
                                    <div className="space-y-2">
                                        <Label htmlFor="editor-model-select">{t.editor.settings.model}</Label>
                                        <Select
                                            value={models.some(m => m.value === settings.model) ? settings.model : "custom"}
                                            onValueChange={(value) => {
                                                if (value === "custom") {
                                                    // 清空 model 以显示自定义输入框
                                                    updateSettings({ model: "" })
                                                } else {
                                                    updateSettings({ model: value })
                                                }
                                            }}
                                        >
                                            <SelectTrigger id="editor-model-select">
                                                <SelectValue placeholder="选择模型" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {models.map((model) => (
                                                    <SelectItem key={model.value} value={model.value}>
                                                        {model.label}
                                                    </SelectItem>
                                                ))}
                                                <SelectItem value="custom">自定义模型</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        {/* 自定义模型输入框 - 当 model 不匹配任何预设时显示 */}
                                        {!models.some(m => m.value === settings.model) && (
                                            <Input
                                                id="editor-model-custom"
                                                value={settings.model}
                                                onChange={(e) => updateSettings({ model: e.target.value })}
                                                placeholder="输入自定义模型名称，如 gemini-2.0-flash"
                                                className="mt-2"
                                            />
                                        )}
                                    </div>

                                    {/* 并发设置 */}
                                    <div className="space-y-2">
                                        <Label htmlFor="editor-concurrency-select">{t.editor.settings.concurrency}</Label>
                                        <div className="flex items-center gap-4">
                                            <div className="flex items-center space-x-2">
                                                <Switch
                                                    id="serial-mode"
                                                    checked={settings.isSerial}
                                                    onCheckedChange={(checked) =>
                                                        updateSettings({ isSerial: checked })
                                                    }
                                                />
                                                <Label htmlFor="serial-mode" className="text-sm">
                                                    {settings.isSerial
                                                        ? t.editor.settings.serial
                                                        : t.editor.settings.concurrent}
                                                </Label>
                                            </div>
                                            {!settings.isSerial && (
                                                <Select
                                                    value={settings.concurrency.toString()}
                                                    onValueChange={(value) =>
                                                        updateSettings({ concurrency: parseInt(value) })
                                                    }
                                                >
                                                    <SelectTrigger id="editor-concurrency-select" className="w-20">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                                                            <SelectItem key={n} value={n.toString()}>
                                                                {n}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        </div>
                                    </div>

                                    <Separator />

                                    {/* 导出格式 */}
                                    <div className="space-y-2">
                                        <Label htmlFor="editor-export-format">导出格式</Label>
                                        <Select
                                            value={settings.exportFormat}
                                            onValueChange={(value: "png" | "jpg" | "webp") =>
                                                updateSettings({ exportFormat: value })
                                            }
                                        >
                                            <SelectTrigger id="editor-export-format">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="png">PNG (无损)</SelectItem>
                                                <SelectItem value="jpg">JPG (有损压缩)</SelectItem>
                                                <SelectItem value="webp">WebP (高效压缩)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* 导出质量（仅 JPG/WebP） */}
                                    {settings.exportFormat !== "png" && (
                                        <div className="space-y-2">
                                            <Label htmlFor="editor-export-quality">导出质量: {settings.exportQuality}%</Label>
                                            <input
                                                id="editor-export-quality"
                                                type="range"
                                                aria-label={locale === "zh" ? "导出质量" : "Export quality"}
                                                min="10"
                                                max="100"
                                                step="5"
                                                value={settings.exportQuality}
                                                onChange={(e) =>
                                                    updateSettings({ exportQuality: parseInt(e.target.value) })
                                                }
                                                className="w-full accent-primary"
                                            />
                                        </div>
                                    )}
                                </>
                            )}
                        </CollapsibleContent>
                    </Collapsible>

                    {images.length > 0 && (
                        <div className="pt-2">
                            <Button
                                type="button"
                                variant={clearGalleryArmed ? "destructive" : "outline"}
                                className="w-full h-10"
                                onClick={() => {
                                    if (!clearGalleryArmed) {
                                        setClearGalleryArmed(true)
                                        toast.warning(
                                            locale === "zh"
                                                ? "请再次点击以确认清空图库"
                                                : "Click again to confirm clearing the gallery"
                                        )
                                        return
                                    }
                                    clearImages()
                                    setClearGalleryArmed(false)
                                    toast.success(locale === "zh" ? "图库已清空" : "Gallery cleared")
                                }}
                            >
                                <Trash2 className="h-4 w-4 mr-2" />
                                {clearGalleryArmed
                                    ? (locale === "zh" ? "再次点击确认清空" : "Click again to clear")
                                    : (locale === "zh" ? "清空图库（双击确认）" : "Clear gallery (double-click confirm)")}
                            </Button>
                        </div>
                    )}
                </div>
            </ScrollArea>
            </div>

            <Dialog open={sidecarPreviewOpen} onOpenChange={handleSidecarPreviewOpenChange}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>
                            {locale === "zh" ? "导入预览" : "Import Preview"}
                        </DialogTitle>
                        <DialogDescription>
                            {locale === "zh"
                                ? "请先确认将要恢复的内容，再执行导入。"
                                : "Review what will be restored before importing."}
                        </DialogDescription>
                    </DialogHeader>

                    {sidecarImportPlan ? (
                        <div className="space-y-3 text-sm">
                            <div className="rounded-md border border-border/60 bg-muted/30 p-3">
                                <p className="text-xs text-muted-foreground">
                                    {locale === "zh" ? "来源文件" : "Source file"}
                                </p>
                                <p className="font-medium break-all">{sidecarImportPlan.sourceFileName}</p>
                            </div>

                            {sidecarImportPlan.kind === "zip" ? (
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="rounded-md border border-border/60 bg-background/70 p-2">
                                        <p className="text-xs text-muted-foreground">{locale === "zh" ? "恢复页数" : "Pages"}</p>
                                        <p className="text-base font-semibold">{sidecarImportPlan.imageCount}</p>
                                    </div>
                                    <div className="rounded-md border border-border/60 bg-background/70 p-2">
                                        <p className="text-xs text-muted-foreground">{locale === "zh" ? "文本块" : "Text blocks"}</p>
                                        <p className="text-base font-semibold">{sidecarImportPlan.blockCount}</p>
                                    </div>
                                    <div className="rounded-md border border-border/60 bg-background/70 p-2">
                                        <p className="text-xs text-muted-foreground">{locale === "zh" ? "选区" : "Selections"}</p>
                                        <p className="text-base font-semibold">{sidecarImportPlan.selectionCount}</p>
                                    </div>
                                    <div className="rounded-md border border-border/60 bg-background/70 p-2">
                                        <p className="text-xs text-muted-foreground">{locale === "zh" ? "提示词" : "Prompts"}</p>
                                        <p className="text-base font-semibold">{sidecarImportPlan.promptCount}</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="rounded-md border border-border/60 bg-background/70 p-2">
                                        <p className="text-xs text-muted-foreground">{locale === "zh" ? "目标页" : "Target page"}</p>
                                        <p className="text-base font-semibold">{currentImage ? 1 : 0}</p>
                                    </div>
                                    <div className="rounded-md border border-border/60 bg-background/70 p-2">
                                        <p className="text-xs text-muted-foreground">{locale === "zh" ? "文本块" : "Text blocks"}</p>
                                        <p className="text-base font-semibold">{sidecarImportPlan.blockCount}</p>
                                    </div>
                                    <div className="rounded-md border border-border/60 bg-background/70 p-2">
                                        <p className="text-xs text-muted-foreground">{locale === "zh" ? "选区" : "Selections"}</p>
                                        <p className="text-base font-semibold">{sidecarImportPlan.selectionCount}</p>
                                    </div>
                                    <div className="rounded-md border border-border/60 bg-background/70 p-2">
                                        <p className="text-xs text-muted-foreground">{locale === "zh" ? "提示词" : "Prompt"}</p>
                                        <p className="text-base font-semibold">{sidecarImportPlan.hasPrompt ? 1 : 0}</p>
                                    </div>
                                </div>
                            )}

                            {sidecarImportPlan.kind === "zip" && sidecarImportPlan.skippedItems.length > 0 && (
                                <p className="text-xs text-amber-600">
                                    {locale === "zh"
                                        ? `有 ${sidecarImportPlan.skippedItems.length} 项可能无法恢复（缺失对应图片或 JSON 无效）。`
                                        : `${sidecarImportPlan.skippedItems.length} items may be skipped (missing image or invalid JSON).`}
                                </p>
                            )}

                            <div className="space-y-2">
                                <p className="text-xs font-medium text-muted-foreground">
                                    {locale === "zh" ? "预览详情（每页）" : "Preview details (per page)"}
                                </p>
                                <ScrollArea className="max-h-44 rounded-md border border-border/60 bg-background/60">
                                    <div className="divide-y divide-border/40">
                                        {sidecarImportPlan.previewDetails.map((detail, index) => (
                                            <details key={`${detail.fileName}-${index}`} className="px-3 py-2">
                                                <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                                                    <p className="min-w-0 flex-1 truncate text-xs font-medium" title={detail.fileName}>
                                                        {detail.fileName}
                                                    </p>
                                                    <p className="shrink-0 text-[11px] text-muted-foreground">
                                                        {locale === "zh"
                                                            ? `${detail.blockCount} 块 / ${detail.selectionCount} 选区${detail.hasPrompt ? " / 提示词" : ""}`
                                                            : `${detail.blockCount} blocks / ${detail.selectionCount} selections${detail.hasPrompt ? " / prompt" : ""}`}
                                                    </p>
                                                </summary>
                                                <div className="mt-2 space-y-1 rounded-md border border-border/50 bg-muted/30 p-2">
                                                    {detail.previewTexts.length ? (
                                                        detail.previewTexts.map((text, textIndex) => (
                                                            <div key={`${detail.fileName}-${index}-${textIndex}`} className="space-y-0.5">
                                                                <p className="text-[11px] leading-snug">
                                                                    <span className="text-muted-foreground">
                                                                        {locale === "zh" ? "原文" : "Src"}:
                                                                    </span>{" "}
                                                                    {text.sourceText || "-"}
                                                                </p>
                                                                <p className="text-[11px] leading-snug">
                                                                    <span className="text-muted-foreground">
                                                                        {locale === "zh" ? "译文" : "Tr"}:
                                                                    </span>{" "}
                                                                    {text.translatedText || "-"}
                                                                </p>
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <p className="text-[11px] text-muted-foreground">
                                                            {locale === "zh"
                                                                ? "该页没有可预览的文本内容"
                                                                : "No previewable text content on this page"}
                                                        </p>
                                                    )}
                                                </div>
                                            </details>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </div>

                            {sidecarImportPlan.kind === "json" && !currentImage && (
                                <p className="text-xs text-destructive">
                                    {locale === "zh"
                                        ? "当前未选中图片。JSON 导入需要先选择一张目标图片。"
                                        : "No image selected. JSON import requires selecting a target image first."}
                                </p>
                            )}
                        </div>
                    ) : (
                        <div className="flex items-center text-sm text-muted-foreground">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {locale === "zh" ? "解析导入计划中..." : "Preparing import plan..."}
                        </div>
                    )}

                    <div className="flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleSidecarPreviewOpenChange(false)}
                            disabled={isApplyingSidecarImport}
                        >
                            {locale === "zh" ? "取消" : "Cancel"}
                        </Button>
                        <Button
                            type="button"
                            onClick={() => void handleConfirmSidecarImport()}
                            disabled={
                                isApplyingSidecarImport
                                || !sidecarImportPlan
                                || (sidecarImportPlan.kind === "json" && !currentImage)
                            }
                        >
                            {isApplyingSidecarImport && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {locale === "zh" ? "确认导入" : "Confirm Import"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}

