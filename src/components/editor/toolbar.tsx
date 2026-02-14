"use client"

import { useState } from "react"
import { useEditorStore, useCurrentImage } from "@/lib/stores/editor-store"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import {
    Play,
    Download,
    Package,
    Loader2,
    FileCode2,
    Layers2,
    Brush,
} from "lucide-react"
import { getMessages } from "@/lib/i18n"
import { toast } from "sonner"
import {
    batchGenerateImages,
    buildMangaEditPrompt,
    detectTextBlocks,
    generateImage,
    getTranslationDirectionMeta,
    type DetectTextResponse,
    type DetectedTextBlock,
    type GenerateImageResponse,
} from "@/lib/ai/ai-service"
import {
    loadImage,
    cropSelection,
    cropSelectionWithClearedArea,
    compositeMultiplePatches,
    convertToFormat,
    getFileExtension,
    downloadImage,
    downloadImagesAsZip,
    downloadImagesAsHtml,
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
    const MASK_BLEND_PADDING = 2
    const PATCH_DIFF_RETRY_THRESHOLD = 0.014
    const useMaskMode = settings.useMaskMode
    const useReverseMaskMode = settings.useReverseMaskMode ?? false
    const enablePretranslate = settings.enablePretranslate
    const activeMaskMode = useMaskMode
        ? (useReverseMaskMode ? "inverse-mask" : "mask")
        : "patch"
    const SAFE_DETECT_PAYLOAD_CHARS = 2_000_000
    const FOUR_K_LONG_EDGE = 3840

    const parseApiError = async (res: Response, fallback: string) => {
        const data = await res.json().catch(() => ({}))
        return data?.error || `${fallback} (${res.status})`
    }

    const resolveRetryLimit = (extra: number = 0) =>
        Math.max(0, Math.min(8, (settings.maxRetries ?? 2) + extra))

    const getTargetLanguageForDetection = () => {
        const direction = settings.translationDirection ?? "ja2zh"
        if (direction === "ja2en") return "English"
        if (direction === "en2ja") return "日本語"
        return "简体中文"
    }

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

    const runDetectTextRequest = async (
        imageData: string,
        targetLanguage: string,
        imageWidth?: number,
        imageHeight?: number
    ): Promise<DetectTextResponse> => {
        const detectCandidates = settings.useServerApi
            ? await buildDetectPayloadCandidates(imageData, [
                { maxLongEdge: 3072, quality: 0.9, mimeType: "image/jpeg" },
                { maxLongEdge: 2560, quality: 0.86, mimeType: "image/jpeg" },
                { maxLongEdge: 2048, quality: 0.82, mimeType: "image/jpeg" },
                { maxLongEdge: 1600, quality: 0.78, mimeType: "image/jpeg" },
                { maxLongEdge: 1280, quality: 0.74, mimeType: "image/jpeg" },
                { maxLongEdge: 1024, quality: 0.7, mimeType: "image/jpeg" },
            ])
            : [imageData]

        if (!settings.useServerApi) {
            return detectTextBlocks({
                imageData: detectCandidates[0],
                config: {
                    provider: settings.provider,
                    apiKey: settings.apiKey,
                    baseUrl: settings.baseUrl,
                    model: settings.model,
                },
                targetLanguage,
            })
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
                    const canRetryWithSmallerPayload = res.status === 413 && i < detectCandidates.length - 1
                    if (canRetryWithSmallerPayload) {
                        continue
                    }
                    return {
                        success: false,
                        blocks: [],
                        error: parsedError,
                    }
                }

                const data = await res.json()
                return {
                    success: true,
                    blocks: data.blocks || [],
                }
            } catch (error) {
                lastError = error instanceof Error
                    ? error.message
                    : (locale === "zh" ? "网站 API 文本检测失败" : "Server text detection failed")
                if (i >= detectCandidates.length - 1) {
                    break
                }
            }
        }

        return {
            success: false,
            blocks: [],
            error: lastError,
        }
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
        let allBlocks: DetectedTextBlock[] = existingDetectedBlocks

        if (enablePretranslate && canRunPretranslate) {
            if (updateToolbarProgress) {
                setProgressDetail(locale === "zh" ? "视觉模型预翻译中..." : "Running vision pre-translation...")
            }

            const detectResult = await runDetectTextRequest(
                imageToDataUrl(originalImg),
                getTargetLanguageForDetection(),
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
            setDetectedTextBlocks(imageId, scopedBlocks)
        }

        if (updateToolbarProgress) {
            setProgressDetail(
                locale === "zh"
                    ? `预翻译完成，命中 ${scopedBlocks.length} 条文本`
                    : `Pre-translation ready: ${scopedBlocks.length} text blocks`
            )
        }

        const lines = scopedBlocks.slice(0, 20).map((block: DetectedTextBlock, index) => {
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
            "以下是视觉模型预翻译结果（可用于保持台词内容与位置）：",
            ...lines,
            "请优先遵循以上翻译与布局信息。",
            ].join("\n"),
        }
    }

    const processSelectionsPatchMode = async (
        imageId: string,
        originalImg: HTMLImageElement,
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

        const indexedSelections = selections.map((selection, index) => ({
            selection,
            index: index + 1,
        }))
        const selectionIndexMap = new Map(indexedSelections.map((item) => [item.selection.id, item.index]))
        const total = selections.length
        const hasManySelections = total >= 10
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
            return area < 16_000 || minEdge < 72 || aspectRatio >= 3.2
        }

        const buildSelectionPrompt = (selection: Selection, isHard: boolean) => {
            const isLikelyVertical = selection.height > selection.width * 1.25
            const isLikelyHorizontal = selection.width > selection.height * 1.25
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

            return [
                effectivePrompt,
                "",
                "【当前选区约束】",
                layoutHint,
                ...hardHints,
            ].join("\n")
        }

        const buildSelectionInput = (selection: Selection, isHard: boolean) => {
            if (isHard) {
                const adaptivePadding = PATCH_CONTEXT_PADDING + (hasManySelections ? 8 : 12)
                return cropSelectionWithClearedArea(
                    originalImg,
                    selection,
                    adaptivePadding,
                    "#ffffff",
                    1
                )
            }
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
                inputPatch: buildSelectionInput(selection, isHard),
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
                const finalImageData = result.imageData
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

                if (sourcePatch && isExactlySameImageData(sourcePatch, finalImageData)) {
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
                patches.push({ base64: finalImageData, selection })
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
            originalImg,
            patches,
            PATCH_CONTEXT_PADDING,
            PATCH_BLEND_PADDING
        )
    }

    const processSelectionsMaskMode = async (
        imageId: string,
        originalImg: HTMLImageElement,
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

        const inputImageData = sourceSelections.length
            ? (
                useReverseMaskMode
                    ? createInverseMaskedImage(originalImg, sourceSelections, "#ffffff", MASK_CONTEXT_PADDING)
                    : createMaskedImage(originalImg, sourceSelections, "#ffffff", MASK_CONTEXT_PADDING)
            )
            : imageToDataUrl(originalImg)

        const result = await runGenerateRequestWithRetry(
            inputImageData,
            effectivePrompt,
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
                    sourceSelections,
                    effectivePrompt,
                    updateToolbarProgress,
                    trackSelectionProgress
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
            return result.imageData
        }

        return compositeSelectionsFromFullImage(
            originalImg,
            result.imageData,
            sourceSelections,
            MASK_BLEND_PADDING
        )
    }

    const processImage = async (
        imageId: string,
        imageUrl: string,
        sourceSelections: Selection[],
        existingDetectedBlocks: DetectedTextBlock[],
        basePrompt: string,
        updateToolbarProgress: boolean,
        showPretranslateFailureToast: boolean
    ) => {
        const originalImg = await loadImage(imageUrl)
        const fullSelection: Selection = {
            id: `${imageId}-full`,
            x: 0,
            y: 0,
            width: originalImg.width,
            height: originalImg.height,
        }

        const hasUserSelections = sourceSelections.length > 0
        const effectiveSelections = hasUserSelections ? sourceSelections : [fullSelection]

        const pretranslateContext = await buildPretranslateContextPrompt(
            imageId,
            originalImg,
            hasUserSelections ? sourceSelections : [],
            basePrompt,
            updateToolbarProgress,
            showPretranslateFailureToast,
            existingDetectedBlocks
        )

        if (useMaskMode) {
            return processSelectionsMaskMode(
                imageId,
                originalImg,
                hasUserSelections ? sourceSelections : [],
                pretranslateContext.prompt,
                updateToolbarProgress,
                hasUserSelections
            )
        }

        return processSelectionsPatchMode(
            imageId,
            originalImg,
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
        if (updateToolbarProgress) {
            setProgress(10)
            setProgressText("1/2")
            setProgressDetail(
                locale === "zh"
                    ? "按画笔掩膜准备修复输入..."
                    : "Preparing repair image from brush mask..."
            )
        }

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

        const result = await runGenerateRequestWithRetry(
            maskedInput,
            repairPrompt,
            resolveRetryLimit()
        )

        if (!result.success || !result.imageData) {
            throw new Error(result.error || (locale === "zh" ? "修复画笔生成失败" : "Repair brush generation failed"))
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
            const basePrompt = buildMangaEditPrompt(prompt, {
                direction: settings.translationDirection,
                comicType: settings.comicType,
                textStylePreset: settings.textStylePreset,
            })
            const resultUrl = await processImage(
                currentImage.id,
                currentImage.originalUrl,
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
            const basePrompt = buildMangaEditPrompt(prompt, {
                direction: settings.translationDirection,
                comicType: settings.comicType,
                textStylePreset: settings.textStylePreset,
            })

            for (let i = 0; i < imagesToProcess.length; i++) {
                const img = imagesToProcess[i]
                setImageStatus(img.id, "processing")
                setProgress((i / imagesToProcess.length) * 100)
                setProgressText(`${i}/${imagesToProcess.length}`)
                setProgressDetail(
                    locale === "zh"
                        ? `处理中第 ${i + 1} 张图...`
                        : `Processing image ${i + 1}...`
                )

                try {
                    const selections = applyToAll ? templateSelections : (img.selections || [])
                    const resultUrl = await processImage(
                        img.id,
                        img.originalUrl,
                        selections,
                        img.detectedTextBlocks || [],
                        basePrompt,
                        false,
                        false
                    )
                    setImageStatus(img.id, "completed", resultUrl)
                    void logUsage("batch_generate", {
                        source: settings.useServerApi ? "server_api" : "custom_key",
                        mode: activeMaskMode,
                        selectionCount: selections.length,
                    })
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
            setDetectedTextBlocks(currentImage.id, detectedBlocks)

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

            const basePrompt = buildMangaEditPrompt(prompt, {
                direction: settings.translationDirection,
                comicType: settings.comicType,
                textStylePreset: settings.textStylePreset,
            })

            const resultUrl = await processImage(
                currentImage.id,
                currentImage.originalUrl,
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
            const basePrompt = buildMangaEditPrompt(prompt, {
                direction: settings.translationDirection,
                comicType: settings.comicType,
                textStylePreset: settings.textStylePreset,
            })
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
        toast.success(locale === "zh" ? "已合并图层，可继续编辑" : "Layers merged, continue editing")
        void logUsage("export", { type: "merge_layers" })
    }

    const hasResult = currentImage?.resultUrl
    const hasCompletedImages = images.some((img) => img.resultUrl)

    return (
        <div className="h-14 border-b border-border glass flex items-center justify-between px-4">
            {/* 左侧：视图切换 */}
            <div className="flex items-center gap-4">
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
            <div className="flex items-center gap-2">
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
                    {locale === "zh" ? "合并图层" : "Merge"}
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
                    onClick={handleDownloadHtml}
                    disabled={!hasCompletedImages}
                >
                    <FileCode2 className="h-4 w-4 mr-2" />
                    HTML
                </Button>
            </div>
        </div>
    )
}

