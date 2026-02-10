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
} from "lucide-react"
import { getMessages } from "@/lib/i18n"
import { toast } from "sonner"
import {
    batchGenerateImages,
    buildMangaEditPrompt,
    detectTextBlocks,
    generateImage,
    type DetectTextResponse,
    type DetectedTextBlock,
    type GenerateImageResponse,
} from "@/lib/ai/ai-service"
import {
    loadImage,
    cropSelection,
    compositeMultiplePatches,
    downloadImage,
    downloadImagesAsZip,
    createMaskedImage,
    compositeSelectionsFromFullImage,
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
        initializeSelectionProgress,
        setSelectionProgress,
        clearSelectionProgress,
        setDetectedTextBlocks,
        clearDetectedTextBlocks,
        setProcessing,
    } = useEditorStore()

    const currentImage = useCurrentImage()
    const t = getMessages(locale)

    const [progress, setProgress] = useState(0)
    const [progressText, setProgressText] = useState("")
    const [progressDetail, setProgressDetail] = useState("")
    const PATCH_PADDING = 20
    const useMaskMode = settings.useMaskMode ?? true
    const enablePretranslate = settings.enablePretranslate ?? false

    const parseApiError = async (res: Response, fallback: string) => {
        const data = await res.json().catch(() => ({}))
        return data?.error || `${fallback} (${res.status})`
    }

    const runGenerateRequest = async (imageData: string, promptText: string): Promise<GenerateImageResponse> => {
        if (!settings.useServerApi) {
            return generateImage({
                imageData,
                prompt: promptText,
                config: settings,
            })
        }

        try {
            const res = await fetch("/api/ai/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    imageData,
                    prompt: promptText,
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

    const runDetectTextRequest = async (
        imageData: string,
        targetLanguage: string
    ): Promise<DetectTextResponse> => {
        if (!settings.useServerApi) {
            return detectTextBlocks({
                imageData,
                config: {
                    provider: settings.provider,
                    apiKey: settings.apiKey,
                    baseUrl: settings.baseUrl,
                    model: settings.model,
                },
                targetLanguage,
            })
        }

        try {
            const res = await fetch("/api/ai/detect-text", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    imageData,
                    targetLanguage,
                }),
            })

            if (!res.ok) {
                return {
                    success: false,
                    blocks: [],
                    error: await parseApiError(res, locale === "zh" ? "网站 API 文本检测失败" : "Server text detection failed"),
                }
            }

            const data = await res.json()
            return {
                success: true,
                blocks: data.blocks || [],
            }
        } catch (error) {
            return {
                success: false,
                blocks: [],
                error: error instanceof Error ? error.message : (locale === "zh" ? "网站 API 文本检测失败" : "Server text detection failed"),
            }
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

    const buildPretranslateContextPrompt = async (
        imageId: string,
        originalImg: HTMLImageElement,
        selections: Selection[],
        basePrompt: string,
        updateToolbarProgress: boolean,
        showFailureToast: boolean,
        existingDetectedBlocks: DetectedTextBlock[] = []
    ) => {
        const canRunPretranslate = settings.useServerApi || Boolean(settings.apiKey)
        let allBlocks: DetectedTextBlock[] = existingDetectedBlocks

        if (enablePretranslate && canRunPretranslate) {
            if (updateToolbarProgress) {
                setProgressDetail(locale === "zh" ? "视觉模型预翻译中..." : "Running vision pre-translation...")
            }

            const detectResult = await runDetectTextRequest(
                imageToDataUrl(originalImg),
                "简体中文"
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
            return basePrompt
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
            return basePrompt
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

        const lines = scopedBlocks.slice(0, 20).map((block: DetectedTextBlock, index) => (
            `${index + 1}. 原文: ${block.sourceText || "(空)"} | 译文: ${block.translatedText || "(空)"} | `
            + `bbox: x=${block.bbox.x.toFixed(3)}, y=${block.bbox.y.toFixed(3)}, `
            + `w=${block.bbox.width.toFixed(3)}, h=${block.bbox.height.toFixed(3)}`
        ))

        return [
            basePrompt,
            "",
            "以下是视觉模型预翻译结果（可用于保持台词内容与位置）：",
            ...lines,
            "请优先遵循以上翻译与布局信息。",
        ].join("\n")
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
        const inputPatchBySelection = new Map(
            indexedSelections.map(({ selection }) => [
                selection.id,
                cropSelection(originalImg, selection, PATCH_PADDING),
            ])
        )

        const total = selections.length
        if (updateToolbarProgress) {
            setProgress(0)
            setProgressText(`0/${total}`)
            setProgressDetail(locale === "zh" ? `准备处理 ${total} 个选区...` : `Preparing ${total} selections...`)
        }

        const results = new Map<string, GenerateImageResponse>()
        if (settings.useServerApi) {
            for (let completed = 0; completed < indexedSelections.length; completed++) {
                const { selection } = indexedSelections[completed]
                if (trackSelectionProgress) {
                    setSelectionProgress(imageId, selection.id, "processing")
                }
                if (updateToolbarProgress) {
                    const selectionNo = selectionIndexMap.get(selection.id) ?? 0
                    setProgress((completed / total) * 100)
                    setProgressText(`${completed}/${total}`)
                    setProgressDetail(
                        locale === "zh"
                            ? `正在处理选区 #${selectionNo}/${total}`
                            : `Processing selection #${selectionNo}/${total}`
                    )
                }

                const result = await runGenerateRequest(
                    inputPatchBySelection.get(selection.id) || cropSelection(originalImg, selection, PATCH_PADDING),
                    effectivePrompt
                )
                results.set(selection.id, result)

                if (updateToolbarProgress) {
                    const selectionNo = selectionIndexMap.get(selection.id) ?? 0
                    setProgress(((completed + 1) / total) * 100)
                    setProgressText(`${completed + 1}/${total}`)
                    setProgressDetail(
                        locale === "zh"
                            ? `已完成选区 #${selectionNo}（${completed + 1}/${total}）`
                            : `Completed selection #${selectionNo} (${completed + 1}/${total})`
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
        } else {
                const requests = indexedSelections.map(({ selection }) => ({
                imageId: selection.id,
                request: {
                    imageData: inputPatchBySelection.get(selection.id) || cropSelection(originalImg, selection, PATCH_PADDING),
                    prompt: effectivePrompt,
                    config: settings,
                },
            }))
            const batchResults = await batchGenerateImages(requests, {
                isSerial: settings.isSerial,
                concurrency: settings.isSerial ? 1 : Math.max(1, settings.concurrency || 1),
                maxRetries: 2,
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

        for (const { selection, index } of indexedSelections) {
            const result = results.get(selection.id)
            if (result?.success && result.imageData) {
                const sourcePatch = inputPatchBySelection.get(selection.id)
                if (sourcePatch && isExactlySameImageData(sourcePatch, result.imageData)) {
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
                patches.push({ base64: result.imageData, selection })
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

        return compositeMultiplePatches(originalImg, patches, PATCH_PADDING)
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
            setProgressDetail(locale === "zh" ? "遮罩模式请求中..." : "Mask-mode request in progress...")
        }

        const inputImageData = sourceSelections.length
            ? createMaskedImage(originalImg, sourceSelections, "#ffffff", PATCH_PADDING)
            : imageToDataUrl(originalImg)

        const result = await runGenerateRequest(inputImageData, effectivePrompt)

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

        if (trackSelectionProgress) {
            sourceSelections.forEach((selection) => setSelectionProgress(imageId, selection.id, "completed"))
        }

        if (updateToolbarProgress) {
            setProgress(100)
            setProgressText("1/1")
            setProgressDetail(locale === "zh" ? "遮罩模式处理完成" : "Mask-mode processing complete")
        }

        if (!sourceSelections.length) {
            return result.imageData
        }

        return compositeSelectionsFromFullImage(originalImg, result.imageData, sourceSelections)
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

        const promptWithContext = await buildPretranslateContextPrompt(
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
                promptWithContext,
                updateToolbarProgress,
                hasUserSelections
            )
        }

        return processSelectionsPatchMode(
            imageId,
            originalImg,
            effectiveSelections,
            promptWithContext,
            updateToolbarProgress,
            hasUserSelections
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
            const basePrompt = buildMangaEditPrompt(prompt)
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
                mode: useMaskMode ? "mask" : "patch",
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
            const basePrompt = buildMangaEditPrompt(prompt)

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
                        mode: useMaskMode ? "mask" : "patch",
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

    // 下载当前结果
    const handleDownloadResult = () => {
        if (!currentImage?.resultUrl) return
        downloadImage(currentImage.resultUrl, `result-${Date.now()}.png`)
        void logUsage("export", { type: "single" })
    }

    // 打包下载所有结果
    const handleDownloadAll = async () => {
        const completedImages = images.filter((img) => img.resultUrl)
        if (completedImages.length === 0) {
            toast.warning(locale === "zh" ? "没有可下载的结果" : "No results to download")
            return
        }

        const filesToDownload = completedImages.map((img, index) => ({
            name: `result-${index + 1}.png`,
            dataUrl: img.resultUrl!,
        }))

        await downloadImagesAsZip(filesToDownload)
        void logUsage("export", { type: "batch", count: completedImages.length })
        toast.success(
            locale === "zh"
                ? `已下载 ${completedImages.length} 张图片`
                : `Downloaded ${completedImages.length} images`
        )
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
            </div>
        </div>
    )
}
