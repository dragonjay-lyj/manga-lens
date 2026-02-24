"use client"

import { useCallback, useState } from "react"
import { useEditorStore, useCurrentImage } from "@/lib/stores/editor-store"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import {
    Play,
    Download,
    Package,
    Loader2,
    FileArchive,
    FileCode2,
    FileJson2,
    FileText,
    Layers2,
    Brush,
    Sparkles,
} from "lucide-react"
import { getMessages } from "@/lib/i18n"
import { toast } from "sonner"
import {
    batchGenerateImages,
    buildMangaEditPrompt,
    detectTextBlocks,
    filterBlocksByAngleThreshold,
    getDetectionTargetLanguageFromDirection,
    getSourceLanguageLabel,
    generateImage,
    getTranslationDirectionMeta,
    type DetectTextResponse,
    type DetectedTextBlock,
    type GenerateImageResponse,
    type TextDetectionRegion,
} from "@/lib/ai/ai-service"
import {
    loadImage,
    cropSelection,
    cropSelectionWithClearedArea,
    compositeImage,
    compositeMultiplePatches,
    convertToFormat,
    getFileExtension,
    downloadImage,
    downloadImagesAsZip,
    downloadImagesAsCbz,
    downloadImagesAsHtml,
    downloadImagesAsPdf,
    downloadImagesWithSidecarZip,
    createMaskedImage,
    createInverseMaskedImage,
    compositeSelectionsFromFullImage,
    createImageWithBrushMaskFilled,
    compositeMaskedPixelsFromFullImage,
    imageToDataUrl,
} from "@/lib/utils/image-utils"
import type { Selection } from "@/types/database"

function intersectsNormalizedRect(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number }
): boolean {
    return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
    )
}

export function EditorToolbar() {
    const {
        images,
        settings,
        prompt,
        applyToAll,
        showResult,
        locale,
        isProcessing,
        setShowResult,
        setImageStatus,
        updateSelections,
        initializeSelectionProgress,
        setSelectionProgress,
        clearSelectionProgress,
        setDetectedTextBlocks,
        clearDetectedTextBlocks,
        setProcessing,
        mergeResultIntoOriginal,
        clearRepairMask,
    } = useEditorStore()

    const currentImage = useCurrentImage()
    const t = getMessages(locale)
    const directionMeta = getTranslationDirectionMeta(settings.translationDirection ?? "ja2zh")

    const [progress, setProgress] = useState(0)
    const [progressText, setProgressText] = useState("")
    const [progressDetail, setProgressDetail] = useState("")
    const PATCH_CONTEXT_PADDING = 24
    const PATCH_BLEND_PADDING = 0
    const MASK_CONTEXT_PADDING = 40
    const MASK_BLEND_PADDING = 10
    const PATCH_DIFF_RETRY_THRESHOLD = 0.014
    const useMaskMode = settings.useMaskMode
    const useReverseMaskMode = settings.useReverseMaskMode ?? false
    const enablePretranslate = settings.enablePretranslate
    const ocrEngine = settings.ocrEngine ?? "auto"
    const repairEngine = settings.repairEngine ?? "ai"
    const activeMaskMode = useMaskMode
        ? (useReverseMaskMode ? "inverse-mask" : "mask")
        : "patch"
    const SAFE_DETECT_PAYLOAD_CHARS = 2_000_000
    const FOUR_K_LONG_EDGE = 3840
    const isPatchEditorEnabled = (settings.enableComicModule ?? true) && (settings.enablePatchEditor ?? true)

    const parseApiError = async (res: Response, fallback: string) => {
        const data = await res.json().catch(() => ({}))
        return data?.error || `${fallback} (${res.status})`
    }

    const resolveRetryLimit = (extra: number = 0) =>
        Math.max(0, Math.min(8, (settings.maxRetries ?? 2) + extra))

    const applyDefaultOrientationToBlocks = useCallback((blocks: DetectedTextBlock[]) => {
        const defaultOrientation: "vertical" | "horizontal" =
            (settings.defaultVerticalText ?? true) ? "vertical" : "horizontal"
        return blocks.map((block) => {
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
    }, [settings.defaultVerticalText])

    const selectionToNormalizedRegion = useCallback((
        selection: Selection,
        imageWidth: number,
        imageHeight: number
    ): TextDetectionRegion => ({
        x: Math.max(0, Math.min(1, selection.x / Math.max(1, imageWidth))),
        y: Math.max(0, Math.min(1, selection.y / Math.max(1, imageHeight))),
        width: Math.max(0, Math.min(1, selection.width / Math.max(1, imageWidth))),
        height: Math.max(0, Math.min(1, selection.height / Math.max(1, imageHeight))),
    }), [])

    const resolveDetectionRegionHints = useCallback((
        selections: Selection[],
        imageWidth: number,
        imageHeight: number
    ) => {
        if (!selections.length) return {}
        const normalized = selections.map((selection) =>
            selectionToNormalizedRegion(selection, imageWidth, imageHeight)
        )
        const mode = settings.detectionRegionMode ?? "full"
        if (mode === "selection_only") {
            return { includeRegions: normalized }
        }
        if (mode === "selection_ignore") {
            return { excludeRegions: normalized }
        }
        return {}
    }, [selectionToNormalizedRegion, settings.detectionRegionMode])

    const getTargetLanguageForDetection = () => {
        const direction = settings.translationDirection ?? "ja2zh"
        return getDetectionTargetLanguageFromDirection(direction)
    }

    const getSourceLanguageAllowlistForDetection = () => settings.sourceLanguageAllowlist ?? []

    const getSourceLanguageHintForDetection = () => {
        const allowlist = getSourceLanguageAllowlistForDetection()
        if (allowlist.length) {
            return allowlist.map((code) => getSourceLanguageLabel(code)).join(locale === "zh" ? "、" : ", ")
        }
        const direction = settings.translationDirection ?? "ja2zh"
        return getTranslationDirectionMeta(direction).sourceLangLabel
    }

    const applyAngleThresholdFilter = (blocks: DetectedTextBlock[]) =>
        filterBlocksByAngleThreshold(
            blocks,
            settings.angleThreshold ?? 1,
            settings.enableAngleFilter ?? false
        )

    const blocksToSelections = (
        blocks: DetectedTextBlock[],
        imageWidth: number,
        imageHeight: number,
        idPrefix: string
    ): Selection[] => (
        blocks
            .map((block, index) => {
                const x = Math.max(0, Math.round(block.bbox.x * imageWidth))
                const y = Math.max(0, Math.round(block.bbox.y * imageHeight))
                const width = Math.max(12, Math.round(block.bbox.width * imageWidth))
                const height = Math.max(12, Math.round(block.bbox.height * imageHeight))
                return {
                    id: `${idPrefix}-${Date.now()}-${index}`,
                    x: Math.min(x, Math.max(0, imageWidth - 1)),
                    y: Math.min(y, Math.max(0, imageHeight - 1)),
                    width: Math.min(width, Math.max(1, imageWidth - x)),
                    height: Math.min(height, Math.max(1, imageHeight - y)),
                }
            })
            .filter((selection) => selection.width > 4 && selection.height > 4)
    )

    const buildDetectPayloadCandidates = async (
        dataUrl: string,
        variants: Array<{ maxLongEdge: number; quality: number; mimeType: "image/jpeg" | "image/png" }>
    ) => {
        if (dataUrl.length <= SAFE_DETECT_PAYLOAD_CHARS) {
            return [dataUrl]
        }

        const original = await loadImage(dataUrl)
        const candidates: string[] = [dataUrl]
        const dedupeKeys = new Set<string>([`${dataUrl.length}:${dataUrl.slice(0, 64)}`])

        for (const variant of variants) {
            const scale = Math.min(1, variant.maxLongEdge / Math.max(original.width, original.height))
            const width = Math.max(1, Math.round(original.width * scale))
            const height = Math.max(1, Math.round(original.height * scale))
            const canvas = document.createElement("canvas")
            const ctx = canvas.getContext("2d")
            if (!ctx) continue
            canvas.width = width
            canvas.height = height
            ctx.drawImage(original, 0, 0, width, height)
            const compressed = canvas.toDataURL(variant.mimeType, variant.quality)
            const key = `${compressed.length}:${compressed.slice(0, 64)}`
            if (!dedupeKeys.has(key)) {
                dedupeKeys.add(key)
                candidates.push(compressed)
            }
            if (compressed.length <= SAFE_DETECT_PAYLOAD_CHARS) {
                break
            }
        }

        return candidates
    }

    const runGenerateRequest = async (imageData: string, promptText: string): Promise<GenerateImageResponse> => {
        if (!settings.useServerApi) {
            return generateImage({
                imageData,
                prompt: promptText,
                config: {
                    ...settings,
                    imageSize: settings.imageSize || "2K",
                },
            })
        }

        try {
            const res = await fetch("/api/ai/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    imageData,
                    prompt: promptText,
                    imageSize: settings.imageSize || "2K",
                }),
            })

            if (!res.ok) {
                return {
                    success: false,
                    error: await parseApiError(res, locale === "zh" ? "网站 API 请求失败" : "Server API request failed"),
                }
            }

            const data = await res.json()
            return {
                success: true,
                imageData: data.imageData,
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : (locale === "zh" ? "网站 API 请求失败" : "Server API request failed"),
            }
        }
    }

    const runGenerateRequestWithRetry = async (
        imageData: string,
        promptText: string,
        maxRetries: number = resolveRetryLimit()
    ): Promise<GenerateImageResponse> => {
        let lastResult: GenerateImageResponse = {
            success: false,
            error: locale === "zh" ? "生成失败" : "Generation failed",
        }
        const totalRetries = Math.max(0, maxRetries)

        for (let attempt = 0; attempt <= totalRetries; attempt++) {
            const result = await runGenerateRequest(imageData, promptText)
            if (result.success && result.imageData) {
                return result
            }
            lastResult = result

            const errorText = (result.error || "").toLowerCase()
            const canRetry =
                /429|rate|timeout|timed out|network|temporarily|overload|503|502|504/.test(errorText)
            if (!canRetry || attempt >= totalRetries) {
                break
            }

            await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)))
        }

        return lastResult
    }

    const runLamaInpaintRequest = async (
        imageData: string,
        maskData: string
    ): Promise<GenerateImageResponse> => {
        try {
            const res = await fetch("/api/ai/inpaint", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    imageData,
                    maskData,
                }),
            })
            if (!res.ok) {
                return {
                    success: false,
                    error: await parseApiError(
                        res,
                        locale === "zh" ? "LAMA 修复请求失败" : "LAMA inpaint request failed"
                    ),
                }
            }
            const data = await res.json()
            return {
                success: true,
                imageData: data.imageData,
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error
                    ? error.message
                    : (locale === "zh" ? "LAMA 修复请求失败" : "LAMA inpaint request failed"),
            }
        }
    }

    const runDetectTextRequest = async (
        imageData: string,
        targetLanguage: string,
        selectionsHint: Selection[] = [],
        imageWidth?: number,
        imageHeight?: number
    ): Promise<DetectTextResponse> => {
        const useServerDetectionPipeline = ocrEngine !== "ai_vision"
        const strictServerDetectionEngine = ocrEngine !== "auto" && ocrEngine !== "ai_vision"
        const preferComicDetector = ocrEngine === "auto" || ocrEngine === "comic_text_detector"
        const detectionRegionHints =
            imageWidth && imageHeight
                ? resolveDetectionRegionHints(selectionsHint, imageWidth, imageHeight)
                : {}
        const detectCandidates = settings.useServerApi || useServerDetectionPipeline
            ? await buildDetectPayloadCandidates(imageData, [
                { maxLongEdge: 3072, quality: 0.9, mimeType: "image/jpeg" },
                { maxLongEdge: 2560, quality: 0.86, mimeType: "image/jpeg" },
                { maxLongEdge: 2048, quality: 0.82, mimeType: "image/jpeg" },
                { maxLongEdge: 1600, quality: 0.78, mimeType: "image/jpeg" },
                { maxLongEdge: 1280, quality: 0.74, mimeType: "image/jpeg" },
                { maxLongEdge: 1024, quality: 0.7, mimeType: "image/jpeg" },
            ])
            : [imageData]

        if (!settings.useServerApi && !useServerDetectionPipeline) {
            return detectTextBlocks({
                imageData: detectCandidates[0],
                config: {
                    provider: settings.provider,
                    apiKey: settings.apiKey,
                    baseUrl: settings.baseUrl,
                    model: settings.model,
                },
                targetLanguage,
                sourceLanguageHint: getSourceLanguageHintForDetection(),
                sourceLanguageAllowlist: getSourceLanguageAllowlistForDetection(),
                ...detectionRegionHints,
            }).then((response) => ({
                ...response,
                blocks: response.success ? applyAngleThresholdFilter(response.blocks || []) : (response.blocks || []),
            }))
        }

        let lastError = locale === "zh" ? "网站 API 文本检测失败" : "Server text detection failed"
        for (let i = 0; i < detectCandidates.length; i++) {
            const requestImageData = detectCandidates[i]
            try {
                const res = await fetch("/api/ai/detect-text", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        imageData: requestImageData,
                        targetLanguage,
                        sourceLanguageHint: getSourceLanguageHintForDetection(),
                        sourceLanguageAllowlist: getSourceLanguageAllowlistForDetection(),
                        imageWidth,
                        imageHeight,
                        preferComicDetector,
                        ocrEngine,
                        ...detectionRegionHints,
                    }),
                })

                if (!res.ok) {
                    const parsedError = await parseApiError(
                        res,
                        locale === "zh" ? "网站 API 文本检测失败" : "Server text detection failed"
                    )
                    lastError = parsedError
                    const canRetryWithSmallerPayload = res.status === 413 && i < detectCandidates.length - 1
                    if (canRetryWithSmallerPayload) {
                        continue
                    }
                    if (strictServerDetectionEngine || settings.useServerApi) {
                        return {
                            success: false,
                            blocks: [],
                            error: parsedError,
                        }
                    }
                    break
                }

                const data = await res.json()
                return {
                    success: true,
                    blocks: applyAngleThresholdFilter(data.blocks || []),
                }
            } catch (error) {
                lastError = error instanceof Error
                    ? error.message
                    : (locale === "zh" ? "网站 API 文本检测失败" : "Server text detection failed")
                if (strictServerDetectionEngine || settings.useServerApi || i >= detectCandidates.length - 1) {
                    break
                }
            }
        }

        if (strictServerDetectionEngine || settings.useServerApi) {
            return {
                success: false,
                blocks: [],
                error: lastError,
            }
        }

        return detectTextBlocks({
            imageData: imageData,
            config: {
                provider: settings.provider,
                apiKey: settings.apiKey,
                baseUrl: settings.baseUrl,
                model: settings.model,
            },
            targetLanguage,
            sourceLanguageHint: getSourceLanguageHintForDetection(),
            sourceLanguageAllowlist: getSourceLanguageAllowlistForDetection(),
            ...detectionRegionHints,
        }).then((response) => ({
            ...response,
            blocks: response.success ? applyAngleThresholdFilter(response.blocks || []) : (response.blocks || []),
        }))
    }

    const getShortError = (errorText: string) =>
        errorText.length > 240 ? `${errorText.slice(0, 240)}...` : errorText

    const normalizeDataUrl = (value: string) => value.replace(/^data:image\/\w+;base64,/, "")
    const isExactlySameImageData = (input: string, output: string) =>
        normalizeDataUrl(input) === normalizeDataUrl(output)

    const selectionToNormalizedRect = (
        selection: Selection,
        imageWidth: number,
        imageHeight: number
    ) => ({
        x: Math.max(0, Math.min(1, selection.x / imageWidth)),
        y: Math.max(0, Math.min(1, selection.y / imageHeight)),
        width: Math.max(0, Math.min(1, selection.width / imageWidth)),
        height: Math.max(0, Math.min(1, selection.height / imageHeight)),
    })

    type PretranslatePromptResult = {
        prompt: string
    }

    const buildHardTextFallbackPrompt = (basePrompt: string) => [
        basePrompt,
        "",
        "【复杂背景强化】",
        `1) 这是一块复杂背景/拟声词区域，请务必替换所有可见${directionMeta.sourceLangLabel}文本。`,
        `2) 若背景干扰阅读，请先局部重绘背景再放置${directionMeta.targetLangLabel}文本。`,
        "3) 禁止保持原文不变，禁止仅擦除不重绘。",
        "4) 保持原有方向（竖排就竖排）、字重和描边风格。",
    ].join("\n")

    const buildEnglishOverflowFallbackPrompt = (basePrompt: string, useWhiteOutline: boolean) => [
        basePrompt,
        "",
        "English typesetting fallback rules:",
        "1) Re-layout text to fully fit inside the speech bubble with at least 8% inner padding.",
        "2) Never crop letters. If needed, reduce font size and add line breaks.",
        "3) Keep natural comic reading order and center alignment.",
        useWhiteOutline
            ? "4) Keep original text color whenever possible; if contrast is insufficient, strengthen outline/stroke while preserving original color family."
            : "4) Keep original text color and stroke/outline style readable and consistent.",
    ].join("\n")

    const buildCenterFillFallbackPrompt = (basePrompt: string) => [
        basePrompt,
        "",
        locale === "zh" ? "【防截断回退】" : "[Overflow fallback]",
        locale === "zh"
            ? `1) 以原始文本中心点为排版锚点，在更大可读范围内放置${directionMeta.targetLangLabel}文本，不要硬性贴边。`
            : `1) Use the original text center as anchor and reflow in a wider readable region without hard clipping.`,
        locale === "zh"
            ? "2) 禁止把译文裁切在原框边缘；可自动换行、缩小字号并适度扩展留白。"
            : "2) Never clip translated text at the original box edge; allow line-wrap, size reduction and extra padding.",
        locale === "zh"
            ? "3) 保持气泡内阅读顺序和对齐，自然居中。"
            : "3) Keep reading order and alignment natural inside the bubble.",
    ].join("\n")

    const clampSelectionToImageBounds = (selection: Selection, image: HTMLImageElement): Selection => {
        const x = Math.max(0, Math.min(image.width - 1, Math.round(selection.x)))
        const y = Math.max(0, Math.min(image.height - 1, Math.round(selection.y)))
        const maxW = Math.max(1, image.width - x)
        const maxH = Math.max(1, image.height - y)
        const width = Math.max(4, Math.min(maxW, Math.round(selection.width)))
        const height = Math.max(4, Math.min(maxH, Math.round(selection.height)))
        return {
            ...selection,
            x,
            y,
            width,
            height,
        }
    }

    const expandSelectionForEnglishLayout = (
        selection: Selection,
        image: HTMLImageElement,
        intensity: number = 1
    ): Selection => {
        const isLikelyVertical = selection.height > selection.width * 1.2
        const horizontalPaddingRatio = isLikelyVertical ? 0.26 : 0.2
        const verticalPaddingRatio = isLikelyVertical ? 0.14 : 0.18

        const padX = Math.round(selection.width * horizontalPaddingRatio * intensity)
        const padY = Math.round(selection.height * verticalPaddingRatio * intensity)

        return clampSelectionToImageBounds({
            ...selection,
            x: selection.x - padX,
            y: selection.y - padY,
            width: selection.width + padX * 2,
            height: selection.height + padY * 2,
        }, image)
    }

    const expandSelectionForTranslatedLayout = (
        selection: Selection,
        image: HTMLImageElement,
        intensity: number = 1
    ): Selection => {
        const isLikelyVertical = selection.height > selection.width * 1.2
        const horizontalPaddingRatio = isLikelyVertical ? 0.32 : 0.18
        const verticalPaddingRatio = isLikelyVertical ? 0.16 : 0.2

        const padX = Math.round(selection.width * horizontalPaddingRatio * intensity)
        const padY = Math.round(selection.height * verticalPaddingRatio * intensity)

        return clampSelectionToImageBounds({
            ...selection,
            x: selection.x - padX,
            y: selection.y - padY,
            width: selection.width + padX * 2,
            height: selection.height + padY * 2,
        }, image)
    }

    const expandSelectionFromCenter = (
        selection: Selection,
        image: HTMLImageElement,
        scaleX: number,
        scaleY: number
    ): Selection => {
        const cx = selection.x + selection.width / 2
        const cy = selection.y + selection.height / 2
        const width = Math.max(12, Math.round(selection.width * scaleX))
        const height = Math.max(12, Math.round(selection.height * scaleY))
        return clampSelectionToImageBounds({
            ...selection,
            x: Math.round(cx - width / 2),
            y: Math.round(cy - height / 2),
            width,
            height,
        }, image)
    }

    const computeImageDifferenceRatio = async (beforeDataUrl: string, afterDataUrl: string): Promise<number> => {
        try {
            const before = await loadImage(beforeDataUrl)
            const after = await loadImage(afterDataUrl)
            const sampleWidth = 256
            const sampleHeight = 256
            const beforeCanvas = document.createElement("canvas")
            const afterCanvas = document.createElement("canvas")
            const beforeCtx = beforeCanvas.getContext("2d")
            const afterCtx = afterCanvas.getContext("2d")
            if (!beforeCtx || !afterCtx) return 1

            beforeCanvas.width = sampleWidth
            beforeCanvas.height = sampleHeight
            afterCanvas.width = sampleWidth
            afterCanvas.height = sampleHeight
            beforeCtx.drawImage(before, 0, 0, sampleWidth, sampleHeight)
            afterCtx.drawImage(after, 0, 0, sampleWidth, sampleHeight)

            const beforeData = beforeCtx.getImageData(0, 0, sampleWidth, sampleHeight).data
            const afterData = afterCtx.getImageData(0, 0, sampleWidth, sampleHeight).data

            let changed = 0
            const total = sampleWidth * sampleHeight
            for (let i = 0; i < beforeData.length; i += 4) {
                const dr = Math.abs(beforeData[i] - afterData[i])
                const dg = Math.abs(beforeData[i + 1] - afterData[i + 1])
                const db = Math.abs(beforeData[i + 2] - afterData[i + 2])
                const da = Math.abs(beforeData[i + 3] - afterData[i + 3])
                const weightedDiff = dr * 0.299 + dg * 0.587 + db * 0.114 + da * 0.1
                if (weightedDiff > 14) changed++
            }

            return changed / total
        } catch {
            return 1
        }
    }

    const computeEdgeInkRatio = async (imageDataUrl: string): Promise<number> => {
        try {
            const image = await loadImage(imageDataUrl)
            const sampleSize = 320
            const canvas = document.createElement("canvas")
            const ctx = canvas.getContext("2d")
            if (!ctx) return 0

            canvas.width = sampleSize
            canvas.height = sampleSize
            ctx.drawImage(image, 0, 0, sampleSize, sampleSize)
            const data = ctx.getImageData(0, 0, sampleSize, sampleSize).data

            const borderThickness = Math.max(8, Math.floor(sampleSize * 0.12))
            let edgeDark = 0
            let edgeTotal = 0
            for (let y = 0; y < sampleSize; y++) {
                for (let x = 0; x < sampleSize; x++) {
                    const isEdge =
                        x < borderThickness ||
                        y < borderThickness ||
                        x >= sampleSize - borderThickness ||
                        y >= sampleSize - borderThickness
                    if (!isEdge) continue

                    const index = (y * sampleSize + x) * 4
                    const alpha = data[index + 3]
                    if (alpha < 16) continue
                    const luminance = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114
                    if (luminance < 140) {
                        edgeDark += 1
                    }
                    edgeTotal += 1
                }
            }
            return edgeTotal ? edgeDark / edgeTotal : 0
        } catch {
            return 0
        }
    }

    const computePatchInkDensity = async (imageDataUrl: string): Promise<number> => {
        try {
            const image = await loadImage(imageDataUrl)
            const sampleSize = 256
            const canvas = document.createElement("canvas")
            const ctx = canvas.getContext("2d")
            if (!ctx) return 0

            canvas.width = sampleSize
            canvas.height = sampleSize
            ctx.drawImage(image, 0, 0, sampleSize, sampleSize)
            const data = ctx.getImageData(0, 0, sampleSize, sampleSize).data

            let darkPixels = 0
            let totalPixels = 0
            for (let i = 0; i < data.length; i += 4) {
                const alpha = data[i + 3]
                if (alpha < 20) continue
                const luminance = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
                if (luminance < 170) {
                    darkPixels += 1
                }
                totalPixels += 1
            }
            if (!totalPixels) return 0
            return darkPixels / totalPixels
        } catch {
            return 0
        }
    }

    const toHexColor = (value: number) =>
        Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")

    const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
        const normalized = hex.trim().replace(/^#/, "")
        if (normalized.length !== 6) return null
        const r = Number.parseInt(normalized.slice(0, 2), 16)
        const g = Number.parseInt(normalized.slice(2, 4), 16)
        const b = Number.parseInt(normalized.slice(4, 6), 16)
        if (![r, g, b].every(Number.isFinite)) return null
        return { r, g, b }
    }

    const colorDistance = (
        a: { r: number; g: number; b: number },
        b: { r: number; g: number; b: number }
    ) => Math.sqrt(
        (a.r - b.r) * (a.r - b.r) +
        (a.g - b.g) * (a.g - b.g) +
        (a.b - b.b) * (a.b - b.b)
    )

    const isRgbNearBlack = (color: { r: number; g: number; b: number }) => {
        const max = Math.max(color.r, color.g, color.b)
        const min = Math.min(color.r, color.g, color.b)
        return max < 70 && (max - min) < 24
    }

    const isRgbChromatic = (color: { r: number; g: number; b: number }) => {
        const max = Math.max(color.r, color.g, color.b)
        const min = Math.min(color.r, color.g, color.b)
        return (max - min) >= 22 && max >= 80
    }

    const clampRgb = (value: number) => Math.max(0, Math.min(255, Math.round(value)))

    const createSelectionDominantTextColorSampler = (image: HTMLImageElement) => {
        const canvas = document.createElement("canvas")
        const ctx = canvas.getContext("2d")
        if (!ctx) return () => null

        canvas.width = image.width
        canvas.height = image.height
        ctx.drawImage(image, 0, 0)

        return (selection: Selection): string | null => {
            const x = Math.max(0, Math.min(image.width - 1, Math.floor(selection.x)))
            const y = Math.max(0, Math.min(image.height - 1, Math.floor(selection.y)))
            const maxW = Math.max(1, image.width - x)
            const maxH = Math.max(1, image.height - y)
            const w = Math.max(1, Math.min(maxW, Math.floor(selection.width)))
            const h = Math.max(1, Math.min(maxH, Math.floor(selection.height)))
            const data = ctx.getImageData(x, y, w, h).data

            const buckets = new Map<string, { count: number; r: number; g: number; b: number }>()

            for (let i = 0; i < data.length; i += 4) {
                const alpha = data[i + 3]
                if (alpha < 200) continue

                const r = data[i]
                const g = data[i + 1]
                const b = data[i + 2]
                const max = Math.max(r, g, b)
                const min = Math.min(r, g, b)
                const delta = max - min
                const saturation = max === 0 ? 0 : delta / max
                const luminance = r * 0.299 + g * 0.587 + b * 0.114

                if (luminance > 205 || luminance < 20) continue
                if (saturation < 0.1) continue

                const key = `${Math.round(r / 24)}-${Math.round(g / 24)}-${Math.round(b / 24)}`
                const bucket = buckets.get(key)
                if (bucket) {
                    bucket.count += 1
                    bucket.r += r
                    bucket.g += g
                    bucket.b += b
                } else {
                    buckets.set(key, { count: 1, r, g, b })
                }
            }

            if (!buckets.size) return null

            let best: { count: number; r: number; g: number; b: number } | null = null
            for (const bucket of buckets.values()) {
                if (!best || bucket.count > best.count) {
                    best = bucket
                }
            }

            if (!best) return null

            const minCount = Math.max(8, Math.floor((w * h) * 0.0018))
            if (best.count < minCount) return null

            const avgR = best.r / best.count
            const avgG = best.g / best.count
            const avgB = best.b / best.count
            const chroma = Math.max(avgR, avgG, avgB) - Math.min(avgR, avgG, avgB)
            if (chroma < 18) return null

            return `#${toHexColor(avgR)}${toHexColor(avgG)}${toHexColor(avgB)}`
        }
    }

    const getDominantTextColorFromPatch = async (imageDataUrl: string): Promise<string | null> => {
        try {
            const patchImage = await loadImage(imageDataUrl)
            const sampler = createSelectionDominantTextColorSampler(patchImage)
            return sampler({
                id: "tmp",
                x: 0,
                y: 0,
                width: patchImage.width,
                height: patchImage.height,
            })
        } catch {
            return null
        }
    }

    const tintChangedDarkTextToColor = async (
        sourcePatchDataUrl: string,
        generatedPatchDataUrl: string,
        targetHexColor: string
    ): Promise<string | null> => {
        const targetRgb = hexToRgb(targetHexColor)
        if (!targetRgb) return null

        try {
            const [sourceImg, generatedImg] = await Promise.all([
                loadImage(sourcePatchDataUrl),
                loadImage(generatedPatchDataUrl),
            ])

            const width = Math.max(1, generatedImg.width)
            const height = Math.max(1, generatedImg.height)

            const sourceCanvas = document.createElement("canvas")
            const sourceCtx = sourceCanvas.getContext("2d")
            const outputCanvas = document.createElement("canvas")
            const outputCtx = outputCanvas.getContext("2d")
            if (!sourceCtx || !outputCtx) return null

            sourceCanvas.width = width
            sourceCanvas.height = height
            outputCanvas.width = width
            outputCanvas.height = height

            sourceCtx.drawImage(sourceImg, 0, 0, width, height)
            outputCtx.drawImage(generatedImg, 0, 0, width, height)

            const sourceData = sourceCtx.getImageData(0, 0, width, height).data
            const outputImageData = outputCtx.getImageData(0, 0, width, height)
            const outputData = outputImageData.data

            let recoloredPixels = 0
            const minRecoloredPixels = Math.max(14, Math.floor(width * height * 0.0015))

            for (let i = 0; i < outputData.length; i += 4) {
                const alpha = outputData[i + 3]
                if (alpha < 130) continue

                const r = outputData[i]
                const g = outputData[i + 1]
                const b = outputData[i + 2]
                const max = Math.max(r, g, b)
                const min = Math.min(r, g, b)
                const luminance = r * 0.299 + g * 0.587 + b * 0.114
                const chroma = max - min

                const nearDarkGray = luminance < 120 && chroma < 28
                if (!nearDarkGray) continue

                const sr = sourceData[i]
                const sg = sourceData[i + 1]
                const sb = sourceData[i + 2]
                const changedAmount =
                    Math.abs(r - sr) +
                    Math.abs(g - sg) +
                    Math.abs(b - sb)

                if (changedAmount < 42) continue

                const normalizedLum = Math.max(0, Math.min(1, luminance / 120))
                const tintFactor = 0.35 + normalizedLum * 0.65

                outputData[i] = clampRgb(targetRgb.r * tintFactor)
                outputData[i + 1] = clampRgb(targetRgb.g * tintFactor)
                outputData[i + 2] = clampRgb(targetRgb.b * tintFactor)
                recoloredPixels += 1
            }

            if (recoloredPixels < minRecoloredPixels) {
                return null
            }

            outputCtx.putImageData(outputImageData, 0, 0)
            return outputCanvas.toDataURL("image/png")
        } catch {
            return null
        }
    }

    const getSelectionDarkRatio = (image: HTMLImageElement, selections: Selection[]): number => {
        if (!selections.length) return 0

        const canvas = document.createElement("canvas")
        const ctx = canvas.getContext("2d")
        if (!ctx) return 0
        canvas.width = image.width
        canvas.height = image.height
        ctx.drawImage(image, 0, 0)

        let darkPixels = 0
        let totalPixels = 0

        for (const selection of selections) {
            const x = Math.max(0, Math.min(image.width - 1, Math.floor(selection.x)))
            const y = Math.max(0, Math.min(image.height - 1, Math.floor(selection.y)))
            const maxW = Math.max(1, image.width - x)
            const maxH = Math.max(1, image.height - y)
            const w = Math.max(1, Math.min(maxW, Math.floor(selection.width)))
            const h = Math.max(1, Math.min(maxH, Math.floor(selection.height)))

            const data = ctx.getImageData(x, y, w, h).data
            for (let i = 0; i < data.length; i += 4) {
                const alpha = data[i + 3]
                if (alpha < 16) continue
                const luminance = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
                if (luminance < 210) {
                    darkPixels++
                }
                totalPixels++
            }
        }

        if (totalPixels === 0) return 0
        return darkPixels / totalPixels
    }

    const buildChapterBulkPrompt = useCallback((
        basePrompt: string,
        chapterImages: Array<{
            detectedTextBlocks?: DetectedTextBlock[]
        }>
    ) => {
        const chapterContextEnabled = (settings.chapterBulkTranslate ?? false) || (settings.highQualityMode ?? false)
        if (!chapterContextEnabled) {
            return basePrompt
        }

        const glossaryLines: string[] = []
        const seen = new Set<string>()
        for (const image of chapterImages) {
            const blocks = image.detectedTextBlocks || []
            for (const block of blocks) {
                const source = (block.sourceText || "").trim()
                if (!source) continue
                const normalizedKey = source.toLowerCase()
                if (seen.has(normalizedKey)) continue
                seen.add(normalizedKey)
                const translated = (block.translatedText || "").trim()
                glossaryLines.push(
                    translated
                        ? `${glossaryLines.length + 1}. ${source} => ${translated}`
                        : `${glossaryLines.length + 1}. ${source}`
                )
                if (glossaryLines.length >= 80) break
            }
            if (glossaryLines.length >= 80) break
        }

        if (!glossaryLines.length) {
            return basePrompt
        }

        return [
            basePrompt,
            "",
            locale === "zh"
                ? "【章节批量上下文（术语一致性参考）】"
                : "Chapter-level context (consistency hints):",
            ...(locale === "zh"
                ? [
                    "以下是本章节已识别文本，请优先保持人名/术语/语气一致：",
                    ...glossaryLines,
                ]
                : [
                    "Use the following chapter text memory to keep names and terminology consistent:",
                    ...glossaryLines,
                ]),
        ].join("\n")
    }, [locale, settings.chapterBulkTranslate, settings.highQualityMode])

    const buildHighQualityPrompt = useCallback((basePrompt: string) => {
        if (!(settings.highQualityMode ?? false)) {
            return basePrompt
        }

        const lines: string[] = [
            basePrompt,
            "",
            locale === "zh" ? "【高质量翻译模式（Beta）】" : "[High-quality translation mode (Beta)]",
            locale === "zh"
                ? "请在多页上下文中保持角色称呼、术语和语气一致；同名词请尽量统一译法。"
                : "Keep character voice, terms, and naming consistent across multiple pages.",
        ]

        if (settings.highQualityLowReasoning ?? false) {
            lines.push(
                locale === "zh"
                    ? "低推理模式：优先稳定输出，减少冗长创作性改写。"
                    : "Low-reasoning mode: prioritize stable output over creative paraphrasing."
            )
        }

        const customContext = (settings.highQualityContextPrompt || "").trim()
        if (customContext) {
            lines.push(
                locale === "zh" ? `附加上下文：${customContext}` : `Additional context: ${customContext}`
            )
        }

        return lines.join("\n")
    }, [locale, settings.highQualityContextPrompt, settings.highQualityLowReasoning, settings.highQualityMode])

    const buildPretranslateContextPrompt = async (
        imageId: string,
        originalImg: HTMLImageElement,
        selections: Selection[],
        basePrompt: string,
        updateToolbarProgress: boolean,
        showFailureToast: boolean,
        existingDetectedBlocks: DetectedTextBlock[] = []
    ): Promise<PretranslatePromptResult> => {
        if (!enablePretranslate) {
            return { prompt: basePrompt }
        }
        const canRunPretranslate = settings.useServerApi || Boolean(settings.apiKey)
        let allBlocks: DetectedTextBlock[] = applyAngleThresholdFilter(existingDetectedBlocks)

        if (enablePretranslate && canRunPretranslate) {
            if (updateToolbarProgress) {
                setProgressDetail(locale === "zh" ? "视觉模型预翻译中..." : "Running vision pre-translation...")
            }

            const detectResult = await runDetectTextRequest(
                imageToDataUrl(originalImg),
                getTargetLanguageForDetection(),
                selections,
                originalImg.width,
                originalImg.height
            )

            if (!detectResult.success) {
                if (showFailureToast) {
                    toast.warning(
                        locale === "zh"
                            ? `预翻译失败，继续原流程: ${detectResult.error || "未知错误"}`
                            : `Pre-translation failed, continuing: ${detectResult.error || "Unknown error"}`
                    )
                }
                // 预翻译失败时，若已有自动检测结果，继续使用已有结果增强提示词
                allBlocks = existingDetectedBlocks
            } else {
                allBlocks = detectResult.blocks || []
            }
        }

        if (!allBlocks.length) {
            if (enablePretranslate) {
                clearDetectedTextBlocks(imageId)
            }
            return {
                prompt: basePrompt,
            }
        }

        const scopedBlocks = selections.length
            ? allBlocks.filter((block) => {
                const blockRect = block.bbox
                return selections.some((selection) =>
                    intersectsNormalizedRect(
                        blockRect,
                        selectionToNormalizedRect(selection, originalImg.width, originalImg.height)
                    )
                )
            })
            : allBlocks

        if (!scopedBlocks.length) {
            if (enablePretranslate) {
                clearDetectedTextBlocks(imageId)
            }
            return {
                prompt: basePrompt,
            }
        }

        if (enablePretranslate) {
            setDetectedTextBlocks(imageId, applyDefaultOrientationToBlocks(scopedBlocks))
        }

        if (updateToolbarProgress) {
            setProgressDetail(
                locale === "zh"
                    ? `预翻译完成，命中 ${scopedBlocks.length} 条文本`
                    : `Pre-translation ready: ${scopedBlocks.length} text blocks`
            )
        }

        const forceJsonContext = settings.highQualityMode && (settings.highQualityForceJson ?? true)
        const lines = scopedBlocks.slice(0, 20).map((block: DetectedTextBlock, index) => {
            if (forceJsonContext) {
                return JSON.stringify({
                    index: index + 1,
                    sourceText: block.sourceText || "",
                    translatedText: block.translatedText || "",
                    bbox: {
                        x: Number(block.bbox.x.toFixed(4)),
                        y: Number(block.bbox.y.toFixed(4)),
                        width: Number(block.bbox.width.toFixed(4)),
                        height: Number(block.bbox.height.toFixed(4)),
                    },
                    style: {
                        textColor: block.style?.textColor || null,
                        outlineColor: block.style?.outlineColor || null,
                        angle: block.style?.angle ?? null,
                        orientation: block.style?.orientation || "auto",
                        alignment: block.style?.alignment || "auto",
                        fontWeight: block.style?.fontWeight || "auto",
                    },
                })
            }
            const styleHint = block.style
                ? `style: color=${block.style.textColor || "?"}, outline=${block.style.outlineColor || "?"}, angle=${block.style.angle ?? "?"}, orientation=${block.style.orientation || "auto"}, align=${block.style.alignment || "auto"}, weight=${block.style.fontWeight || "auto"}`
                : "style: (none)"
            const lineHint = block.lines?.length
                ? `lines: ${block.lines.join(" / ")}`
                : "lines: (none)"
            return (
                `${index + 1}. 原文: ${block.sourceText || "(空)"} | 译文: ${block.translatedText || "(空)"} | `
                + `bbox: x=${block.bbox.x.toFixed(3)}, y=${block.bbox.y.toFixed(3)}, `
                + `w=${block.bbox.width.toFixed(3)}, h=${block.bbox.height.toFixed(3)} | `
                + `${lineHint} | ${styleHint}`
            )
        })

        return {
            prompt: [
            basePrompt,
            "",
            forceJsonContext
                ? "以下是视觉模型预翻译 JSON（用于保持台词内容与位置）："
                : "以下是视觉模型预翻译结果（可用于保持台词内容与位置）：",
            ...lines,
            forceJsonContext
                ? "请严格依据以上 JSON 的译文与 bbox 排版信息执行。"
                : "请优先遵循以上翻译与布局信息。",
            ].join("\n"),
        }
    }

    const processSelectionsPatchMode = async (
        imageId: string,
        originalImg: HTMLImageElement,
        composeBaseImg: HTMLImageElement,
        selections: Selection[],
        effectivePrompt: string,
        updateToolbarProgress: boolean,
        trackSelectionProgress: boolean
    ) => {
        if (trackSelectionProgress) {
            initializeSelectionProgress(imageId, selections.map((selection) => selection.id))
        } else {
            clearSelectionProgress(imageId)
        }

        const englishTarget = directionMeta.targetLangCode === "en"
        const total = selections.length
        const hasManySelections = total >= 10
        const layoutExpandIntensity = hasManySelections ? 0.82 : 1
        const useColorAnchors = trackSelectionProgress
        const sampleDominantTextColor = useColorAnchors
            ? createSelectionDominantTextColorSampler(originalImg)
            : null
        const selectionDominantColorMap = new Map<string, string>(
            useColorAnchors
                ? selections
                    .map((selection) => [selection.id, sampleDominantTextColor?.(selection) || null] as const)
                    .filter((entry): entry is [string, string] => Boolean(entry[1]))
                : []
        )
        const selectionDarkRatioMap = new Map<string, number>(
            selections.map((selection) => [selection.id, getSelectionDarkRatio(originalImg, [selection])])
        )
        const layoutSelections = selections.map((selection) =>
            englishTarget
                ? expandSelectionForEnglishLayout(selection, originalImg, layoutExpandIntensity)
                : expandSelectionForTranslatedLayout(selection, originalImg, layoutExpandIntensity)
        )

        const indexedSelections = layoutSelections.map((selection, index) => ({
            selection,
            index: index + 1,
        }))
        const selectionIndexMap = new Map(indexedSelections.map((item) => [item.selection.id, item.index]))
        const requestedConcurrency = settings.isSerial
            ? 1
            : Math.max(1, Math.min(4, settings.concurrency || 1))
        const effectiveConcurrency = hasManySelections
            ? Math.max(1, Math.min(2, requestedConcurrency))
            : requestedConcurrency

        const isHardSelection = (selection: Selection) => {
            const area = Math.max(1, selection.width * selection.height)
            const minEdge = Math.max(1, Math.min(selection.width, selection.height))
            const aspectRatio = Math.max(
                selection.width / Math.max(1, selection.height),
                selection.height / Math.max(1, selection.width)
            )
            // Avoid over-classifying narrow vertical bubbles as "hard":
            // otherwise first-pass white-clearing removes original color cues.
            return (
                area < 9_000 ||
                minEdge < 56 ||
                (aspectRatio >= 4.8 && area < 22_000)
            )
        }

        const buildSelectionPrompt = (selection: Selection, isHard: boolean) => {
            const isLikelyVertical = selection.height > selection.width * 1.25
            const isLikelyHorizontal = selection.width > selection.height * 1.25
            const darkRatio = selectionDarkRatioMap.get(selection.id) ?? 0
            const useWhiteOutline = darkRatio >= 0.18
            const layoutHint = isLikelyVertical
                ? "该选区大概率是竖排文本，请保持竖排（从上到下、从右到左列）。"
                : isLikelyHorizontal
                    ? "该选区大概率是横排文本，请保持横排（从左到右、从上到下）。"
                    : "请保持该选区的原始排版方向。"
            const hardHints = isHard
                ? [
                    "这是复杂/拟声词高难选区：必须清除并替换掉所有可见原文。",
                    "允许先局部重绘背景再放置中文，避免原文和译文重叠。",
                    "若文本无法完全识别，给出最贴近语境的保守译法，不能留空。",
                ]
                : []
            const styleConsistencyHint = locale === "zh"
                ? "同一页面多个对白框风格一致时，当前选区需保持相同字体家族与字重，不要突然切换字体风格。"
                : "When nearby bubbles share a style on the same page, keep the same font family and weight for this selection."
            const englishLayoutHints = englishTarget
                ? [
                    "目标语言为英文：请按气泡空间重排断行，避免文字溢出或贴边。",
                    "若英文句子偏长，请优先换行与缩小字号，确保整段完整显示。",
                    useWhiteOutline
                        ? "背景较复杂：优先保留原文字色，并通过增强描边/轮廓提升可读性；不要统一改成黑字。"
                        : "保持原有文字颜色与描边风格并保证英文可读性。",
                ]
                : []
            const universalColorHint = useWhiteOutline
                ? "颜色要求：尽量保留该选区原文字色；若对比不足，仅增强描边/轮廓，不要把文字统一改成黑色。"
                : "颜色要求：保持该选区原有文字颜色与描边风格，不要统一黑字。"
            const dominantTextColor = selectionDominantColorMap.get(selection.id)
            const explicitColorAnchorHint = dominantTextColor
                ? (
                    locale === "zh"
                        ? `颜色锚点：该选区原文字主色约为 ${dominantTextColor}，请保持同色系（允许轻微明暗变化），禁止替换成纯黑字。`
                        : `Color anchor: dominant source text color is about ${dominantTextColor}. Keep the same color family (minor brightness changes allowed), and do not switch to pure black.`
                )
                : null

            return [
                effectivePrompt,
                "",
                "【当前选区约束】",
                layoutHint,
                universalColorHint,
                styleConsistencyHint,
                ...(explicitColorAnchorHint ? [explicitColorAnchorHint] : []),
                ...englishLayoutHints,
                ...hardHints,
            ].join("\n")
        }

        const buildSelectionInput = (selection: Selection) => {
            // First pass always keeps original pixels so model can inherit text color/stroke.
            // White-cleared input is reserved for fallback retries on unchanged outputs.
            return cropSelection(originalImg, selection, PATCH_CONTEXT_PADDING)
        }

        const workItems = indexedSelections.map(({ selection, index }) => {
            const isHard = isHardSelection(selection)
            return {
                selection,
                index,
                area: Math.max(1, selection.width * selection.height),
                isHard,
                prompt: buildSelectionPrompt(selection, isHard),
                inputPatch: buildSelectionInput(selection),
            }
        })
        const scheduledWorkItems = [...workItems].sort((a, b) => {
            if (a.area !== b.area) return a.area - b.area
            if (a.isHard !== b.isHard) return a.isHard ? -1 : 1
            return a.index - b.index
        })
        const inputPatchBySelection = new Map(
            workItems.map((item) => [item.selection.id, item.inputPatch])
        )
        const promptBySelection = new Map(
            workItems.map((item) => [item.selection.id, item.prompt])
        )
        const hardSelectionIds = new Set(
            workItems.filter((item) => item.isHard).map((item) => item.selection.id)
        )

        if (updateToolbarProgress) {
            setProgress(0)
            setProgressText(`0/${total}`)
            setProgressDetail(
                total >= 8
                    ? (
                        locale === "zh"
                            ? `准备处理 ${total} 个选区（小选区优先，${effectiveConcurrency > 1 ? `并发 ${effectiveConcurrency}` : "串行"}）...`
                            : `Preparing ${total} selections (small-first, ${effectiveConcurrency > 1 ? `parallel ${effectiveConcurrency}` : "serial"})...`
                    )
                    : (locale === "zh" ? `准备处理 ${total} 个选区...` : `Preparing ${total} selections...`)
            )
        }

        const results = new Map<string, GenerateImageResponse>()
        if (settings.useServerApi) {
            const queue = [...scheduledWorkItems]
            const workerCount = Math.max(1, Math.min(effectiveConcurrency, queue.length))
            let completed = 0

            const runWorker = async () => {
                while (queue.length > 0) {
                    const item = queue.shift()
                    if (!item) break

                    const { selection, isHard } = item
                    if (trackSelectionProgress) {
                        setSelectionProgress(imageId, selection.id, "processing")
                    }
                    if (updateToolbarProgress) {
                        const selectionNo = selectionIndexMap.get(selection.id) ?? 0
                        setProgress((completed / total) * 100)
                        setProgressText(`${completed}/${total}`)
                        setProgressDetail(
                            locale === "zh"
                                ? `正在处理选区 #${selectionNo}/${total}（并发 ${workerCount}）`
                                : `Processing selection #${selectionNo}/${total} (parallel ${workerCount})`
                        )
                    }

                    const result = await runGenerateRequestWithRetry(
                        inputPatchBySelection.get(selection.id) || cropSelection(originalImg, selection, PATCH_CONTEXT_PADDING),
                        promptBySelection.get(selection.id) || effectivePrompt,
                        resolveRetryLimit(isHard ? 1 : 0)
                    )
                    results.set(selection.id, result)
                    completed += 1

                    if (updateToolbarProgress) {
                        const selectionNo = selectionIndexMap.get(selection.id) ?? 0
                        setProgress((completed / total) * 100)
                        setProgressText(`${completed}/${total}`)
                        setProgressDetail(
                            locale === "zh"
                                ? `已完成选区 #${selectionNo}（${completed}/${total}）`
                                : `Completed selection #${selectionNo} (${completed}/${total})`
                        )
                    }

                    if (!result.success && trackSelectionProgress) {
                        setSelectionProgress(
                            imageId,
                            selection.id,
                            "failed",
                            result.error || (locale === "zh" ? "生成失败" : "Generation failed")
                        )
                    }
                }
            }

            await Promise.all(Array.from({ length: workerCount }, () => runWorker()))
        } else {
            const requests = scheduledWorkItems.map(({ selection }) => ({
                imageId: selection.id,
                request: {
                    imageData: inputPatchBySelection.get(selection.id) || cropSelection(originalImg, selection, PATCH_CONTEXT_PADDING),
                    prompt: promptBySelection.get(selection.id) || effectivePrompt,
                    config: settings,
                },
            }))
            const batchResults = await batchGenerateImages(requests, {
                isSerial: settings.isSerial,
                concurrency: effectiveConcurrency,
                maxRetries: resolveRetryLimit(),
                onItemStart: (selectionId, completed, totalCount) => {
                    if (trackSelectionProgress) {
                        setSelectionProgress(imageId, selectionId, "processing")
                    }
                    if (updateToolbarProgress) {
                        const selectionNo = selectionIndexMap.get(selectionId) ?? 0
                        setProgress((completed / totalCount) * 100)
                        setProgressText(`${completed}/${totalCount}`)
                        setProgressDetail(
                            locale === "zh"
                                ? `正在处理选区 #${selectionNo}/${totalCount}`
                                : `Processing selection #${selectionNo}/${totalCount}`
                        )
                    }
                },
                onProgress: (completed, totalCount, selectionId) => {
                    if (updateToolbarProgress) {
                        const selectionNo = selectionIndexMap.get(selectionId) ?? 0
                        setProgress((completed / totalCount) * 100)
                        setProgressText(`${completed}/${totalCount}`)
                        setProgressDetail(
                            locale === "zh"
                                ? `已完成选区 #${selectionNo}（${completed}/${totalCount}）`
                                : `Completed selection #${selectionNo} (${completed}/${totalCount})`
                        )
                    }
                },
                onError: (selectionId, error) => {
                    if (trackSelectionProgress) {
                        setSelectionProgress(imageId, selectionId, "failed", error)
                    }
                },
            })

            batchResults.forEach((value, key) => {
                results.set(key, value)
            })
        }

        const patches: Array<{ base64: string; selection: Selection }> = []
        const failures: string[] = []
        let lowResolutionWarned = false

        for (const { selection, index } of workItems) {
            let result = results.get(selection.id)
            if (result?.success && result.imageData) {
                const sourcePatch = inputPatchBySelection.get(selection.id)
                const isHard = hardSelectionIds.has(selection.id)
                const selectionPrompt = promptBySelection.get(selection.id) || effectivePrompt
                if (sourcePatch) {
                    let bestImageData = result.imageData
                    const shouldRunDiffRetry = isHard || !hasManySelections
                    let bestDiffRatio = 1

                    if (shouldRunDiffRetry) {
                        bestDiffRatio = await computeImageDifferenceRatio(sourcePatch, bestImageData)
                    }

                    if (shouldRunDiffRetry && bestDiffRatio < PATCH_DIFF_RETRY_THRESHOLD) {
                        if (updateToolbarProgress) {
                            setProgressDetail(
                                locale === "zh"
                                    ? `选区 #${index} 文本变化过小，正在强化重试...`
                                    : `Selection #${index} changed too little, retrying with stronger prompt...`
                            )
                        }
                        const hardPrompt = buildHardTextFallbackPrompt(selectionPrompt)

                        const retryWithPrompt = await runGenerateRequestWithRetry(
                            sourcePatch,
                            hardPrompt,
                            Math.max(1, resolveRetryLimit())
                        )
                        if (retryWithPrompt.success && retryWithPrompt.imageData) {
                            const retryDiff = await computeImageDifferenceRatio(sourcePatch, retryWithPrompt.imageData)
                            if (retryDiff > bestDiffRatio) {
                                bestImageData = retryWithPrompt.imageData
                                bestDiffRatio = retryDiff
                            }
                        }

                        if (bestDiffRatio < PATCH_DIFF_RETRY_THRESHOLD && !isHard) {
                            const clearedPatch = cropSelectionWithClearedArea(
                                originalImg,
                                selection,
                                PATCH_CONTEXT_PADDING + 10,
                                "#ffffff",
                                1
                            )
                            const retryWithCleared = await runGenerateRequestWithRetry(clearedPatch, hardPrompt, 1)
                            if (retryWithCleared.success && retryWithCleared.imageData) {
                                const retryDiff = await computeImageDifferenceRatio(sourcePatch, retryWithCleared.imageData)
                                if (retryDiff > bestDiffRatio) {
                                    bestImageData = retryWithCleared.imageData
                                    bestDiffRatio = retryDiff
                                }
                            }
                        }

                        result = {
                            ...result,
                            imageData: bestImageData,
                        }
                    }
                }
                let finalImageData = result.imageData
                let finalSelection = selection
                let inputPatchForFinalCheck = sourcePatch
                if (!finalImageData) {
                    const errorMessage = locale === "zh" ? "生成结果为空" : "Generated image is empty"
                    if (trackSelectionProgress) {
                        setSelectionProgress(imageId, selection.id, "failed", errorMessage)
                    }
                    failures.push(
                        locale === "zh"
                            ? `选区 #${index}: ${errorMessage}`
                            : `Selection #${index}: ${errorMessage}`
                    )
                    continue
                }

                try {
                    if (sourcePatch) {
                        const sourceImg = await loadImage(sourcePatch)
                        const generatedImg = await loadImage(finalImageData)
                        const srcLongEdge = Math.max(sourceImg.width, sourceImg.height)
                        const genLongEdge = Math.max(generatedImg.width, generatedImg.height)
                        if (!lowResolutionWarned && srcLongEdge >= FOUR_K_LONG_EDGE && genLongEdge < FOUR_K_LONG_EDGE) {
                            toast.warning(
                                locale === "zh"
                                    ? `选区 #${index} 返回分辨率 ${generatedImg.width}x${generatedImg.height}，低于 4K。`
                                    : `Selection #${index} generated ${generatedImg.width}x${generatedImg.height}, below 4K.`
                            )
                            lowResolutionWarned = true
                        }
                    }
                } catch {
                    // ignore resolution inspect failures
                }

                if (englishTarget && sourcePatch) {
                    const edgeInkRatio = await computeEdgeInkRatio(finalImageData)
                    const baseInkDensity = await computePatchInkDensity(finalImageData)
                    const likelyOverflow = edgeInkRatio > 0.42
                    if (likelyOverflow) {
                        if (updateToolbarProgress) {
                            setProgressDetail(
                                locale === "zh"
                                    ? `选区 #${index} 英文排版疑似溢出，正在自动回退重试...`
                                    : `Selection #${index} may overflow in English layout, retrying...`
                            )
                        }

                        const useWhiteOutline = (selectionDarkRatioMap.get(selection.id) ?? 0) >= 0.18
                        const overflowSelection = expandSelectionForEnglishLayout(selection, originalImg, 1.28)
                        const overflowPrompt = buildEnglishOverflowFallbackPrompt(selectionPrompt, useWhiteOutline)
                        const overflowPatch = cropSelection(
                            originalImg,
                            overflowSelection,
                            PATCH_CONTEXT_PADDING + 8
                        )
                        const retryOverflow = await runGenerateRequestWithRetry(
                            overflowPatch,
                            overflowPrompt,
                            1
                        )
                        if (retryOverflow.success && retryOverflow.imageData) {
                            const retryEdgeRatio = await computeEdgeInkRatio(retryOverflow.imageData)
                            const retryInkDensity = await computePatchInkDensity(retryOverflow.imageData)
                            if (retryEdgeRatio + 0.03 < edgeInkRatio && retryInkDensity >= baseInkDensity * 0.62) {
                                finalImageData = retryOverflow.imageData
                                finalSelection = overflowSelection
                                inputPatchForFinalCheck = overflowPatch
                            }
                        }
                    }
                }
                if (!englishTarget && directionMeta.targetLangCode === "zh" && sourcePatch) {
                    const edgeInkRatio = await computeEdgeInkRatio(finalImageData)
                    const baseInkDensity = await computePatchInkDensity(finalImageData)
                    const isLikelyVertical = selection.height > selection.width * 1.2
                        const likelyOverflow = edgeInkRatio > (isLikelyVertical ? 0.42 : 0.5)
                    if (likelyOverflow) {
                        if (updateToolbarProgress) {
                            setProgressDetail(
                                locale === "zh"
                                    ? `选区 #${index} 中文排版疑似截断，正在按中心点扩框重试...`
                                    : `Selection #${index} likely clipped for Chinese, retrying with center-based expansion...`
                            )
                        }
                        const overflowSelection = isLikelyVertical
                            ? expandSelectionFromCenter(selection, originalImg, 1.42, 1.24)
                            : expandSelectionFromCenter(selection, originalImg, 1.28, 1.2)
                        const overflowPrompt = buildCenterFillFallbackPrompt(selectionPrompt)
                        const overflowPatch = cropSelection(
                            originalImg,
                            overflowSelection,
                            PATCH_CONTEXT_PADDING + 10
                        )
                        const retryOverflow = await runGenerateRequestWithRetry(overflowPatch, overflowPrompt, 1)
                        if (retryOverflow.success && retryOverflow.imageData) {
                            const retryEdgeRatio = await computeEdgeInkRatio(retryOverflow.imageData)
                            const retryInkDensity = await computePatchInkDensity(retryOverflow.imageData)
                            if (retryEdgeRatio + 0.02 < edgeInkRatio && retryInkDensity >= baseInkDensity * 0.66) {
                                finalImageData = retryOverflow.imageData
                                finalSelection = overflowSelection
                                inputPatchForFinalCheck = overflowPatch
                            }
                        }
                    }
                }

                const sourceDominantColor = selectionDominantColorMap.get(selection.id)
                const sourceDominantRgb = sourceDominantColor ? hexToRgb(sourceDominantColor) : null
                if (sourceDominantColor && sourceDominantRgb && isRgbChromatic(sourceDominantRgb)) {
                    const generatedDominantColor = await getDominantTextColorFromPatch(finalImageData)
                    const generatedDominantRgb = generatedDominantColor ? hexToRgb(generatedDominantColor) : null
                    const currentDistance = generatedDominantRgb
                        ? colorDistance(sourceDominantRgb, generatedDominantRgb)
                        : Number.POSITIVE_INFINITY
                    const needColorCorrection =
                        !generatedDominantRgb ||
                        isRgbNearBlack(generatedDominantRgb) ||
                        currentDistance > 120

                    if (needColorCorrection) {
                        if (updateToolbarProgress) {
                            setProgressDetail(
                                locale === "zh"
                                    ? `选区 #${index} 颜色偏差较大，正在应用本地颜色校正...`
                                    : `Selection #${index} color drift detected, applying local color correction...`
                            )
                        }
                        const colorCorrectionSource = inputPatchForFinalCheck || sourcePatch || cropSelection(
                            originalImg,
                            finalSelection,
                            PATCH_CONTEXT_PADDING + 4
                        )
                        const correctedImageData = await tintChangedDarkTextToColor(
                            colorCorrectionSource,
                            finalImageData,
                            sourceDominantColor
                        )

                        if (correctedImageData) {
                            const correctedDominantColor = await getDominantTextColorFromPatch(correctedImageData)
                            const correctedDominantRgb = correctedDominantColor ? hexToRgb(correctedDominantColor) : null
                            if (correctedDominantRgb && !isRgbNearBlack(correctedDominantRgb)) {
                                const correctedDistance = colorDistance(sourceDominantRgb, correctedDominantRgb)
                                if (!generatedDominantRgb || correctedDistance + 6 < currentDistance) {
                                    finalImageData = correctedImageData
                                }
                            }
                        }
                    }
                }

                if (inputPatchForFinalCheck && isExactlySameImageData(inputPatchForFinalCheck, finalImageData)) {
                    const unchangedError = locale === "zh"
                        ? "模型返回原图（该选区未被修改）"
                        : "Model returned original patch (selection unchanged)"
                    if (trackSelectionProgress) {
                        setSelectionProgress(imageId, selection.id, "failed", unchangedError)
                    }
                    failures.push(
                        locale === "zh"
                            ? `选区 #${index}: ${unchangedError}`
                            : `Selection #${index}: ${unchangedError}`
                    )
                    continue
                }
                if (trackSelectionProgress) {
                    setSelectionProgress(imageId, selection.id, "completed")
                }
                // Use the same selection reference used by this patch generation path
                // to avoid source/target crop mismatch that can squeeze glyphs.
                patches.push({ base64: finalImageData, selection: finalSelection })
                continue
            }

            const errorMessage = result?.error || (locale === "zh" ? "生成失败" : "Generation failed")
            if (trackSelectionProgress) {
                setSelectionProgress(imageId, selection.id, "failed", errorMessage)
            }
            failures.push(
                locale === "zh"
                    ? `选区 #${index}: ${getShortError(errorMessage)}`
                    : `Selection #${index}: ${getShortError(errorMessage)}`
            )
        }

        if (failures.length > 0) {
            throw new Error(failures.slice(0, 3).join("\n"))
        }

        return compositeMultiplePatches(
            composeBaseImg,
            patches,
            PATCH_CONTEXT_PADDING,
            PATCH_BLEND_PADDING
        )
    }

    const processSelectionsMaskMode = async (
        imageId: string,
        originalImg: HTMLImageElement,
        composeBaseImg: HTMLImageElement,
        sourceSelections: Selection[],
        effectivePrompt: string,
        updateToolbarProgress: boolean,
        trackSelectionProgress: boolean
    ) => {
        if (trackSelectionProgress) {
            initializeSelectionProgress(imageId, sourceSelections.map((selection) => selection.id))
            sourceSelections.forEach((selection) => setSelectionProgress(imageId, selection.id, "processing"))
        } else {
            clearSelectionProgress(imageId)
        }

        if (updateToolbarProgress) {
            setProgress(0)
            setProgressText("0/1")
            setProgressDetail(
                useReverseMaskMode
                    ? (locale === "zh" ? "反向遮罩模式请求中..." : "Inverse-mask request in progress...")
                    : (locale === "zh" ? "遮罩模式请求中..." : "Mask-mode request in progress...")
            )
        }

        const sourceColorSampler = createSelectionDominantTextColorSampler(originalImg)
        const selectionDominantColorMap = new Map<string, string>(
            sourceSelections
                .map((selection) => [selection.id, sourceColorSampler(selection)] as const)
                .filter((entry): entry is [string, string] => Boolean(entry[1]))
        )
        const maskPromptWithColorHints = selectionDominantColorMap.size
            ? [
                effectivePrompt,
                "",
                locale === "zh"
                    ? "【遮罩模式颜色锚点】请按以下选区主色保留文字颜色，不要统一黑字："
                    : "[Mask mode color anchors] Keep text colors by selection, do not normalize to black:",
                ...sourceSelections.slice(0, 24).map((selection, idx) => {
                    const color = selectionDominantColorMap.get(selection.id)
                    if (!color) {
                        return locale === "zh"
                            ? `${idx + 1}. 选区#${idx + 1}: 无稳定色样，保持原风格。`
                            : `${idx + 1}. Selection #${idx + 1}: no stable color sample, keep original style.`
                    }
                    return locale === "zh"
                        ? `${idx + 1}. 选区#${idx + 1} 主色≈${color}`
                        : `${idx + 1}. Selection #${idx + 1} dominant color≈${color}`
                }),
            ].join("\n")
            : effectivePrompt

        const inputImageData = sourceSelections.length
            ? (
                useReverseMaskMode
                    ? createInverseMaskedImage(originalImg, sourceSelections, "#ffffff", MASK_CONTEXT_PADDING)
                    : createMaskedImage(originalImg, sourceSelections, "#ffffff", MASK_CONTEXT_PADDING)
            )
            : imageToDataUrl(originalImg)

        const result = await runGenerateRequestWithRetry(
            inputImageData,
            maskPromptWithColorHints,
            resolveRetryLimit()
        )

        if (!result.success || !result.imageData) {
            if (trackSelectionProgress) {
                sourceSelections.forEach((selection) =>
                    setSelectionProgress(imageId, selection.id, "failed", result.error || "生成失败")
                )
            }
            throw new Error(result.error || "生成失败")
        }

        if (isExactlySameImageData(inputImageData, result.imageData)) {
            const unchangedError = locale === "zh"
                ? "模型返回原图（未修改选区）"
                : "Model returned original image (selections unchanged)"
            if (trackSelectionProgress) {
                sourceSelections.forEach((selection) =>
                    setSelectionProgress(imageId, selection.id, "failed", unchangedError)
                )
            }
            throw new Error(unchangedError)
        }

        const resultImage = await loadImage(result.imageData)
        const resultLongEdge = Math.max(resultImage.width, resultImage.height)
        const inputLongEdge = Math.max(originalImg.width, originalImg.height)
        if ((settings.imageSize || "2K") === "4K") {
            toast.info(
                locale === "zh"
                    ? `本次返回分辨率：${resultImage.width}x${resultImage.height}`
                    : `Generated resolution: ${resultImage.width}x${resultImage.height}`
            )
        }
        if (inputLongEdge >= FOUR_K_LONG_EDGE && resultLongEdge < FOUR_K_LONG_EDGE) {
            toast.warning(
                locale === "zh"
                    ? `当前模型返回分辨率约 ${resultImage.width}x${resultImage.height}（低于 4K），可能导致文本边缘发糊。`
                    : `Generated resolution is ${resultImage.width}x${resultImage.height} (below 4K), which may blur text edges.`
            )
        }

        if (sourceSelections.length > 0) {
            const originalDarkRatio = getSelectionDarkRatio(originalImg, sourceSelections)
            const resultDarkRatio = getSelectionDarkRatio(resultImage, sourceSelections)
            const suspiciousBlank =
                originalDarkRatio > 0.008 &&
                resultDarkRatio < originalDarkRatio * 0.2

            if (suspiciousBlank) {
                if (updateToolbarProgress) {
                    setProgressDetail(
                        locale === "zh"
                            ? "检测到遮罩结果疑似留白，自动切换分片模式重试..."
                            : "Detected likely blank mask result, retrying in patch mode..."
                    )
                }
                toast.warning(
                    locale === "zh"
                        ? `${useReverseMaskMode ? "反向" : ""}遮罩模式疑似留白，已自动切换分片模式重试。`
                        : `${useReverseMaskMode ? "Inverse-" : ""}mask mode looked blank; retried automatically with patch mode.`
                )
                return processSelectionsPatchMode(
                    imageId,
                    originalImg,
                    composeBaseImg,
                    sourceSelections,
                    effectivePrompt,
                    updateToolbarProgress,
                    trackSelectionProgress
                )
            }
        }

        let colorAdjustedResultData = result.imageData
        if (sourceSelections.length > 0) {
            if (selectionDominantColorMap.size > 0) {
                if (updateToolbarProgress) {
                    setProgress(72)
                    setProgressText("1/2")
                    setProgressDetail(
                        locale === "zh"
                            ? "遮罩结果处理中：执行文字颜色校正..."
                            : "Mask result post-processing: applying text color correction..."
                    )
                }

                for (let i = 0; i < sourceSelections.length; i++) {
                    const selection = sourceSelections[i]
                    const sourceDominantColor = selectionDominantColorMap.get(selection.id)
                    if (!sourceDominantColor) continue

                    const sourceDominantRgb = hexToRgb(sourceDominantColor)
                    if (!sourceDominantRgb || !isRgbChromatic(sourceDominantRgb)) continue

                    const currentFullResultImage = await loadImage(colorAdjustedResultData)
                    const sourcePatch = cropSelection(originalImg, selection, PATCH_CONTEXT_PADDING)
                    const generatedPatch = cropSelection(currentFullResultImage, selection, PATCH_CONTEXT_PADDING)

                    const generatedDominantColor = await getDominantTextColorFromPatch(generatedPatch)
                    const generatedDominantRgb = generatedDominantColor ? hexToRgb(generatedDominantColor) : null
                    const currentDistance = generatedDominantRgb
                        ? colorDistance(sourceDominantRgb, generatedDominantRgb)
                        : Number.POSITIVE_INFINITY
                    const needColorCorrection =
                        !generatedDominantRgb ||
                        isRgbNearBlack(generatedDominantRgb) ||
                        currentDistance > 120

                    if (!needColorCorrection) continue

                    const correctedPatch = await tintChangedDarkTextToColor(
                        sourcePatch,
                        generatedPatch,
                        sourceDominantColor
                    )
                    if (!correctedPatch) continue

                    const correctedDominantColor = await getDominantTextColorFromPatch(correctedPatch)
                    const correctedDominantRgb = correctedDominantColor ? hexToRgb(correctedDominantColor) : null
                    if (!correctedDominantRgb || isRgbNearBlack(correctedDominantRgb)) continue

                    const correctedDistance = colorDistance(sourceDominantRgb, correctedDominantRgb)
                    if (generatedDominantRgb && correctedDistance + 6 >= currentDistance) continue

                    colorAdjustedResultData = await compositeImage(
                        currentFullResultImage,
                        correctedPatch,
                        selection,
                        PATCH_CONTEXT_PADDING,
                        PATCH_BLEND_PADDING
                    )

                    if (updateToolbarProgress) {
                        const progressBase = 72
                        const progressSpan = 22
                        const progressRatio = Math.max(0, Math.min(1, (i + 1) / Math.max(1, sourceSelections.length)))
                        setProgress(progressBase + progressSpan * progressRatio)
                        setProgressDetail(
                            locale === "zh"
                                ? `遮罩结果颜色校正 ${i + 1}/${sourceSelections.length}`
                                : `Mask color correction ${i + 1}/${sourceSelections.length}`
                        )
                    }
                }
            } else if (updateToolbarProgress) {
                setProgress(90)
                setProgressText("1/2")
                setProgressDetail(
                    locale === "zh"
                        ? "遮罩结果处理中：未提取到稳定颜色样本，跳过颜色校正。"
                        : "Mask post-processing: no stable color sample found, skipped color correction."
                )
            }
        }

        if (trackSelectionProgress) {
            sourceSelections.forEach((selection) => setSelectionProgress(imageId, selection.id, "completed"))
        }

        if (updateToolbarProgress) {
            setProgress(100)
            setProgressText("1/1")
            setProgressDetail(
                useReverseMaskMode
                    ? (locale === "zh" ? "反向遮罩模式处理完成" : "Inverse-mask processing complete")
                    : (locale === "zh" ? "遮罩模式处理完成" : "Mask-mode processing complete")
            )
        }

        if (!sourceSelections.length) {
            return colorAdjustedResultData
        }

        return compositeSelectionsFromFullImage(
            composeBaseImg,
            colorAdjustedResultData,
            sourceSelections,
            MASK_BLEND_PADDING
        )
    }

    const processImage = async (
        imageId: string,
        imageUrl: string,
        outputBaseUrl: string | null | undefined,
        sourceSelections: Selection[],
        existingDetectedBlocks: DetectedTextBlock[],
        basePrompt: string,
        updateToolbarProgress: boolean,
        showPretranslateFailureToast: boolean
    ) => {
        const originalImg = await loadImage(imageUrl)
        let composeBaseImg = originalImg
        if (outputBaseUrl) {
            const baseImage = await loadImage(outputBaseUrl)
            if (baseImage.width !== originalImg.width || baseImage.height !== originalImg.height) {
                throw new Error(
                    locale === "zh"
                        ? "image-only 底图尺寸与原图不一致，请使用同分辨率图片。"
                        : "Image-only base dimensions do not match the source image."
                )
            }
            composeBaseImg = baseImage
        }
        const englishTarget = directionMeta.targetLangCode === "en"
        const promptWithEnglishAssist = englishTarget
            ? [
                basePrompt,
                "",
                "English rendering quality rules:",
                "1) Keep text fully inside bubble bounds with balanced line breaks.",
                "2) Avoid overflow and tiny fonts. Prioritize readability for scanlation style.",
                "3) Preserve original text color first; only increase outline/stroke contrast when needed.",
            ].join("\n")
            : basePrompt
        const fullSelection: Selection = {
            id: `${imageId}-full`,
            x: 0,
            y: 0,
            width: originalImg.width,
            height: originalImg.height,
        }

        const hasUserSelections = sourceSelections.length > 0
        const effectiveSelections = hasUserSelections ? sourceSelections : [fullSelection]

        if (outputBaseUrl && !hasUserSelections && updateToolbarProgress) {
            toast.warning(
                locale === "zh"
                    ? "当前未框选选区：将执行整图重绘，结果会覆盖到底图上。"
                    : "No selections found: full-image repaint will be composited onto the base image."
            )
        }

        const pretranslateContext = await buildPretranslateContextPrompt(
            imageId,
            originalImg,
            hasUserSelections ? sourceSelections : [],
            promptWithEnglishAssist,
            updateToolbarProgress,
            showPretranslateFailureToast,
            existingDetectedBlocks
        )

        if (useMaskMode) {
            return processSelectionsMaskMode(
                imageId,
                originalImg,
                composeBaseImg,
                hasUserSelections ? sourceSelections : [],
                pretranslateContext.prompt,
                updateToolbarProgress,
                hasUserSelections
            )
        }

        return processSelectionsPatchMode(
            imageId,
            originalImg,
            composeBaseImg,
            effectiveSelections,
            pretranslateContext.prompt,
            updateToolbarProgress,
            hasUserSelections
        )
    }

    const processImageWithRepairMask = async (
        imageId: string,
        imageUrl: string,
        repairMaskUrl: string,
        basePrompt: string,
        updateToolbarProgress: boolean
    ) => {
        const originalImg = await loadImage(imageUrl)
        const useLamaRepair = repairEngine === "lama"
        if (updateToolbarProgress) {
            setProgress(10)
            setProgressText("1/2")
            setProgressDetail(
                useLamaRepair
                    ? (locale === "zh" ? "请求 LAMA 修复服务..." : "Requesting LAMA inpaint service...")
                    : (locale === "zh" ? "按画笔掩膜准备修复输入..." : "Preparing repair image from brush mask...")
            )
        }

        const result = useLamaRepair
            ? await runLamaInpaintRequest(
                await imageToDataUrl(originalImg),
                repairMaskUrl
            )
            : await (async () => {
                const maskedInput = await createImageWithBrushMaskFilled(originalImg, repairMaskUrl, "#ffffff")
                const repairPrompt = [
                    basePrompt,
                    "",
                    locale === "zh"
                        ? "【修复画笔模式】仅重绘白色掩膜区域，保持其他区域像素不变。"
                        : "[Repair brush mode] Repaint only white masked regions. Keep all other pixels unchanged.",
                    locale === "zh"
                        ? "必须保持原图分辨率、角色结构与背景透视，不要扩大修改范围。"
                        : "Keep original resolution, character structure and perspective. Do not expand edit area.",
                ].join("\n")
                return runGenerateRequestWithRetry(
                    maskedInput,
                    repairPrompt,
                    resolveRetryLimit()
                )
            })()

        if (!result.success || !result.imageData) {
            throw new Error(
                result.error ||
                (
                    useLamaRepair
                        ? (locale === "zh" ? "LAMA 修复失败" : "LAMA inpaint failed")
                        : (locale === "zh" ? "修复画笔生成失败" : "Repair brush generation failed")
                )
            )
        }

        if (updateToolbarProgress) {
            setProgress(70)
            setProgressText("2/2")
            setProgressDetail(
                locale === "zh"
                    ? "正在将修复结果按像素掩膜回贴..."
                    : "Compositing repaired pixels with brush mask..."
            )
        }

        return compositeMaskedPixelsFromFullImage(
            originalImg,
            result.imageData,
            repairMaskUrl
        )
    }

    // 扣费并更新余额
    const deductCoins = async (amount: number): Promise<boolean> => {
        try {
            const res = await fetch("/api/user/coins", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "consume", amount }),
            })
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || "扣费失败")
            }
            return true
        } catch (error) {
            const msg = error instanceof Error ? error.message : "扣费失败"
            toast.error(msg)
            return false
        }
    }

    const logUsage = async (
        action: "generate" | "batch_generate" | "export",
        metadata: Record<string, unknown> = {}
    ) => {
        try {
            await fetch("/api/user/usage/log", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action,
                    metadata,
                }),
            })
        } catch (error) {
            console.warn("Log usage failed:", error)
        }
    }

    // 处理单张图片
    const handleGenerate = async () => {
        if (!currentImage) {
            toast.error(t.errors.noImage)
            return
        }

        // 检查 API 配置
        if (settings.useServerApi) {
            const COST_PER_GENERATION = 10
            const generationUnits = useMaskMode
                ? 1
                : Math.max(1, currentImage.selections.length || 0)
            const totalCost = COST_PER_GENERATION * generationUnits
            const deducted = await deductCoins(totalCost)
            if (!deducted) {
                return
            }
            toast.info(`已扣除 ${totalCost} Coins`)
        } else if (!settings.apiKey) {
            toast.error(t.errors.apiKeyRequired)
            return
        }

        if (!settings.useServerApi && settings.provider === "gemini" && settings.model && !settings.model.includes("image")) {
            toast.warning("当前 Gemini 模型可能不支持图像输出，建议使用 gemini-2.5-flash-image")
        }

        setProcessing(true)
        setImageStatus(currentImage.id, "processing")

        try {
            const basePrompt = buildHighQualityPrompt(buildMangaEditPrompt(prompt, {
                direction: settings.translationDirection,
                sourceLanguageAllowlist: settings.sourceLanguageAllowlist,
                comicType: settings.comicType,
                textStylePreset: settings.textStylePreset,
                preferredFontFamily: settings.preferredOutputFontFamily,
            }))
            const resultUrl = await processImage(
                currentImage.id,
                currentImage.originalUrl,
                currentImage.imageOnlyBaseUrl,
                currentImage.selections || [],
                currentImage.detectedTextBlocks || [],
                basePrompt,
                true,
                true
            )

            setImageStatus(currentImage.id, "completed", resultUrl)
            setShowResult(true)
            void logUsage("generate", {
                source: settings.useServerApi ? "server_api" : "custom_key",
                mode: activeMaskMode,
                selectionCount: currentImage.selections?.length || 0,
            })
            toast.success(t.common.success)
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "未知错误"
            console.error("Single image generate failed:", {
                provider: settings.provider,
                model: settings.model,
                error,
            })
            setImageStatus(currentImage.id, "failed", undefined, errorMessage)
            toast.error(t.errors.generateFailed + ": " + getShortError(errorMessage), { duration: 8000 })
        } finally {
            setProcessing(false)
            setProgress(0)
            setProgressText("")
            setProgressDetail("")
        }
    }

    const handleUpscaleOnly = async () => {
        if (!currentImage) {
            toast.error(t.errors.noImage)
            return
        }

        const requiresUserApiKey = repairEngine !== "lama"

        if (settings.useServerApi) {
            const COST_PER_GENERATION = 10
            const deducted = await deductCoins(COST_PER_GENERATION)
            if (!deducted) {
                return
            }
            toast.info(`已扣除 ${COST_PER_GENERATION} Coins`)
        } else if (requiresUserApiKey && !settings.apiKey) {
            toast.error(t.errors.apiKeyRequired)
            return
        }

        setProcessing(true)
        setImageStatus(currentImage.id, "processing")

        try {
            const inputUrl = (showResult && currentImage.resultUrl) ? currentImage.resultUrl : currentImage.originalUrl
            const sourceImage = await loadImage(inputUrl)
            const sourceImageData = imageToDataUrl(sourceImage)
            const upscalePrompt = [
                "Upscale and enhance image quality only.",
                "Do NOT translate, rewrite, remove, replace, or redraw any text.",
                "Keep all text glyphs, language, layout, and bubbles exactly unchanged.",
                "Improve sharpness, reduce noise/compression artifacts, and preserve original style.",
                "Output image only.",
            ].join("\n")

            const result = await runGenerateRequestWithRetry(
                sourceImageData,
                upscalePrompt,
                resolveRetryLimit(1)
            )
            if (!result.success || !result.imageData) {
                throw new Error(result.error || (locale === "zh" ? "超分失败" : "Upscale failed"))
            }

            setImageStatus(currentImage.id, "completed", result.imageData)
            setShowResult(true)
            toast.success(locale === "zh" ? "仅超分增强完成" : "Upscale-only completed")
            void logUsage("generate", {
                source: settings.useServerApi ? "server_api" : "custom_key",
                mode: "upscale_only",
            })
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "未知错误"
            setImageStatus(currentImage.id, "failed", undefined, errorMessage)
            toast.error((locale === "zh" ? "仅超分增强失败: " : "Upscale-only failed: ") + getShortError(errorMessage), { duration: 8000 })
        } finally {
            setProcessing(false)
            setProgress(0)
            setProgressText("")
            setProgressDetail("")
        }
    }

    // 批量处理所有图片
    const handleBatchGenerate = async () => {
        if (!settings.useServerApi && !settings.apiKey) {
            toast.error(t.errors.apiKeyRequired)
            return
        }

        const imagesToProcess = images.filter((img) => img.status !== "completed")
        if (imagesToProcess.length === 0) {
            toast.warning(locale === "zh" ? "没有需要处理的图片" : "No images to process")
            return
        }

        const templateSelections = applyToAll
            ? (currentImage?.selections || images.find((img) => img.selections?.length)?.selections || [])
            : []

        if (settings.useServerApi) {
            const COST_PER_GENERATION = 10
            const totalUnits = imagesToProcess.reduce((acc, img) => {
                const selections = applyToAll ? templateSelections : (img.selections || [])
                const units = useMaskMode ? 1 : Math.max(1, selections.length || 0)
                return acc + units
            }, 0)
            const totalCost = COST_PER_GENERATION * Math.max(1, totalUnits)
            const deducted = await deductCoins(totalCost)
            if (!deducted) {
                return
            }
            toast.info(`已扣除 ${totalCost} Coins`)
        }

        setProcessing(true)
        setProgress(0)
        setProgressText(`0/${imagesToProcess.length}`)
        let failedCount = 0

        try {
            const highQualityMode = settings.highQualityMode ?? false
            const highQualityBatchSize = Math.max(1, Math.min(20, settings.highQualityBatchSize ?? 4))
            const highQualitySessionResetBatches = Math.max(1, Math.min(50, settings.highQualitySessionResetBatches ?? 3))
            const highQualityRpmLimit = Math.max(0, Math.min(300, settings.highQualityRpmLimit ?? 0))
            let nextRequestAt = 0
            const contextHistory: Array<{ detectedTextBlocks?: DetectedTextBlock[] }> = []

            const basePrompt = buildHighQualityPrompt(buildMangaEditPrompt(prompt, {
                direction: settings.translationDirection,
                sourceLanguageAllowlist: settings.sourceLanguageAllowlist,
                comicType: settings.comicType,
                textStylePreset: settings.textStylePreset,
                preferredFontFamily: settings.preferredOutputFontFamily,
            }))
            const chapterContextEnabled = (settings.chapterBulkTranslate ?? false) || highQualityMode
            if (chapterContextEnabled) {
                toast.info(
                    locale === "zh"
                        ? "已启用章节上下文一致性提示"
                        : "Chapter-level consistency context enabled"
                )
            }

            for (let i = 0; i < imagesToProcess.length; i++) {
                const img = imagesToProcess[i]
                if (highQualityMode) {
                    const resetWindow = highQualityBatchSize * highQualitySessionResetBatches
                    if (resetWindow > 0 && i > 0 && i % resetWindow === 0) {
                        contextHistory.splice(0, contextHistory.length)
                        setProgressDetail(
                            locale === "zh"
                                ? `已重置章节上下文记忆（第 ${Math.floor(i / highQualityBatchSize)} 批）`
                                : `Context memory reset at batch ${Math.floor(i / highQualityBatchSize)}`
                        )
                    }
                }

                setImageStatus(img.id, "processing")
                setProgress((i / imagesToProcess.length) * 100)
                setProgressText(`${i}/${imagesToProcess.length}`)
                setProgressDetail(
                    locale === "zh"
                        ? `处理中第 ${i + 1} 张图...`
                        : `Processing image ${i + 1}...`
                )

                try {
                    if (highQualityMode && highQualityRpmLimit > 0) {
                        const minInterval = Math.ceil(60000 / highQualityRpmLimit)
                        const waitMs = Math.max(0, nextRequestAt - Date.now())
                        if (waitMs > 0) {
                            await new Promise((resolve) => setTimeout(resolve, waitMs))
                        }
                        nextRequestAt = Date.now() + minInterval
                    }

                    const selections = applyToAll ? templateSelections : (img.selections || [])
                    const chapterPrompt = chapterContextEnabled
                        ? buildChapterBulkPrompt(
                            basePrompt,
                            highQualityMode
                                ? contextHistory.slice(-highQualityBatchSize)
                                : imagesToProcess
                        )
                        : basePrompt
                    const resultUrl = await processImage(
                        img.id,
                        img.originalUrl,
                        img.imageOnlyBaseUrl,
                        selections,
                        img.detectedTextBlocks || [],
                        chapterPrompt,
                        false,
                        false
                    )
                    setImageStatus(img.id, "completed", resultUrl)
                    void logUsage("batch_generate", {
                        source: settings.useServerApi ? "server_api" : "custom_key",
                        mode: activeMaskMode,
                        selectionCount: selections.length,
                    })

                    if (highQualityMode) {
                        const latestImage = useEditorStore
                            .getState()
                            .images.find((item) => item.id === img.id)
                        contextHistory.push({
                            detectedTextBlocks: latestImage?.detectedTextBlocks || img.detectedTextBlocks || [],
                        })
                    }
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : "未知错误"
                    failedCount++
                    console.error("Batch image generate failed:", {
                        imageId: img.id,
                        provider: settings.provider,
                        model: settings.model,
                        error,
                    })
                    setImageStatus(img.id, "failed", undefined, errorMessage)
                }

                setProgress(((i + 1) / imagesToProcess.length) * 100)
                setProgressText(`${i + 1}/${imagesToProcess.length}`)
            }

            if (failedCount > 0) {
                toast.error(
                    locale === "zh"
                        ? `完成 ${imagesToProcess.length} 张，其中失败 ${failedCount} 张。`
                        : `Finished ${imagesToProcess.length} images, ${failedCount} failed.`,
                    { duration: 8000 }
                )
            } else {
                toast.success(
                    locale === "zh"
                        ? `处理完成 ${imagesToProcess.length} 张图片`
                        : `Processed ${imagesToProcess.length} images`
                )
            }
        } finally {
            setProcessing(false)
            setProgress(0)
            setProgressText("")
            setProgressDetail("")
        }
    }

    const buildExportFilename = (baseName: string) => {
        const ext = getFileExtension(settings.exportFormat)
        return `${baseName}.${ext}`
    }

    const stripFileExtension = (filename: string) => {
        const dotIndex = filename.lastIndexOf(".")
        if (dotIndex <= 0) return filename
        return filename.slice(0, dotIndex)
    }

    const toExportDataUrl = async (dataUrl: string) => {
        if (settings.exportFormat === "png") return dataUrl
        return convertToFormat(dataUrl, settings.exportFormat, settings.exportQuality)
    }

    // 下载当前结果
    const handleDownloadResult = async () => {
        if (!currentImage?.resultUrl) return
        try {
            const exported = await toExportDataUrl(currentImage.resultUrl)
            downloadImage(exported, buildExportFilename(`result-${Date.now()}`))
            void logUsage("export", { type: "single", format: settings.exportFormat })
        } catch (error) {
            toast.error(
                locale === "zh"
                    ? `导出失败：${error instanceof Error ? error.message : "未知错误"}`
                    : `Export failed: ${error instanceof Error ? error.message : "Unknown error"}`
            )
        }
    }

    // 一键机翻：自动检测文本框 + 自动生成
    const handleOneClickMachineTranslate = async () => {
        if (!currentImage) {
            toast.error(t.errors.noImage)
            return
        }

        if (!settings.useServerApi && !settings.apiKey) {
            toast.error(t.errors.apiKeyRequired)
            return
        }

        if (!settings.useServerApi && settings.provider === "gemini" && settings.model && !settings.model.includes("image")) {
            toast.warning("当前 Gemini 模型可能不支持图像输出，建议使用 gemini-2.5-flash-image")
        }

        setProcessing(true)
        setImageStatus(currentImage.id, "processing")
        setProgress(0)
        setProgressText("0/2")
        setProgressDetail(locale === "zh" ? "正在自动检测文本..." : "Detecting text blocks...")

        try {
            const originalImg = await loadImage(currentImage.originalUrl)
            const detectResult = await runDetectTextRequest(
                imageToDataUrl(originalImg),
                getTargetLanguageForDetection(),
                currentImage.selections || [],
                originalImg.width,
                originalImg.height
            )

            if (!detectResult.success) {
                throw new Error(detectResult.error || (locale === "zh" ? "自动检测失败" : "Auto-detection failed"))
            }

            const detectedBlocks = detectResult.blocks || []
            const detectedSelections = blocksToSelections(
                detectedBlocks,
                originalImg.width,
                originalImg.height,
                "one-click"
            )

            if (detectedSelections.length > 0) {
                updateSelections(currentImage.id, detectedSelections)
            } else {
                clearSelectionProgress(currentImage.id)
            }
            setDetectedTextBlocks(currentImage.id, applyDefaultOrientationToBlocks(detectedBlocks))

            if (settings.useServerApi) {
                const COST_PER_GENERATION = 10
                const generationUnits = useMaskMode ? 1 : Math.max(1, detectedSelections.length || 0)
                const totalCost = COST_PER_GENERATION * generationUnits
                const deducted = await deductCoins(totalCost)
                if (!deducted) {
                    setImageStatus(currentImage.id, "idle")
                    return
                }
                toast.info(`已扣除 ${totalCost} Coins`)
            }

            setProgress(50)
            setProgressText("1/2")
            setProgressDetail(
                locale === "zh"
                    ? `检测完成，命中 ${detectedSelections.length} 个选区，开始生成...`
                    : `Detected ${detectedSelections.length} selections, generating...`
            )

            const basePrompt = buildHighQualityPrompt(buildMangaEditPrompt(prompt, {
                direction: settings.translationDirection,
                sourceLanguageAllowlist: settings.sourceLanguageAllowlist,
                comicType: settings.comicType,
                textStylePreset: settings.textStylePreset,
                preferredFontFamily: settings.preferredOutputFontFamily,
            }))

            const resultUrl = await processImage(
                currentImage.id,
                currentImage.originalUrl,
                currentImage.imageOnlyBaseUrl,
                detectedSelections,
                detectedBlocks,
                basePrompt,
                true,
                true
            )

            setImageStatus(currentImage.id, "completed", resultUrl)
            setShowResult(true)
            void logUsage("generate", {
                source: settings.useServerApi ? "server_api" : "custom_key",
                mode: activeMaskMode,
                selectionCount: detectedSelections.length,
                workflow: "one_click_mt",
            })
            toast.success(
                locale === "zh"
                    ? `一键机翻完成（${detectedSelections.length} 个选区）`
                    : `One-click translation completed (${detectedSelections.length} selections)`
            )
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "未知错误"
            setImageStatus(currentImage.id, "failed", undefined, errorMessage)
            toast.error(
                (locale === "zh" ? "一键机翻失败: " : "One-click translation failed: ") + getShortError(errorMessage),
                { duration: 8000 }
            )
        } finally {
            setProcessing(false)
            setProgress(0)
            setProgressText("")
            setProgressDetail("")
        }
    }

    const handleRepairBrushGenerate = async () => {
        if (!currentImage) {
            toast.error(t.errors.noImage)
            return
        }
        if (!isPatchEditorEnabled) {
            toast.warning(locale === "zh" ? "请先在侧栏启用修补编辑器" : "Enable repair editor in sidebar first")
            return
        }
        if (!currentImage.repairMaskUrl) {
            toast.warning(locale === "zh" ? "请先用修复画笔在画布上涂抹区域" : "Paint a repair mask on canvas first")
            return
        }

        if (settings.useServerApi) {
            const COST_PER_GENERATION = 10
            const deducted = await deductCoins(COST_PER_GENERATION)
            if (!deducted) {
                return
            }
            toast.info(`已扣除 ${COST_PER_GENERATION} Coins`)
        } else if (!settings.apiKey) {
            toast.error(t.errors.apiKeyRequired)
            return
        }

        setProcessing(true)
        setImageStatus(currentImage.id, "processing")

        try {
            const basePrompt = buildHighQualityPrompt(buildMangaEditPrompt(prompt, {
                direction: settings.translationDirection,
                sourceLanguageAllowlist: settings.sourceLanguageAllowlist,
                comicType: settings.comicType,
                textStylePreset: settings.textStylePreset,
                preferredFontFamily: settings.preferredOutputFontFamily,
            }))
            const resultUrl = await processImageWithRepairMask(
                currentImage.id,
                currentImage.originalUrl,
                currentImage.repairMaskUrl,
                basePrompt,
                true
            )
            setImageStatus(currentImage.id, "completed", resultUrl)
            clearRepairMask(currentImage.id)
            setShowResult(true)
            toast.success(locale === "zh" ? "修复画笔生成完成" : "Repair brush generation completed")
            void logUsage("generate", {
                source: settings.useServerApi ? "server_api" : "custom_key",
                mode: "repair_brush",
                repairEngine,
            })
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "未知错误"
            setImageStatus(currentImage.id, "failed", undefined, errorMessage)
            toast.error(
                (locale === "zh" ? "修复画笔生成失败: " : "Repair brush generation failed: ") + getShortError(errorMessage),
                { duration: 8000 }
            )
        } finally {
            setProcessing(false)
            setProgress(0)
            setProgressText("")
            setProgressDetail("")
        }
    }

    // 打包下载所有结果
    const handleDownloadAll = async () => {
        const completedImages = images.filter((img) => img.resultUrl)
        if (completedImages.length === 0) {
            toast.warning(locale === "zh" ? "没有可下载的结果" : "No results to download")
            return
        }

        try {
            const filesToDownload = await Promise.all(
                completedImages.map(async (img, index) => ({
                    name: buildExportFilename(`result-${index + 1}`),
                    dataUrl: await toExportDataUrl(img.resultUrl!),
                }))
            )

            await downloadImagesAsZip(filesToDownload)
            void logUsage("export", { type: "batch", count: completedImages.length, format: settings.exportFormat })
            toast.success(
                locale === "zh"
                    ? `已下载 ${completedImages.length} 张图片`
                    : `Downloaded ${completedImages.length} images`
            )
        } catch (error) {
            toast.error(
                locale === "zh"
                    ? `导出失败：${error instanceof Error ? error.message : "未知错误"}`
                    : `Export failed: ${error instanceof Error ? error.message : "Unknown error"}`
            )
        }
    }

    const handleDownloadPdf = async () => {
        const completedImages = images.filter((img) => img.resultUrl)
        if (completedImages.length === 0) {
            toast.warning(locale === "zh" ? "没有可导出的结果" : "No results to export")
            return
        }

        try {
            const filesToExport = await Promise.all(
                completedImages.map(async (img, index) => ({
                    name: img.file?.name || `result-${index + 1}`,
                    dataUrl: await toExportDataUrl(img.resultUrl!),
                }))
            )

            await downloadImagesAsPdf(
                filesToExport,
                `manga-lens-results-${Date.now()}.pdf`
            )
            void logUsage("export", { type: "pdf", count: completedImages.length, format: settings.exportFormat })
            toast.success(
                locale === "zh"
                    ? `已导出 PDF（${completedImages.length} 页）`
                    : `PDF exported (${completedImages.length} pages)`
            )
        } catch (error) {
            toast.error(
                locale === "zh"
                    ? `PDF 导出失败：${error instanceof Error ? error.message : "未知错误"}`
                    : `PDF export failed: ${error instanceof Error ? error.message : "Unknown error"}`
            )
        }
    }

    const handleDownloadCbz = async () => {
        const completedImages = images.filter((img) => img.resultUrl)
        if (completedImages.length === 0) {
            toast.warning(locale === "zh" ? "没有可导出的结果" : "No results to export")
            return
        }

        try {
            const filesToExport = await Promise.all(
                completedImages.map(async (img, index) => ({
                    name: buildExportFilename(`page-${String(index + 1).padStart(3, "0")}`),
                    dataUrl: await toExportDataUrl(img.resultUrl!),
                }))
            )
            await downloadImagesAsCbz(filesToExport, `manga-lens-results-${Date.now()}.cbz`)
            void logUsage("export", { type: "cbz", count: completedImages.length, format: settings.exportFormat })
            toast.success(
                locale === "zh"
                    ? `已导出 CBZ（${completedImages.length} 页）`
                    : `CBZ exported (${completedImages.length} pages)`
            )
        } catch (error) {
            toast.error(
                locale === "zh"
                    ? `CBZ 导出失败：${error instanceof Error ? error.message : "未知错误"}`
                    : `CBZ export failed: ${error instanceof Error ? error.message : "Unknown error"}`
            )
        }
    }

    const handleDownloadWithSidecar = async () => {
        const completedImages = images.filter((img) => img.resultUrl)
        if (completedImages.length === 0) {
            toast.warning(locale === "zh" ? "没有可导出的结果" : "No results to export")
            return
        }

        try {
            const entries = await Promise.all(
                completedImages.map(async (img, index) => {
                    const imageBaseName = stripFileExtension(img.file?.name || `result-${index + 1}`)
                    const imageName = buildExportFilename(imageBaseName)
                    const sidecarName = `${imageBaseName}.sidecar.json`
                    return {
                        imageName,
                        imageDataUrl: await toExportDataUrl(img.resultUrl!),
                        sidecarName,
                        sidecar: {
                            schemaVersion: 1,
                            exportedAt: new Date().toISOString(),
                            sourceFileName: img.file?.name || `result-${index + 1}`,
                            exportImageName: imageName,
                            prompt: prompt || "",
                            settings: {
                                translationDirection: settings.translationDirection,
                                comicType: settings.comicType,
                                textStylePreset: settings.textStylePreset,
                                imageSize: settings.imageSize,
                                provider: settings.provider,
                                model: settings.model,
                            },
                            selections: img.selections || [],
                            detectedTextBlocks: img.detectedTextBlocks || [],
                        },
                    }
                })
            )

            await downloadImagesWithSidecarZip(
                entries,
                `manga-lens-ps-sidecar-${Date.now()}.zip`
            )
            void logUsage("export", { type: "zip_sidecar", count: completedImages.length, format: settings.exportFormat })
            toast.success(
                locale === "zh"
                    ? `已导出图片+文本层 Sidecar（${completedImages.length} 项）`
                    : `Exported images + sidecar text layers (${completedImages.length} items)`
            )
        } catch (error) {
            toast.error(
                locale === "zh"
                    ? `Sidecar 导出失败：${error instanceof Error ? error.message : "未知错误"}`
                    : `Sidecar export failed: ${error instanceof Error ? error.message : "Unknown error"}`
            )
        }
    }

    const handleDownloadHtml = async () => {
        const completedImages = images.filter((img) => img.resultUrl)
        if (completedImages.length === 0) {
            toast.warning(locale === "zh" ? "没有可导出的结果" : "No results to export")
            return
        }

        try {
            await downloadImagesAsHtml(
                completedImages.map((img, index) => ({
                    name: img.file?.name || `result-${index + 1}`,
                    originalDataUrl: img.originalUrl,
                    resultDataUrl: img.resultUrl!,
                    selectionCount: img.selections?.length || 0,
                    prompt: prompt || undefined,
                })),
                `manga-lens-results-${Date.now()}.html`
            )
            void logUsage("export", { type: "html", count: completedImages.length })
            toast.success(
                locale === "zh"
                    ? `已导出 HTML（${completedImages.length} 张）`
                    : `HTML exported (${completedImages.length} images)`
            )
        } catch (error) {
            toast.error(
                locale === "zh"
                    ? `HTML 导出失败：${error instanceof Error ? error.message : "未知错误"}`
                    : `HTML export failed: ${error instanceof Error ? error.message : "Unknown error"}`
            )
        }
    }

    const handleMergeLayers = () => {
        if (!currentImage?.resultUrl) return
        mergeResultIntoOriginal(currentImage.id)
        toast.success(locale === "zh" ? "已应用为原图，可继续迭代编辑" : "Applied as original. You can keep editing.")
        void logUsage("export", { type: "merge_layers" })
    }

    const hasResult = currentImage?.resultUrl
    const hasCompletedImages = images.some((img) => img.resultUrl)

    return (
        <div className="h-14 border-b border-border glass flex items-center gap-3 px-4 overflow-hidden">
            {/* 左侧：视图切换 */}
            <div className="flex items-center gap-4 shrink-0 min-w-0">
                <Tabs
                    value={showResult ? "result" : "original"}
                    onValueChange={(value) => setShowResult(value === "result")}
                >
                    <TabsList>
                        <TabsTrigger value="original" disabled={!currentImage}>
                            {t.editor.toolbar.original}
                        </TabsTrigger>
                        <TabsTrigger value="result" disabled={!hasResult}>
                            {t.editor.toolbar.result}
                        </TabsTrigger>
                    </TabsList>
                </Tabs>

                {/* 进度条 */}
                {isProcessing && progressText && (
                    <div className="flex flex-col gap-1 min-w-[260px]">
                        <div className="flex items-center gap-2">
                            <Progress value={progress} className="h-2" />
                            <span className="text-sm text-muted-foreground">{progressText}</span>
                        </div>
                        {progressDetail && (
                            <span className="text-xs text-muted-foreground truncate">{progressDetail}</span>
                        )}
                    </div>
                )}
            </div>

            {/* 右侧：操作按钮 */}
            <div className="ml-auto min-w-0 flex-1 overflow-x-auto [scrollbar-width:thin]">
                <div className="flex w-max items-center gap-2 pl-2 pb-1 [&>*]:shrink-0">
                <Button
                    onClick={handleGenerate}
                    disabled={isProcessing || !currentImage}
                >
                    {isProcessing ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                        <Play className="h-4 w-4 mr-2" />
                    )}
                    {t.editor.toolbar.generate}
                </Button>

                <Button
                    variant="secondary"
                    onClick={handleOneClickMachineTranslate}
                    disabled={isProcessing || !currentImage}
                >
                    {isProcessing ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                        <Play className="h-4 w-4 mr-2" />
                    )}
                    {locale === "zh" ? "一键机翻" : "One-click MT"}
                </Button>

                <Button
                    variant="secondary"
                    onClick={handleUpscaleOnly}
                    disabled={isProcessing || !currentImage}
                >
                    {isProcessing ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                        <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    {locale === "zh" ? "仅超分增强" : "Upscale only"}
                </Button>

                {isPatchEditorEnabled && (
                    <Button
                        variant="secondary"
                        onClick={handleRepairBrushGenerate}
                        disabled={isProcessing || !currentImage?.repairMaskUrl}
                    >
                        {isProcessing ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <Brush className="h-4 w-4 mr-2" />
                        )}
                        {locale === "zh" ? "修复画笔生成" : "Repair Brush"}
                    </Button>
                )}

                <Button
                    variant="secondary"
                    onClick={handleBatchGenerate}
                    disabled={isProcessing || images.length === 0}
                >
                    {isProcessing ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                        <Play className="h-4 w-4 mr-2" />
                    )}
                    {t.editor.toolbar.batchGenerate}
                </Button>

                <Button
                    variant="outline"
                    onClick={handleMergeLayers}
                    disabled={!hasResult || isProcessing}
                >
                    <Layers2 className="h-4 w-4 mr-2" />
                    {locale === "zh" ? "应用为原图" : "Apply as original"}
                </Button>

                <Button
                    variant="outline"
                    onClick={handleDownloadResult}
                    disabled={!hasResult}
                >
                    <Download className="h-4 w-4 mr-2" />
                    {t.editor.toolbar.downloadResult}
                </Button>

                <Button
                    variant="outline"
                    onClick={handleDownloadAll}
                    disabled={!hasCompletedImages}
                >
                    <Package className="h-4 w-4 mr-2" />
                    {t.editor.toolbar.downloadAll}
                </Button>

                <Button
                    variant="outline"
                    onClick={handleDownloadPdf}
                    disabled={!hasCompletedImages}
                >
                    <FileText className="h-4 w-4 mr-2" />
                    PDF
                </Button>

                <Button
                    variant="outline"
                    onClick={handleDownloadCbz}
                    disabled={!hasCompletedImages}
                >
                    <FileArchive className="h-4 w-4 mr-2" />
                    CBZ
                </Button>

                <Button
                    variant="outline"
                    onClick={handleDownloadWithSidecar}
                    disabled={!hasCompletedImages}
                >
                    <FileJson2 className="h-4 w-4 mr-2" />
                    {locale === "zh" ? "PS Sidecar" : "PS Sidecar"}
                </Button>

                <Button
                    variant="outline"
                    onClick={handleDownloadHtml}
                    disabled={!hasCompletedImages}
                >
                    <FileCode2 className="h-4 w-4 mr-2" />
                    HTML
                </Button>
                </div>
            </div>
        </div>
    )
}

