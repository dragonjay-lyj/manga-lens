"use client"

import { type ReactNode, useRef, useCallback, useEffect, useMemo, useState } from "react"
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
    Search,
    Trash2,
    ImagePlus,
} from "lucide-react"
import { getMessages } from "@/lib/i18n"
import {
    detectTextBlocks,
    filterBlocksByAngleThreshold,
    filterLikelyFuriganaBlocks,
    GEMINI_MODELS,
    getDetectionTargetLanguageFromDirection,
    getSourceLanguageLabel,
    getTranslationDirectionMeta,
    OPENAI_MODELS,
    translateImageSentence,
    type DetectTextResponse,
    type SourceLanguageCode,
    type TextDetectionRegion,
    type TranslationDirection,
} from "@/lib/ai/ai-service"
import { translateTextBatch, type BatchTranslateItem } from "@/lib/ai/text-translate"
import { imageToDataUrl, loadImage } from "@/lib/utils/image-utils"
import { EDITOR_IMAGE_ACCEPT, expandEditorUploadFiles, normalizeEditorImageFiles } from "@/lib/utils/image-import"
import { convertChineseText, type ChineseConvertMode } from "@/lib/utils/chinese-convert"
import type { Selection } from "@/types/database"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { RechargePanel } from "@/components/profile/recharge-panel"
import { RichTextEditor } from "@/components/editor/rich-text-editor"
import {
    OPENAI_COMPATIBLE_PROVIDER_PRESETS,
    getOpenAICompatibleProviderPreset,
    guessOpenAICompatibleProviderPresetId,
} from "@/lib/ai/provider-presets"

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
    searchCorpus: string
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

const SOURCE_LANGUAGE_FILTER_OPTIONS: Array<{
    code: SourceLanguageCode
    shortLabel: string
    fullLabel: string
}> = [
    { code: "ja", shortLabel: "日", fullLabel: "日本語 / Japanese" },
    { code: "en", shortLabel: "英", fullLabel: "English" },
    { code: "th", shortLabel: "泰", fullLabel: "ไทย / Thai" },
    { code: "es", shortLabel: "西", fullLabel: "Español / Spanish" },
    { code: "ar", shortLabel: "阿", fullLabel: "العربية / Arabic" },
    { code: "id", shortLabel: "印尼", fullLabel: "Bahasa Indonesia" },
    { code: "hi", shortLabel: "印地", fullLabel: "हिन्दी / Hindi" },
    { code: "fi", shortLabel: "芬兰", fullLabel: "Suomi / Finnish" },
]

const SETTINGS_IMPORT_KEYS = [
    "provider",
    "baseUrl",
    "model",
    "imageSize",
    "concurrency",
    "isSerial",
    "maxRetries",
    "ocrEngine",
    "aiVisionOcrUseCustomConfig",
    "aiVisionOcrProvider",
    "aiVisionOcrApiKey",
    "aiVisionOcrBaseUrl",
    "aiVisionOcrModel",
    "translationDirection",
    "sourceLanguageAllowlist",
    "enableAngleFilter",
    "angleThreshold",
    "suppressFurigana",
    "autoTextColorAdapt",
    "bulkTextTranslateOcr",
    "enableStagedPipeline",
    "enableSlowGenerationFallbacks",
    "stripReasoningContent",
    "singleRetranslateDeepMode",
    "singleRetranslateContextWindow",
    "detectionRegionMode",
    "chapterBulkTranslate",
    "comicType",
    "textStylePreset",
    "preferredOutputFontFamily",
    "enableComicModule",
    "enableBubbleDetection",
    "enableSelectionOcr",
    "enablePatchEditor",
    "repairEngine",
    "defaultVerticalText",
    "useMaskMode",
    "useReverseMaskMode",
    "enablePretranslate",
    "highQualityMode",
    "highQualityBatchSize",
    "highQualitySessionResetBatches",
    "highQualityRpmLimit",
    "highQualityLowReasoning",
    "highQualityForceJson",
    "highQualityContextPrompt",
    "exportFormat",
    "exportQuality",
    "exportNamingMode",
    "exportSequenceStart",
    "useServerApi",
] as const

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

function plainTextToRichHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br/>")
}

export function EditorSidebar({ className }: EditorSidebarProps = {}) {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const folderInputRef = useRef<HTMLInputElement>(null)
    const imageOnlyBaseInputRef = useRef<HTMLInputElement>(null)
    const imageOnlyBaseBatchInputRef = useRef<HTMLInputElement>(null)
    const settingsImportInputRef = useRef<HTMLInputElement>(null)
    const sidecarImportInputRef = useRef<HTMLInputElement>(null)
    const wordImportInputRef = useRef<HTMLInputElement>(null)
    const textLayerImportInputRef = useRef<HTMLInputElement>(null)
    const ocrJsonImportInputRef = useRef<HTMLInputElement>(null)
    const findInputRef = useRef<HTMLInputElement>(null)
    const screenshotTranslateInputRef = useRef<HTMLInputElement>(null)
    const [isAutoDetecting, setIsAutoDetecting] = useState(false)
    const [isBatchAutoDetecting, setIsBatchAutoDetecting] = useState(false)
    const [isBatchTranslatingDetected, setIsBatchTranslatingDetected] = useState(false)
    const [batchStageProgressText, setBatchStageProgressText] = useState("")
    const [rechargeDialogOpen, setRechargeDialogOpen] = useState(false)
    const [manualJsonOpen, setManualJsonOpen] = useState(false)
    const [manualJsonInput, setManualJsonInput] = useState("")
    const [findText, setFindText] = useState("")
    const [replaceText, setReplaceText] = useState("")
    const [replaceScope, setReplaceScope] = useState<"translated" | "source" | "both">("translated")
    const [selectedBlockIndexes, setSelectedBlockIndexes] = useState<number[]>([])
    const [retranslatingBlockIndexes, setRetranslatingBlockIndexes] = useState<number[]>([])
    const [bulkTextValue, setBulkTextValue] = useState("")
    const [copiedBlocks, setCopiedBlocks] = useState<Array<{ sourceText: string; translatedText: string; richTextHtml?: string; bbox: { x: number; y: number; width: number; height: number }; style?: Record<string, unknown> }>>([])
    const [clearGalleryArmed, setClearGalleryArmed] = useState(false)
    const [sidecarPreviewOpen, setSidecarPreviewOpen] = useState(false)
    const [sidecarImportPlan, setSidecarImportPlan] = useState<SidecarImportPlan | null>(null)
    const [isPreparingSidecarImport, setIsPreparingSidecarImport] = useState(false)
    const [isApplyingSidecarImport, setIsApplyingSidecarImport] = useState(false)
    const [sidecarPreviewKeyword, setSidecarPreviewKeyword] = useState("")
    const [sidecarPreviewMatchCursor, setSidecarPreviewMatchCursor] = useState(0)
    const [sidecarPreviewExpandedRows, setSidecarPreviewExpandedRows] = useState<number[]>([])
    const [screenshotTranslateOpen, setScreenshotTranslateOpen] = useState(false)
    const [screenshotTranslateBlockIndex, setScreenshotTranslateBlockIndex] = useState<number | null>(null)
    const [screenshotTranslateImageData, setScreenshotTranslateImageData] = useState("")
    const [screenshotTranslateImageName, setScreenshotTranslateImageName] = useState("")
    const [screenshotTranslateExtraPrompt, setScreenshotTranslateExtraPrompt] = useState("")
    const [isScreenshotTranslating, setIsScreenshotTranslating] = useState(false)
    const [convertingBlockTextKey, setConvertingBlockTextKey] = useState<string | null>(null)

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
        setImageOnlyBase,
        clearImageOnlyBase,
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
    const ocrEngine = settings.ocrEngine ?? "auto"
    const repairEngine = settings.repairEngine ?? "ai"
    const defaultOrientation: "vertical" | "horizontal" =
        (settings.defaultVerticalText ?? true) ? "vertical" : "horizontal"
    const openaiProviderPresetId = useMemo(() => {
        if (settings.provider !== "openai") return "openai"
        return guessOpenAICompatibleProviderPresetId(settings.baseUrl || "")
    }, [settings.baseUrl, settings.provider])
    const aiVisionOcrProvider = settings.aiVisionOcrProvider ?? "openai"
    const aiVisionOcrOpenaiPresetId = useMemo(() => {
        if (aiVisionOcrProvider !== "openai") return "openai"
        return guessOpenAICompatibleProviderPresetId(settings.aiVisionOcrBaseUrl || settings.baseUrl || "")
    }, [aiVisionOcrProvider, settings.aiVisionOcrBaseUrl, settings.baseUrl])

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

        const expandedResult = await expandEditorUploadFiles(Array.from(files))
        const normalizeResult = await normalizeEditorImageFiles(expandedResult.files)
        if (normalizeResult.files.length > 0) {
            addImages(normalizeResult.files)
        }

        if (expandedResult.archiveExpandedEntries > 0) {
            toast.success(
                locale === "zh"
                    ? `已从 ${expandedResult.archiveSourceFiles} 个压缩包中解包 ${expandedResult.archiveExpandedEntries} 个文件`
                    : `Extracted ${expandedResult.archiveExpandedEntries} files from ${expandedResult.archiveSourceFiles} archive(s)`
            )
        }
        if (expandedResult.unsupportedArchives.length > 0) {
            toast.warning(
                locale === "zh"
                    ? `暂不支持直接读取 ${expandedResult.unsupportedArchives.length} 个 RAR/7z 压缩包`
                    : `${expandedResult.unsupportedArchives.length} RAR/7z archives are not supported yet`
            )
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

        const allFailed = [...expandedResult.failed, ...normalizeResult.failed]
        if (allFailed.length > 0) {
            const preview = allFailed
                .slice(0, 2)
                .map((item) => `${item.fileName} (${item.reason})`)
                .join("; ")
            toast.warning(
                locale === "zh"
                    ? `有 ${allFailed.length} 个文件未导入：${preview}`
                    : `${allFailed.length} files were not imported: ${preview}`
            )
        }
    }, [addImages, locale])

    const getFileStem = useCallback((fileName: string) => {
        return fileName.replace(/\.[^.]+$/, "").trim().toLowerCase()
    }, [])

    const validateAndAttachImageOnlyBase = useCallback(async (
        imageId: string,
        imageOnlyFile: File
    ) => {
        const targetImage = images.find((img) => img.id === imageId)
        if (!targetImage) return { ok: false, reason: "TARGET_NOT_FOUND" }

        const [sourceImage, imageOnlyObjectUrl] = await Promise.all([
            loadImage(targetImage.originalUrl),
            Promise.resolve(URL.createObjectURL(imageOnlyFile)),
        ])
        let attachedSuccess = false
        try {
            const imageOnlyImage = await loadImage(imageOnlyObjectUrl)
            if (sourceImage.width !== imageOnlyImage.width || sourceImage.height !== imageOnlyImage.height) {
                return { ok: false, reason: "SIZE_MISMATCH" as const }
            }
            setImageOnlyBase(imageId, imageOnlyObjectUrl, imageOnlyFile.name)
            attachedSuccess = true
            return { ok: true as const }
        } catch {
            return { ok: false, reason: "INVALID_IMAGE" as const }
        } finally {
            // URL ownership transfers to store on success.
            if (!attachedSuccess) {
                URL.revokeObjectURL(imageOnlyObjectUrl)
            }
        }
    }, [images, setImageOnlyBase])

    const handleCurrentImageOnlyBaseUpload = useCallback(async (files: FileList | null) => {
        if (!files?.length || !currentImage) return

        const normalizeResult = await normalizeEditorImageFiles(Array.from(files).slice(0, 1))
        const file = normalizeResult.files[0]
        if (!file) {
            toast.error(locale === "zh" ? "未检测到可用图片文件" : "No valid image file detected")
            return
        }

        const attached = await validateAndAttachImageOnlyBase(currentImage.id, file)
        if (!attached.ok) {
            if (attached.reason === "SIZE_MISMATCH") {
                toast.error(
                    locale === "zh"
                        ? "底图尺寸必须与当前原图一致"
                        : "Base image size must match current source image"
                )
            } else {
                toast.error(locale === "zh" ? "底图设置失败" : "Failed to set base image")
            }
            return
        }

        toast.success(locale === "zh" ? "已设置 image-only 底图" : "Image-only base set")
    }, [currentImage, locale, validateAndAttachImageOnlyBase])

    const handleBatchImageOnlyBaseUpload = useCallback(async (files: FileList | null) => {
        if (!files?.length || images.length === 0) return

        const normalizeResult = await normalizeEditorImageFiles(Array.from(files))
        if (!normalizeResult.files.length) {
            toast.error(locale === "zh" ? "未检测到可用图片文件" : "No valid image files detected")
            return
        }

        const bucket = new Map<string, string[]>()
        images.forEach((img) => {
            const stem = getFileStem(img.file.name)
            const ids = bucket.get(stem) || []
            ids.push(img.id)
            bucket.set(stem, ids)
        })

        let matched = 0
        let sizeMismatch = 0
        const unmatched: string[] = []

        for (const file of normalizeResult.files) {
            const stem = getFileStem(file.name)
            const targetIds = bucket.get(stem)
            if (!targetIds?.length) {
                unmatched.push(file.name)
                continue
            }
            const targetId = targetIds.shift()
            if (!targetId) {
                unmatched.push(file.name)
                continue
            }
            const attached = await validateAndAttachImageOnlyBase(targetId, file)
            if (attached.ok) {
                matched++
            } else if (attached.reason === "SIZE_MISMATCH") {
                sizeMismatch++
            }
        }

        if (matched > 0) {
            toast.success(
                locale === "zh"
                    ? `已匹配 ${matched} 张 image-only 底图`
                    : `Matched ${matched} image-only base files`
            )
        }
        if (sizeMismatch > 0) {
            toast.warning(
                locale === "zh"
                    ? `${sizeMismatch} 张底图尺寸不一致，已跳过`
                    : `${sizeMismatch} base images skipped due to size mismatch`
            )
        }
        if (unmatched.length > 0) {
            toast.info(
                locale === "zh"
                    ? `有 ${unmatched.length} 张未匹配到同名页面`
                    : `${unmatched.length} files did not match any page name`
            )
        }
    }, [getFileStem, images, locale, validateAndAttachImageOnlyBase])

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

    const handleExportSettings = useCallback(() => {
        try {
            const payload = {
                schemaVersion: 1,
                exportedAt: new Date().toISOString(),
                settings,
            }
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
            const url = URL.createObjectURL(blob)
            const anchor = document.createElement("a")
            anchor.href = url
            anchor.download = `manga-lens-settings-${Date.now()}.json`
            anchor.click()
            URL.revokeObjectURL(url)
            toast.success(locale === "zh" ? "设置已导出" : "Settings exported")
        } catch (error) {
            toast.error(
                locale === "zh"
                    ? `导出设置失败：${error instanceof Error ? error.message : "未知错误"}`
                    : `Failed to export settings: ${error instanceof Error ? error.message : "Unknown error"}`
            )
        }
    }, [locale, settings])

    const handleImportSettings = useCallback(async (files: FileList | null) => {
        if (!files?.length) return
        try {
            const file = files[0]
            const raw = await file.text()
            const parsed = JSON.parse(raw) as Record<string, unknown>
            const candidate = (parsed.settings && typeof parsed.settings === "object")
                ? parsed.settings as Record<string, unknown>
                : parsed

            const patch: Record<string, unknown> = {}
            for (const key of SETTINGS_IMPORT_KEYS) {
                if (typeof candidate[key] !== "undefined") {
                    patch[key] = candidate[key]
                }
            }

            // 导入时不覆盖用户本地私钥，除非设置里显式提供且非空。
            if (typeof candidate.apiKey === "string" && candidate.apiKey.trim()) {
                patch.apiKey = candidate.apiKey
            }

            updateSettings(patch)
            toast.success(
                locale === "zh"
                    ? `已导入设置（${Object.keys(patch).length} 项）`
                    : `Imported settings (${Object.keys(patch).length} keys)`
            )
        } catch (error) {
            toast.error(
                locale === "zh"
                    ? `导入设置失败：${error instanceof Error ? error.message : "未知错误"}`
                    : `Failed to import settings: ${error instanceof Error ? error.message : "Unknown error"}`
            )
        }
    }, [locale, updateSettings])

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
    const aiVisionOcrUseCustomConfig = Boolean(settings.aiVisionOcrUseCustomConfig)
    const forceLocalAiVisionOcr = ocrEngine === "ai_vision" && aiVisionOcrUseCustomConfig
    const aiVisionOcrRuntimeConfig = useMemo(() => {
        const provider = aiVisionOcrUseCustomConfig
            ? (settings.aiVisionOcrProvider ?? "openai")
            : settings.provider
        return {
            provider,
            apiKey: aiVisionOcrUseCustomConfig ? (settings.aiVisionOcrApiKey || "") : settings.apiKey,
            baseUrl: aiVisionOcrUseCustomConfig ? (settings.aiVisionOcrBaseUrl || "") : settings.baseUrl,
            model: aiVisionOcrUseCustomConfig ? (settings.aiVisionOcrModel || "") : settings.model,
            imageSize: settings.imageSize || "2K",
        }
    }, [
        aiVisionOcrUseCustomConfig,
        settings.aiVisionOcrApiKey,
        settings.aiVisionOcrBaseUrl,
        settings.aiVisionOcrModel,
        settings.aiVisionOcrProvider,
        settings.apiKey,
        settings.baseUrl,
        settings.imageSize,
        settings.model,
        settings.provider,
    ])
    const canRunAutoDetect =
        (settings.useServerApi && !forceLocalAiVisionOcr) ||
        Boolean(ocrEngine === "ai_vision" ? aiVisionOcrRuntimeConfig.apiKey : settings.apiKey) ||
        (ocrEngine !== "ai_vision")
    const detectedBlocks = useMemo(() => currentImage?.detectedTextBlocks || [], [currentImage?.detectedTextBlocks])
    const selectedBlockSet = useMemo(() => new Set(selectedBlockIndexes), [selectedBlockIndexes])
    const retranslatingBlockSet = useMemo(() => new Set(retranslatingBlockIndexes), [retranslatingBlockIndexes])

    useEffect(() => {
        setSelectedBlockIndexes([])
        setRetranslatingBlockIndexes([])
        setBulkTextValue("")
    }, [currentImage?.id])

    useEffect(() => {
        if (!clearGalleryArmed) return
        const timer = window.setTimeout(() => setClearGalleryArmed(false), 1800)
        return () => window.clearTimeout(timer)
    }, [clearGalleryArmed])

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

    const getDetectionRegionHints = useCallback((imageWidth: number, imageHeight: number) => {
        if (!currentImage || !currentImage.selections?.length) {
            return {}
        }
        const normalized = currentImage.selections.map((selection) =>
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
    }, [currentImage, selectionToNormalizedRegion, settings.detectionRegionMode])

    const getTargetLanguageForDetection = useCallback(() => {
        const direction = settings.translationDirection ?? "ja2zh"
        return getDetectionTargetLanguageFromDirection(direction)
    }, [settings.translationDirection])

    const getSourceLanguageAllowlist = useCallback(() => {
        return settings.sourceLanguageAllowlist ?? []
    }, [settings.sourceLanguageAllowlist])

    const getSourceLanguageHintForDetection = useCallback(() => {
        const allowlist = getSourceLanguageAllowlist()
        if (allowlist.length) {
            return allowlist.map((code) => getSourceLanguageLabel(code)).join(locale === "zh" ? "、" : ", ")
        }
        const direction = settings.translationDirection ?? "ja2zh"
        return getTranslationDirectionMeta(direction).sourceLangLabel
    }, [getSourceLanguageAllowlist, locale, settings.translationDirection])

    const toggleSourceLanguageAllowlist = useCallback((code: SourceLanguageCode) => {
        const currentAllowlist = settings.sourceLanguageAllowlist ?? []
        const hasCode = currentAllowlist.includes(code)
        const nextAllowlist = hasCode
            ? currentAllowlist.filter((item) => item !== code)
            : [...currentAllowlist, code]
        updateSettings({ sourceLanguageAllowlist: nextAllowlist })
    }, [settings.sourceLanguageAllowlist, updateSettings])

    const applyAngleThresholdFilter = useCallback((blocks: DetectTextResponse["blocks"]) => {
        const filteredByFurigana = filterLikelyFuriganaBlocks(
            blocks,
            settings.suppressFurigana ?? false
        )
        return filterBlocksByAngleThreshold(
            filteredByFurigana,
            settings.angleThreshold ?? 1,
            settings.enableAngleFilter ?? false
        )
    }, [settings.angleThreshold, settings.enableAngleFilter, settings.suppressFurigana])

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
        const useServerDetectionPipeline = ocrEngine !== "ai_vision"
        const strictServerDetectionEngine = ocrEngine !== "auto" && ocrEngine !== "ai_vision"
        const webtoonRatio = imageWidth && imageHeight
            ? imageHeight / Math.max(1, imageWidth)
            : 0
        const isLikelyWebtoon = webtoonRatio >= 2.2
        const preferComicDetector =
            (ocrEngine === "auto" || ocrEngine === "comic_text_detector") &&
            !isLikelyWebtoon
        const detectionHints =
            imageWidth && imageHeight
                ? getDetectionRegionHints(imageWidth, imageHeight)
                : {}
        const tryServerDetect = async () => {
            const candidates = await buildDetectPayloadCandidates(imageData)
            let lastError = locale === "zh" ? "网站 API 文本检测失败" : "Server text detection failed"
            let receivedEmptyResult = false

            for (let i = 0; i < candidates.length; i++) {
                const payload = candidates[i]
                const res = await fetch("/api/ai/detect-text", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        imageData: payload,
                        targetLanguage: getTargetLanguageForDetection(),
                        sourceLanguageHint: getSourceLanguageHintForDetection(),
                        sourceLanguageAllowlist: getSourceLanguageAllowlist(),
                        imageWidth,
                        imageHeight,
                        preferComicDetector,
                        ocrEngine,
                        ...detectionHints,
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
                const filteredBlocks = applyAngleThresholdFilter(data.blocks || [])
                if (filteredBlocks.length > 0) {
                    return {
                        success: true,
                        blocks: filteredBlocks,
                    } as DetectTextResponse
                }
                receivedEmptyResult = true

                if (isLikelyWebtoon && ocrEngine === "auto") {
                    const aiVisionRes = await fetch("/api/ai/detect-text", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            imageData: payload,
                            targetLanguage: getTargetLanguageForDetection(),
                            sourceLanguageHint: getSourceLanguageHintForDetection(),
                            sourceLanguageAllowlist: getSourceLanguageAllowlist(),
                            imageWidth,
                            imageHeight,
                            preferComicDetector: false,
                            ocrEngine: "ai_vision",
                            ...detectionHints,
                        }),
                    })
                    if (aiVisionRes.ok) {
                        const aiVisionData = await aiVisionRes.json()
                        const aiVisionBlocks = applyAngleThresholdFilter(aiVisionData.blocks || [])
                        if (aiVisionBlocks.length > 0) {
                            return {
                                success: true,
                                blocks: aiVisionBlocks,
                            } as DetectTextResponse
                        }
                    }
                }
                if (i < candidates.length - 1) {
                    continue
                }
                return {
                    success: true,
                    blocks: filteredBlocks,
                } as DetectTextResponse
            }

            throw new Error(
                receivedEmptyResult
                    ? (
                        locale === "zh"
                            ? "未识别到文字。长条韩漫建议切换 OCR 引擎为 PaddleOCR / AI 视觉，或先手动框选再检测。"
                            : "No text detected. For tall webtoons, try PaddleOCR / AI Vision, or draw selections first."
                    )
                    : lastError
            )
        }

        if (settings.useServerApi && !forceLocalAiVisionOcr) {
            return tryServerDetect()
        }

        if (useServerDetectionPipeline) {
            // 非网站 API 模式下，也尝试后台 OCR 适配层（CTD/MangaOCR/PaddleOCR/Baidu）。
            try {
                const serverResult = await tryServerDetect()
                if (serverResult.success && serverResult.blocks.length > 0) {
                    return serverResult
                }
            } catch (error) {
                if (strictServerDetectionEngine) {
                    throw error
                }
                // Fallback to user-provided model key.
            }
        }

        if (strictServerDetectionEngine) {
            throw new Error(
                locale === "zh"
                    ? "所选 OCR 引擎不可用，请检查 /admin/settings/ai 配置"
                    : "Selected OCR engine is unavailable. Check /admin/settings/ai"
            )
        }

        return detectTextBlocks({
                imageData,
                config: aiVisionOcrRuntimeConfig,
                targetLanguage: getTargetLanguageForDetection(),
                sourceLanguageHint: getSourceLanguageHintForDetection(),
                sourceLanguageAllowlist: getSourceLanguageAllowlist(),
                ...detectionHints,
            }).then((response) => ({
                ...response,
                blocks: response.success ? applyAngleThresholdFilter(response.blocks || []) : (response.blocks || []),
            }))
    }, [
        applyAngleThresholdFilter,
        buildDetectPayloadCandidates,
        getDetectionRegionHints,
        getSourceLanguageAllowlist,
        getSourceLanguageHintForDetection,
        getTargetLanguageForDetection,
        locale,
        ocrEngine,
        parseApiError,
        aiVisionOcrRuntimeConfig,
        forceLocalAiVisionOcr,
        settings.useServerApi,
    ])

    const buildSelectionsFromDetectedBlocks = useCallback((
        blocks: DetectTextResponse["blocks"],
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
                    id: `${idPrefix}-${Date.now()}-${index}`,
                    x: Math.min(x, Math.max(0, imageWidth - 1)),
                    y: Math.min(y, Math.max(0, imageHeight - 1)),
                    width: Math.min(width, Math.max(1, imageWidth - x)),
                    height: Math.min(height, Math.max(1, imageHeight - y)),
                }
            })
            .filter((selection) => selection.width > 4 && selection.height > 4)
    }, [])

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

            const detectedSelections = buildSelectionsFromDetectedBlocks(
                result.blocks,
                image.width,
                image.height,
                "auto"
            )

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
        buildSelectionsFromDetectedBlocks,
        updateSelections,
    ])

    const handleAutoDetectAllImages = useCallback(async () => {
        if (!sortedImages.length) {
            toast.warning(locale === "zh" ? "请先上传图片" : "Please upload images first")
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
        if (isBatchAutoDetecting || isBatchTranslatingDetected) return

        setIsBatchAutoDetecting(true)
        let successCount = 0
        let emptyCount = 0
        let failedCount = 0

        try {
            const total = sortedImages.length
            for (let i = 0; i < total; i++) {
                const imageItem = sortedImages[i]
                setBatchStageProgressText(
                    locale === "zh"
                        ? `阶段1/2 OCR ${i + 1}/${total}: ${imageItem.file.name}`
                        : `Stage 1/2 OCR ${i + 1}/${total}: ${imageItem.file.name}`
                )
                try {
                    const image = await loadImage(imageItem.originalUrl)
                    const imageData = imageToDataUrl(image)
                    const result = await runAutoDetect(imageData, image.width, image.height)

                    if (!result.success) {
                        failedCount++
                        continue
                    }
                    const selections = buildSelectionsFromDetectedBlocks(
                        result.blocks,
                        image.width,
                        image.height,
                        "auto-batch"
                    )
                    if (!selections.length) {
                        clearDetectedTextBlocks(imageItem.id)
                        emptyCount++
                        continue
                    }

                    updateSelections(imageItem.id, selections)
                    setDetectedTextBlocks(imageItem.id, applyDefaultOrientationToBlocks(result.blocks))
                    successCount++
                } catch (error) {
                    failedCount++
                    console.error("Batch OCR detect failed:", { imageId: imageItem.id, error })
                }
            }

            const summary = locale === "zh"
                ? `OCR 完成：成功 ${successCount}，空结果 ${emptyCount}，失败 ${failedCount}`
                : `OCR finished: success ${successCount}, empty ${emptyCount}, failed ${failedCount}`
            setBatchStageProgressText(summary)
            toast.success(summary)
        } finally {
            setIsBatchAutoDetecting(false)
            window.setTimeout(() => {
                setBatchStageProgressText("")
            }, 3500)
        }
    }, [
        applyDefaultOrientationToBlocks,
        buildSelectionsFromDetectedBlocks,
        canRunAutoDetect,
        clearDetectedTextBlocks,
        isBatchAutoDetecting,
        isBatchTranslatingDetected,
        locale,
        runAutoDetect,
        setDetectedTextBlocks,
        sortedImages,
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

    const buildSidecarSearchCorpus = useCallback((
        blocks: Array<{
            sourceText: string
            translatedText: string
            richTextHtml?: string
        }>
    ) => {
        return blocks
            .map((block) => {
                const sourceText = block.sourceText.trim()
                const translatedFromRich = block.richTextHtml
                    ? richHtmlToPlainText(block.richTextHtml)
                    : ""
                const translatedText = (block.translatedText || translatedFromRich).trim()
                return `${sourceText}\n${translatedText}`.trim()
            })
            .filter(Boolean)
            .join("\n")
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
                    searchCorpus: buildSidecarSearchCorpus(blocks),
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
                searchCorpus: buildSidecarSearchCorpus(jsonBlocks),
                previewTexts: buildSidecarPreviewTexts(jsonBlocks),
            }],
        }
    }, [buildSidecarPreviewTexts, buildSidecarSearchCorpus, buildSidecarZipRestoreRecords, currentImage?.file.name, locale, parseBlocksFromSidecarPayload, parseSidecarJsonFile])

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
            setSidecarPreviewKeyword("")
            setSidecarPreviewMatchCursor(0)
            setSidecarPreviewExpandedRows([])
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
        setSidecarPreviewKeyword("")
        setSidecarPreviewMatchCursor(0)
        setSidecarPreviewExpandedRows([])
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
            setSidecarPreviewKeyword("")
            setSidecarPreviewMatchCursor(0)
            setSidecarPreviewExpandedRows([])
        }
    }, [isApplyingSidecarImport])

    const normalizedSidecarPreviewKeyword = useMemo(
        () => sidecarPreviewKeyword.trim().toLowerCase(),
        [sidecarPreviewKeyword]
    )

    const sidecarPreviewMatchedIndices = useMemo(() => {
        if (!sidecarImportPlan || !normalizedSidecarPreviewKeyword) return []
        return sidecarImportPlan.previewDetails.reduce<number[]>((acc, detail, index) => {
            const fileMatched = detail.fileName.toLowerCase().includes(normalizedSidecarPreviewKeyword)
            const contentMatched = detail.searchCorpus.toLowerCase().includes(normalizedSidecarPreviewKeyword)
            if (fileMatched || contentMatched) {
                acc.push(index)
            }
            return acc
        }, [])
    }, [sidecarImportPlan, normalizedSidecarPreviewKeyword])

    const sidecarPreviewMatchedIndexSet = useMemo(
        () => new Set(sidecarPreviewMatchedIndices),
        [sidecarPreviewMatchedIndices]
    )

    const currentMatchedDetailIndex = useMemo(() => {
        if (!sidecarPreviewMatchedIndices.length) return null
        const safeCursor = Math.min(sidecarPreviewMatchCursor, sidecarPreviewMatchedIndices.length - 1)
        return sidecarPreviewMatchedIndices[safeCursor] ?? null
    }, [sidecarPreviewMatchCursor, sidecarPreviewMatchedIndices])

    const highlightSidecarText = useCallback((text: string, keyword: string): ReactNode => {
        const safeText = text || "-"
        if (!keyword) return safeText
        const safeKeyword = keyword.trim()
        if (!safeKeyword) return safeText
        const lowerText = safeText.toLowerCase()
        const lowerKeyword = safeKeyword.toLowerCase()
        if (!lowerText.includes(lowerKeyword)) return safeText

        const nodes: ReactNode[] = []
        let cursor = 0
        let nodeKey = 0
        while (cursor < safeText.length) {
            const matchAt = lowerText.indexOf(lowerKeyword, cursor)
            if (matchAt === -1) {
                nodes.push(safeText.slice(cursor))
                break
            }
            if (matchAt > cursor) {
                nodes.push(safeText.slice(cursor, matchAt))
            }
            nodes.push(
                <mark key={`sidecar-match-${nodeKey++}`} className="rounded bg-amber-200/80 px-0.5 text-black dark:bg-amber-400/70">
                    {safeText.slice(matchAt, matchAt + safeKeyword.length)}
                </mark>
            )
            cursor = matchAt + safeKeyword.length
        }
        return nodes
    }, [])

    const toggleSidecarPreviewRow = useCallback((index: number) => {
        setSidecarPreviewExpandedRows((prev) =>
            prev.includes(index)
                ? prev.filter((item) => item !== index)
                : [...prev, index]
        )
    }, [])

    const jumpSidecarPreviewMatch = useCallback((direction: "prev" | "next") => {
        if (!sidecarPreviewMatchedIndices.length) return
        setSidecarPreviewMatchCursor((prev) => {
            const total = sidecarPreviewMatchedIndices.length
            if (direction === "next") {
                return (prev + 1) % total
            }
            return (prev - 1 + total) % total
        })
    }, [sidecarPreviewMatchedIndices.length])

    useEffect(() => {
        setSidecarPreviewMatchCursor(0)
    }, [normalizedSidecarPreviewKeyword])

    useEffect(() => {
        if (!sidecarPreviewOpen || !normalizedSidecarPreviewKeyword) return
        if (!sidecarPreviewMatchedIndices.length) return

        const safeCursor = Math.min(sidecarPreviewMatchCursor, sidecarPreviewMatchedIndices.length - 1)
        if (safeCursor !== sidecarPreviewMatchCursor) {
            setSidecarPreviewMatchCursor(safeCursor)
            return
        }

        const targetDetailIndex = sidecarPreviewMatchedIndices[safeCursor]
        setSidecarPreviewExpandedRows((prev) => (
            prev.includes(targetDetailIndex) ? prev : [...prev, targetDetailIndex]
        ))

        const targetElement = document.getElementById(`sidecar-preview-row-${targetDetailIndex}`)
        targetElement?.scrollIntoView({ behavior: "smooth", block: "center" })
    }, [
        normalizedSidecarPreviewKeyword,
        sidecarPreviewMatchCursor,
        sidecarPreviewMatchedIndices,
        sidecarPreviewOpen,
    ])

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

    const handleDetectedSourceEdit = useCallback((index: number, sourceText: string) => {
        if (!currentImage) return
        const nextBlocks = [...(currentImage.detectedTextBlocks || [])]
        if (!nextBlocks[index]) return
        nextBlocks[index] = {
            ...nextBlocks[index],
            sourceText,
        }
        setDetectedTextBlocks(currentImage.id, nextBlocks)
    }, [currentImage, setDetectedTextBlocks])

    const handleDetectedAngleEdit = useCallback((index: number, angleInput: number) => {
        if (!currentImage) return
        if (!Number.isFinite(angleInput)) return
        const clamped = Math.max(-180, Math.min(180, Math.round(angleInput * 2) / 2))
        const nextBlocks = [...(currentImage.detectedTextBlocks || [])]
        if (!nextBlocks[index]) return

        nextBlocks[index] = {
            ...nextBlocks[index],
            style: {
                ...(nextBlocks[index].style || {}),
                angle: clamped,
            },
        }
        setDetectedTextBlocks(currentImage.id, nextBlocks)
    }, [currentImage, setDetectedTextBlocks])

    const handleDetectedAngleNudge = useCallback((index: number, delta: number) => {
        if (!currentImage) return
        const block = (currentImage.detectedTextBlocks || [])[index]
        if (!block) return
        const currentAngle = Number(block.style?.angle ?? 0)
        const safeCurrent = Number.isFinite(currentAngle) ? currentAngle : 0
        handleDetectedAngleEdit(index, safeCurrent + delta)
    }, [currentImage, handleDetectedAngleEdit])

    const convertDetectedBlockText = useCallback(async (
        index: number,
        field: "source" | "translated",
        mode: ChineseConvertMode
    ) => {
        if (!currentImage) return
        const blocks = [...(currentImage.detectedTextBlocks || [])]
        const block = blocks[index]
        if (!block) return

        const currentText = field === "source"
            ? (block.sourceText || "")
            : richHtmlToPlainText(block.richTextHtml || block.translatedText || "")
        if (!currentText.trim()) {
            toast.warning(locale === "zh" ? "当前文本为空" : "Current text is empty")
            return
        }

        const opKey = `${field}-${mode}-${index}`
        setConvertingBlockTextKey(opKey)
        try {
            const converted = await convertChineseText(currentText, mode)
            if (!converted.trim()) {
                throw new Error(locale === "zh" ? "转换结果为空" : "Converted text is empty")
            }
            blocks[index] = field === "source"
                ? {
                    ...block,
                    sourceText: converted,
                }
                : {
                    ...block,
                    translatedText: converted,
                    richTextHtml: plainTextToRichHtml(converted),
                }
            setDetectedTextBlocks(currentImage.id, blocks)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : (locale === "zh" ? "繁简转换失败" : "Chinese conversion failed"))
        } finally {
            setConvertingBlockTextKey((prev) => (prev === opKey ? null : prev))
        }
    }, [currentImage, locale, setDetectedTextBlocks])

    const closeScreenshotTranslateDialog = useCallback(() => {
        setScreenshotTranslateOpen(false)
        setScreenshotTranslateBlockIndex(null)
        setScreenshotTranslateImageData("")
        setScreenshotTranslateImageName("")
        setScreenshotTranslateExtraPrompt("")
        setIsScreenshotTranslating(false)
    }, [])

    const openScreenshotTranslateDialog = useCallback((index: number) => {
        setScreenshotTranslateBlockIndex(index)
        setScreenshotTranslateImageData("")
        setScreenshotTranslateImageName("")
        setScreenshotTranslateExtraPrompt("")
        setScreenshotTranslateOpen(true)
    }, [])

    const handleScreenshotTranslateUpload = useCallback(async (file: File | null) => {
        if (!file) return
        try {
            const normalized = await normalizeEditorImageFiles([file])
            const imageFile = normalized.files[0]
            if (!imageFile) {
                throw new Error(locale === "zh" ? "未检测到可用图片文件" : "No valid image file detected")
            }
            const imageData = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader()
                reader.onload = () => resolve(String(reader.result || ""))
                reader.onerror = () => reject(new Error(locale === "zh" ? "读取截图失败" : "Failed to read image"))
                reader.readAsDataURL(imageFile)
            })
            setScreenshotTranslateImageData(imageData)
            setScreenshotTranslateImageName(imageFile.name)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : (locale === "zh" ? "截图加载失败" : "Failed to load screenshot"))
        }
    }, [locale])

    const runScreenshotTranslateRequest = useCallback(async (
        imageData: string,
        targetLanguage: string,
        sourceLanguageHint?: string,
        extraPrompt?: string
    ): Promise<string> => {
        if (settings.useServerApi) {
            const res = await fetch("/api/ai/translate-vision", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    imageData,
                    targetLanguage,
                    sourceLanguageHint,
                    extraPrompt,
                    stripReasoningContent: settings.stripReasoningContent ?? true,
                }),
            })
            if (!res.ok) {
                throw new Error(
                    await parseApiError(
                        res,
                        locale === "zh" ? "网站 API 截图翻译失败" : "Server screenshot translation failed"
                    )
                )
            }
            const data = await res.json()
            const translatedText = String(data?.translatedText || "").trim()
            if (!translatedText) {
                throw new Error(locale === "zh" ? "未返回有效译文" : "Empty translation result")
            }
            return translatedText
        }

        if (!settings.apiKey) {
            throw new Error(locale === "zh" ? "缺少 API Key" : "Missing API key")
        }
        if (settings.provider !== "openai") {
            throw new Error(locale === "zh" ? "截图单句翻译目前仅支持 OpenAI 模式" : "Screenshot sentence translation currently supports OpenAI mode only")
        }

        const result = await translateImageSentence({
            imageData,
            targetLanguage,
            sourceLanguageHint,
            extraPrompt,
            stripReasoningContent: settings.stripReasoningContent ?? true,
            config: {
                provider: settings.provider,
                apiKey: settings.apiKey,
                baseUrl: settings.baseUrl,
                model: settings.model,
            },
        })

        if (!result.success || !result.translatedText) {
            throw new Error(result.error || (locale === "zh" ? "截图翻译失败" : "Screenshot translation failed"))
        }
        return result.translatedText.trim()
    }, [
        locale,
        parseApiError,
        settings.apiKey,
        settings.baseUrl,
        settings.model,
        settings.provider,
        settings.stripReasoningContent,
        settings.useServerApi,
    ])

    const handleApplyScreenshotTranslate = useCallback(async () => {
        if (!currentImage) return
        if (screenshotTranslateBlockIndex === null) return
        if (!screenshotTranslateImageData) {
            toast.warning(locale === "zh" ? "请先上传截图" : "Please upload a screenshot first")
            return
        }
        const blocks = [...(currentImage.detectedTextBlocks || [])]
        const targetBlock = blocks[screenshotTranslateBlockIndex]
        if (!targetBlock) return

        setIsScreenshotTranslating(true)
        try {
            const translatedText = await runScreenshotTranslateRequest(
                screenshotTranslateImageData,
                getTargetLanguageForDetection(),
                getSourceLanguageHintForDetection(),
                screenshotTranslateExtraPrompt
            )
            blocks[screenshotTranslateBlockIndex] = {
                ...targetBlock,
                translatedText,
                richTextHtml: plainTextToRichHtml(translatedText),
            }
            setDetectedTextBlocks(currentImage.id, blocks)
            toast.success(locale === "zh" ? "截图单句翻译已回填" : "Screenshot translation applied")
            closeScreenshotTranslateDialog()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : (locale === "zh" ? "截图翻译失败" : "Screenshot translation failed"))
        } finally {
            setIsScreenshotTranslating(false)
        }
    }, [
        closeScreenshotTranslateDialog,
        currentImage,
        getSourceLanguageHintForDetection,
        getTargetLanguageForDetection,
        locale,
        runScreenshotTranslateRequest,
        screenshotTranslateBlockIndex,
        screenshotTranslateExtraPrompt,
        screenshotTranslateImageData,
        setDetectedTextBlocks,
    ])

    const runBatchTextTranslateRequest = useCallback(async (
        items: BatchTranslateItem[],
        targetLanguage: string,
        contextHint?: string
    ): Promise<Map<string, string>> => {
        if (!items.length) return new Map()

        if (settings.useServerApi) {
            const res = await fetch("/api/ai/translate-text", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    items,
                    targetLanguage,
                    contextHint,
                    stripReasoningContent: settings.stripReasoningContent ?? true,
                }),
            })
            if (!res.ok) {
                throw new Error(
                    await parseApiError(
                        res,
                        locale === "zh" ? "网站 API 批量翻译失败" : "Server batch translation failed"
                    )
                )
            }
            const data = await res.json()
            const translatedItems = Array.isArray(data.items) ? data.items : []
            return new Map(
                translatedItems.map((item: { id: string; content: string }) => [
                    String(item.id),
                    String(item.content || ""),
                ])
            )
        }

        if (!settings.apiKey) {
            throw new Error(locale === "zh" ? "缺少 API Key" : "Missing API key")
        }

        const result = await translateTextBatch({
            items,
            targetLanguage,
            contextHint,
            stripReasoningContent: settings.stripReasoningContent ?? true,
            config: {
                provider: settings.provider,
                apiKey: settings.apiKey,
                baseUrl: settings.baseUrl,
                model: settings.model,
            },
        })
        if (!result.success) {
            throw new Error(result.error || (locale === "zh" ? "批量翻译失败" : "Batch translation failed"))
        }
        return new Map(result.items.map((item) => [item.id, item.content]))
    }, [
        locale,
        parseApiError,
        settings.apiKey,
        settings.baseUrl,
        settings.model,
        settings.provider,
        settings.stripReasoningContent,
        settings.useServerApi,
    ])

    const handleTranslateDetectedForAllImages = useCallback(async () => {
        if (!sortedImages.length) {
            toast.warning(locale === "zh" ? "请先上传图片" : "Please upload images first")
            return
        }
        if (!settings.useServerApi && !settings.apiKey) {
            toast.error(locale === "zh" ? "缺少 API Key" : "Missing API key")
            return
        }
        if (isBatchTranslatingDetected || isBatchAutoDetecting) return

        const targetImages = sortedImages.filter((img) =>
            (img.detectedTextBlocks || []).some((block) => (block.sourceText || "").trim())
        )
        if (!targetImages.length) {
            toast.warning(locale === "zh" ? "没有可翻译的 OCR 原文" : "No OCR source text to translate")
            return
        }

        setIsBatchTranslatingDetected(true)
        let successImages = 0
        let translatedBlocks = 0
        let skippedImages = 0
        let failedImages = 0

        try {
            const total = targetImages.length
            for (let i = 0; i < total; i++) {
                const imageItem = targetImages[i]
                setBatchStageProgressText(
                    locale === "zh"
                        ? `阶段2/2 翻译 ${i + 1}/${total}: ${imageItem.file.name}`
                        : `Stage 2/2 Translate ${i + 1}/${total}: ${imageItem.file.name}`
                )

                const blocks = [...(imageItem.detectedTextBlocks || [])]
                const sourceItems: BatchTranslateItem[] = blocks
                    .map((block, index) => ({
                        id: String(index),
                        content: (block.sourceText || "").trim(),
                    }))
                    .filter((item) => item.content)

                if (!sourceItems.length) {
                    skippedImages++
                    continue
                }

                try {
                    const translatedMap = await runBatchTextTranslateRequest(
                        sourceItems,
                        getTargetLanguageForDetection(),
                        settings.chapterBulkTranslate
                            ? (locale === "zh"
                                ? "保持同页台词术语与角色语气一致。"
                                : "Keep terms and character tone consistent on the page.")
                            : undefined
                    )

                    let changed = 0
                    blocks.forEach((block, index) => {
                        const translated = (translatedMap.get(String(index)) || "").trim()
                        if (!translated) return
                        const nextRich = plainTextToRichHtml(translated)
                        if (block.translatedText === translated && (block.richTextHtml || "") === nextRich) {
                            return
                        }
                        blocks[index] = {
                            ...block,
                            translatedText: translated,
                            richTextHtml: nextRich,
                        }
                        changed++
                    })

                    if (!changed) {
                        skippedImages++
                        continue
                    }

                    setDetectedTextBlocks(imageItem.id, blocks)
                    successImages++
                    translatedBlocks += changed
                } catch (error) {
                    failedImages++
                    console.error("Batch OCR text translate failed:", { imageId: imageItem.id, error })
                }
            }

            const summary = locale === "zh"
                ? `批量翻译完成：更新 ${translatedBlocks} 条（${successImages} 张图），跳过 ${skippedImages}，失败 ${failedImages}`
                : `Batch translation done: ${translatedBlocks} blocks updated (${successImages} images), skipped ${skippedImages}, failed ${failedImages}`
            setBatchStageProgressText(summary)
            toast.success(summary)
        } finally {
            setIsBatchTranslatingDetected(false)
            window.setTimeout(() => {
                setBatchStageProgressText("")
            }, 3500)
        }
    }, [
        getTargetLanguageForDetection,
        isBatchAutoDetecting,
        isBatchTranslatingDetected,
        locale,
        runBatchTextTranslateRequest,
        setDetectedTextBlocks,
        settings.apiKey,
        settings.chapterBulkTranslate,
        settings.useServerApi,
        sortedImages,
    ])

    const handleRetranslateDetectedBlock = useCallback(async (
        index: number,
        mode: "current_only" | "with_context" = "with_context",
        options?: { forceDeepMode?: boolean }
    ) => {
        if (!currentImage) return
        const block = (currentImage.detectedTextBlocks || [])[index]
        if (!block) return

        const sourceText = (block.sourceText || "").trim()
        if (!sourceText) {
            toast.warning(locale === "zh" ? "请先填写原文" : "Please enter source text first")
            return
        }
        if (!settings.useServerApi && !settings.apiKey) {
            toast.error(locale === "zh" ? "缺少 API Key" : "Missing API key")
            return
        }
        if (retranslatingBlockSet.has(index)) return

        setRetranslatingBlockIndexes((prev) => (prev.includes(index) ? prev : [...prev, index]))
        try {
            const deepModeEnabled = Boolean(options?.forceDeepMode) || (settings.singleRetranslateDeepMode ?? false)
            const configuredContextWindow = Math.max(0, Math.min(8, Math.floor(settings.singleRetranslateContextWindow ?? 2)))
            const contextWindow = mode === "current_only" ? 0 : configuredContextWindow
            const allBlocks = currentImage.detectedTextBlocks || []
            const contextStart = Math.max(0, index - contextWindow)
            const contextEnd = Math.min(allBlocks.length - 1, index + contextWindow)
            const truncate = (value: string, max = 90) => {
                if (value.length <= max) return value
                return `${value.slice(0, max)}...`
            }
            const contextLines = allBlocks.slice(contextStart, contextEnd + 1).map((item, offset) => {
                const realIndex = contextStart + offset
                const source = truncate((item.sourceText || "").replace(/\s+/g, " ").trim(), 120)
                const translated = truncate((item.translatedText || "").replace(/\s+/g, " ").trim(), 120)
                return `${realIndex === index ? ">>" : "  "}#${realIndex + 1} src=${source} | tr=${translated}`
            })
            const contextHintParts: string[] = []
            if (deepModeEnabled) {
                contextHintParts.push(
                    locale === "zh"
                        ? "深度模式：更注重语气、指代关系、上下文一致性与自然表达，必要时可重写但保持语义准确。"
                        : "Deep mode: prioritize tone, coreference, contextual coherence and natural phrasing while preserving meaning."
                )
                if (options?.forceDeepMode) {
                    contextHintParts.push(
                        locale === "zh"
                            ? "本次为临时深度模式（Alt 快捷触发），不会修改全局设置。"
                            : "Temporary deep mode enabled for this request via Alt-click; global settings remain unchanged."
                    )
                }
            }
            if (settings.chapterBulkTranslate) {
                contextHintParts.push(
                    locale === "zh"
                        ? "保持同页台词术语和角色语气一致。"
                        : "Keep terminology and character voice consistent on this page."
                )
            }
            if (contextLines.length > 0) {
                contextHintParts.push(
                    locale === "zh" ? "上下文窗口：" : "Context window:",
                    ...contextLines
                )
            }
            if (mode === "current_only") {
                contextHintParts.push(
                    locale === "zh"
                        ? "只翻译当前句，不参考邻近台词。"
                        : "Translate this line only without neighboring context."
                )
            }
            const contextHint = contextHintParts.length > 0
                ? contextHintParts.join("\n")
                : undefined
            const translatedMap = await runBatchTextTranslateRequest(
                [{ id: String(index), content: sourceText }],
                getTargetLanguageForDetection(),
                contextHint
            )
            const translatedText = (translatedMap.get(String(index)) || "").trim()
            if (!translatedText) {
                throw new Error(locale === "zh" ? "未返回有效译文" : "Empty translation result")
            }

            const nextBlocks = [...(currentImage.detectedTextBlocks || [])]
            if (!nextBlocks[index]) return
            nextBlocks[index] = {
                ...nextBlocks[index],
                sourceText,
                translatedText,
                richTextHtml: plainTextToRichHtml(translatedText),
            }
            setDetectedTextBlocks(currentImage.id, nextBlocks)
            toast.success(
                mode === "current_only"
                    ? (locale === "zh" ? "仅当前句重翻译完成" : "Current-line retranslation completed")
                    : (locale === "zh" ? "带上下文重翻译完成" : "Context-aware retranslation completed")
            )
        } catch (error) {
            const message = error instanceof Error
                ? error.message
                : (
                    mode === "current_only"
                        ? (locale === "zh" ? "仅当前句重翻译失败" : "Current-line retranslation failed")
                        : (locale === "zh" ? "带上下文重翻译失败" : "Context-aware retranslation failed")
                )
            toast.error(message)
        } finally {
            setRetranslatingBlockIndexes((prev) => prev.filter((item) => item !== index))
        }
    }, [
        currentImage,
        getTargetLanguageForDetection,
        locale,
        retranslatingBlockSet,
        runBatchTextTranslateRequest,
        setDetectedTextBlocks,
        settings.apiKey,
        settings.chapterBulkTranslate,
        settings.singleRetranslateContextWindow,
        settings.singleRetranslateDeepMode,
        settings.useServerApi,
    ])

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

    const handleExportPlainText = useCallback(() => {
        if (!currentImage || !(currentImage.detectedTextBlocks || []).length) {
            toast.warning(locale === "zh" ? "没有可导出的文本块" : "No text blocks to export")
            return
        }

        const lines = (currentImage.detectedTextBlocks || []).flatMap((block, index) => {
            const rowHeader = `#${index + 1}`
            const sourceLine = `${locale === "zh" ? "原文" : "Source"}: ${block.sourceText || ""}`
            const translatedLine = `${locale === "zh" ? "译文" : "Translation"}: ${block.translatedText || ""}`
            return [rowHeader, sourceLine, translatedLine, ""]
        })
        const content = [
            "MangaLens Plain Text Export",
            `${locale === "zh" ? "图片" : "Image"}: ${currentImage.file.name}`,
            `${locale === "zh" ? "导出时间" : "Exported at"}: ${new Date().toISOString()}`,
            "",
            ...lines,
        ].join("\n")

        const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${currentImage.file.name.replace(/\.[^.]+$/, "")}-plain-text.txt`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }, [currentImage, locale])

    const handleExportSourceText = useCallback((scope: "current" | "all") => {
        const targetImages = scope === "all"
            ? images.filter((img) => (img.detectedTextBlocks || []).length > 0)
            : currentImage
                ? [currentImage]
                : []

        if (!targetImages.length) {
            toast.warning(locale === "zh" ? "没有可导出的 OCR 原文" : "No OCR source text to export")
            return
        }

        const chunks: string[] = [
            "MangaLens OCR Source Export",
            `${locale === "zh" ? "导出范围" : "Scope"}: ${scope === "all" ? (locale === "zh" ? "全部图片" : "All images") : (locale === "zh" ? "当前图片" : "Current image")}`,
            `${locale === "zh" ? "导出时间" : "Exported at"}: ${new Date().toISOString()}`,
            "",
        ]

        targetImages.forEach((img, imageIndex) => {
            chunks.push(`[${imageIndex + 1}] ${img.file.name}`)
            ;(img.detectedTextBlocks || []).forEach((block, blockIndex) => {
                chunks.push(`#${blockIndex + 1}: ${(block.sourceText || "").trim()}`)
            })
            chunks.push("")
        })

        const blob = new Blob([chunks.join("\n")], { type: "text/plain;charset=utf-8" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = scope === "all"
            ? `manga-lens-ocr-source-all-${Date.now()}.txt`
            : `${currentImage?.file.name.replace(/\.[^.]+$/, "") || "current"}-ocr-source.txt`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }, [currentImage, images, locale])

    const handleExportOcrSourceJson = useCallback((scope: "current" | "all") => {
        const targetImages = scope === "all"
            ? images.filter((img) => (img.detectedTextBlocks || []).length > 0)
            : currentImage
                ? [currentImage]
                : []

        if (!targetImages.length) {
            toast.warning(locale === "zh" ? "没有可导出的 OCR JSON" : "No OCR JSON to export")
            return
        }

        const payload = {
            schemaVersion: 1,
            type: "mangalens.ocr-source",
            scope,
            exportedAt: new Date().toISOString(),
            images: targetImages.map((img) => ({
                imageId: img.id,
                fileName: img.file.name,
                blocks: (img.detectedTextBlocks || []).map((block, index) => ({
                    index,
                    sourceText: block.sourceText || "",
                    bbox: block.bbox,
                    sourceLanguage: block.sourceLanguage || "",
                    lines: block.lines || [],
                    segments: block.segments || [],
                    style: block.style || {},
                })),
            })),
        }

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = scope === "all"
            ? `manga-lens-ocr-source-all-${Date.now()}.json`
            : `${currentImage?.file.name.replace(/\.[^.]+$/, "") || "current"}-ocr-source.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }, [currentImage, images, locale])

    const handleImportOcrTranslatedJson = useCallback(async (file: File) => {
        try {
            const raw = await file.text()
            const parsed = JSON.parse(raw) as Record<string, unknown>

            type ImportBlock = {
                index?: number
                id?: string | number
                sourceText?: string
                translatedText?: string
                translation?: string
                content?: string
                text?: string
            }

            const applyImportedBlocksToImage = (
                imageId: string,
                importBlocksRaw: unknown
            ): number => {
                const imageItem = images.find((img) => img.id === imageId)
                if (!imageItem) return 0
                const importBlocks = Array.isArray(importBlocksRaw)
                    ? (importBlocksRaw as ImportBlock[])
                    : []
                if (!importBlocks.length) return 0

                const nextBlocks = [...(imageItem.detectedTextBlocks || [])]
                if (!nextBlocks.length) return 0

                let changed = 0
                const usedMatchIndex = new Set<number>()
                importBlocks.forEach((item) => {
                    if (!item || typeof item !== "object") return
                    const translated = String(
                        item.translatedText ??
                        item.translation ??
                        item.content ??
                        item.text ??
                        ""
                    ).trim()
                    if (!translated) return

                    const numericIndex = Number(
                        item.index ??
                        item.id ??
                        -1
                    )
                    let targetIndex = Number.isFinite(numericIndex) ? Math.floor(numericIndex) : -1

                    if (targetIndex < 0 || targetIndex >= nextBlocks.length) {
                        const source = String(item.sourceText ?? "").trim()
                        if (source) {
                            const matchIndex = nextBlocks.findIndex((block, idx) => {
                                if (usedMatchIndex.has(idx)) return false
                                return (block.sourceText || "").trim() === source
                            })
                            if (matchIndex >= 0) {
                                targetIndex = matchIndex
                            }
                        }
                    }

                    if (targetIndex < 0 || targetIndex >= nextBlocks.length) return
                    usedMatchIndex.add(targetIndex)

                    const nextRich = plainTextToRichHtml(translated)
                    const prev = nextBlocks[targetIndex]
                    if (prev.translatedText === translated && (prev.richTextHtml || "") === nextRich) return

                    nextBlocks[targetIndex] = {
                        ...prev,
                        translatedText: translated,
                        richTextHtml: nextRich,
                    }
                    changed++
                })

                if (changed > 0) {
                    setDetectedTextBlocks(imageItem.id, nextBlocks)
                }
                return changed
            }

            const importedImages = Array.isArray(parsed.images)
                ? parsed.images as Array<Record<string, unknown>>
                : []

            let totalChanged = 0
            let matchedImages = 0
            let missedImages = 0

            if (importedImages.length > 0) {
                importedImages.forEach((item) => {
                    const imageId = String(item.imageId || "").trim()
                    const fileName = String(item.fileName || "").trim()
                    const matchedImage = imageId
                        ? images.find((img) => img.id === imageId)
                        : images.find((img) => img.file.name === fileName)
                    if (!matchedImage) {
                        missedImages++
                        return
                    }
                    const changed = applyImportedBlocksToImage(matchedImage.id, item.blocks)
                    if (changed > 0) {
                        matchedImages++
                        totalChanged += changed
                    }
                })
            } else {
                if (!currentImage) {
                    throw new Error(locale === "zh" ? "请先选择图片，再导入当前页翻译 JSON" : "Select an image before importing current-page translation JSON")
                }
                totalChanged = applyImportedBlocksToImage(
                    currentImage.id,
                    parsed.blocks ?? parsed.items ?? parsed
                )
                matchedImages = totalChanged > 0 ? 1 : 0
            }

            if (!totalChanged) {
                toast.warning(locale === "zh" ? "未匹配到可回填的译文" : "No translatable entries matched")
                return
            }

            const summary = locale === "zh"
                ? `已回填 ${totalChanged} 条译文（${matchedImages} 张图${missedImages > 0 ? `，${missedImages} 张未匹配` : ""}）`
                : `Applied ${totalChanged} translations (${matchedImages} images${missedImages > 0 ? `, ${missedImages} unmatched` : ""})`
            toast.success(summary)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : (locale === "zh" ? "导入译文 JSON 失败" : "Failed to import translated JSON"))
        }
    }, [currentImage, images, locale, setDetectedTextBlocks])

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
                        <div className="grid grid-cols-2 gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full"
                                onClick={handleExportSettings}
                            >
                                <FileJson className="h-4 w-4 mr-2" />
                                {locale === "zh" ? "导出设置" : "Export settings"}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full"
                                onClick={() => settingsImportInputRef.current?.click()}
                            >
                                <FolderOpen className="h-4 w-4 mr-2" />
                                {locale === "zh" ? "导入设置" : "Import settings"}
                            </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full"
                                onClick={() => imageOnlyBaseInputRef.current?.click()}
                                disabled={!currentImage}
                            >
                                <File className="h-4 w-4 mr-2" />
                                {locale === "zh" ? "设为底图" : "Set base image"}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full"
                                onClick={() => imageOnlyBaseBatchInputRef.current?.click()}
                                disabled={images.length === 0}
                            >
                                <FolderOpen className="h-4 w-4 mr-2" />
                                {locale === "zh" ? "批量匹配底图" : "Batch match bases"}
                            </Button>
                        </div>
                        {currentImage?.imageOnlyBaseUrl ? (
                            <div className="rounded-md border border-primary/30 bg-primary/5 px-2.5 py-2 text-[11px] space-y-1">
                                <p className="text-foreground/90">
                                    {locale === "zh" ? "当前底图：" : "Current base:"} {currentImage.imageOnlyBaseName || (locale === "zh" ? "已设置" : "Attached")}
                                </p>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-[11px]"
                                    onClick={() => clearImageOnlyBase(currentImage.id)}
                                >
                                    {locale === "zh" ? "清空底图" : "Clear base"}
                                </Button>
                            </div>
                        ) : (
                            <p className="text-[11px] text-muted-foreground">
                                {locale === "zh"
                                    ? "可选：为当前页指定无字底图，生成时会把译文直接贴到该底图。"
                                    : "Optional: attach an image-only base. Generated text will be composited onto that base."}
                            </p>
                        )}
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
                            ref={imageOnlyBaseInputRef}
                            type="file"
                            accept={EDITOR_IMAGE_ACCEPT}
                            aria-label={locale === "zh" ? "设置当前 image-only 底图" : "Set current image-only base"}
                            className="hidden"
                            onChange={(e) => {
                                void handleCurrentImageOnlyBaseUpload(e.target.files)
                                e.currentTarget.value = ""
                            }}
                        />
                        <input
                            ref={settingsImportInputRef}
                            type="file"
                            accept="application/json,.json"
                            aria-label={locale === "zh" ? "导入编辑器设置" : "Import editor settings"}
                            className="hidden"
                            onChange={(e) => {
                                void handleImportSettings(e.target.files)
                                e.currentTarget.value = ""
                            }}
                        />
                        <input
                            ref={imageOnlyBaseBatchInputRef}
                            type="file"
                            accept={EDITOR_IMAGE_ACCEPT}
                            multiple
                            aria-label={locale === "zh" ? "批量匹配 image-only 底图" : "Batch match image-only bases"}
                            className="hidden"
                            onChange={(e) => {
                                void handleBatchImageOnlyBaseUpload(e.target.files)
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
                                            "relative aspect-square overflow-hidden rounded-md border-2 transition-[border-color,box-shadow] duration-200",
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
                                        {img.imageOnlyBaseUrl && (
                                            <div className="absolute bottom-1 right-1 rounded bg-primary/90 px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground pointer-events-none">
                                                {locale === "zh" ? "底图" : "BASE"}
                                            </div>
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
                                    onValueChange={(value: TranslationDirection) =>
                                        updateSettings({ translationDirection: value })
                                    }
                                >
                                    <SelectTrigger id="translation-direction" className="h-9">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ja2zh">日 → 中</SelectItem>
                                        <SelectItem value="en2zh">英 → 中</SelectItem>
                                        <SelectItem value="th2zh">泰 → 中</SelectItem>
                                        <SelectItem value="es2zh">西 → 中</SelectItem>
                                        <SelectItem value="ar2zh">阿 → 中</SelectItem>
                                        <SelectItem value="id2zh">印尼 → 中</SelectItem>
                                        <SelectItem value="hi2zh">印地 → 中</SelectItem>
                                        <SelectItem value="fi2zh">芬兰 → 中</SelectItem>
                                        <SelectItem value="ja2en">日 → 英</SelectItem>
                                        <SelectItem value="th2en">泰 → 英</SelectItem>
                                        <SelectItem value="es2en">西 → 英</SelectItem>
                                        <SelectItem value="ar2en">阿 → 英</SelectItem>
                                        <SelectItem value="id2en">印尼 → 英</SelectItem>
                                        <SelectItem value="hi2en">印地 → 英</SelectItem>
                                        <SelectItem value="fi2en">芬兰 → 英</SelectItem>
                                        <SelectItem value="en2ja">英 → 日</SelectItem>
                                        <SelectItem value="ja2id">日 → 印尼</SelectItem>
                                        <SelectItem value="en2id">英 → 印尼</SelectItem>
                                        <SelectItem value="th2id">泰 → 印尼</SelectItem>
                                        <SelectItem value="es2id">西 → 印尼</SelectItem>
                                        <SelectItem value="ar2id">阿 → 印尼</SelectItem>
                                        <SelectItem value="ja2hi">日 → 印地</SelectItem>
                                        <SelectItem value="en2hi">英 → 印地</SelectItem>
                                        <SelectItem value="en2ar">英 → 阿</SelectItem>
                                        <SelectItem value="ja2ar">日 → 阿</SelectItem>
                                        <SelectItem value="en2fi">英 → 芬兰</SelectItem>
                                        <SelectItem value="ja2fi">日 → 芬兰</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="detection-region-mode" className="text-xs">
                                    {locale === "zh" ? "检测范围提示" : "Detection region hint"}
                                </Label>
                                <Select
                                    value={settings.detectionRegionMode ?? "full"}
                                    onValueChange={(value: "full" | "selection_only" | "selection_ignore") =>
                                        updateSettings({ detectionRegionMode: value })
                                    }
                                >
                                    <SelectTrigger id="detection-region-mode" className="h-9">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="full">{locale === "zh" ? "整图检测" : "Full image"}</SelectItem>
                                        <SelectItem value="selection_only">{locale === "zh" ? "仅选区检测" : "Selected areas only"}</SelectItem>
                                        <SelectItem value="selection_ignore">{locale === "zh" ? "忽略选区检测" : "Ignore selected areas"}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="ocr-engine-select" className="text-xs">
                                {locale === "zh" ? "OCR 引擎" : "OCR engine"}
                            </Label>
                            <Select
                                value={ocrEngine}
                                onValueChange={(value: "auto" | "comic_text_detector" | "manga_ocr" | "paddle_ocr" | "baidu_ocr" | "ai_vision") =>
                                    updateSettings({ ocrEngine: value })
                                }
                            >
                                <SelectTrigger id="ocr-engine-select" className="h-9">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="auto">
                                        {locale === "zh" ? "自动（CTD 优先，失败回退 AI 视觉）" : "Auto (CTD first, fallback to AI vision)"}
                                    </SelectItem>
                                    <SelectItem value="comic_text_detector">
                                        {locale === "zh" ? "CTD（仅 comic-text-detector）" : "CTD only"}
                                    </SelectItem>
                                    <SelectItem value="manga_ocr">
                                        {locale === "zh" ? "MangaOCR（仅后端适配）" : "MangaOCR (backend adapter only)"}
                                    </SelectItem>
                                    <SelectItem value="paddle_ocr">
                                        {locale === "zh" ? "PaddleOCR（仅后端适配）" : "PaddleOCR (backend adapter only)"}
                                    </SelectItem>
                                    <SelectItem value="baidu_ocr">
                                        {locale === "zh" ? "百度 OCR（仅后端适配）" : "Baidu OCR (backend adapter only)"}
                                    </SelectItem>
                                    <SelectItem value="ai_vision">
                                        {locale === "zh" ? "AI 视觉 OCR（Gemini/OpenAI）" : "AI vision OCR (Gemini/OpenAI)"}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {ocrEngine === "ai_vision" && (
                            <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-2.5">
                                <div className="flex items-center justify-between gap-2">
                                    <Label htmlFor="ocr-custom-config" className="text-xs">
                                        {locale === "zh" ? "独立 OCR 模型配置" : "Separate OCR model config"}
                                    </Label>
                                    <Switch
                                        id="ocr-custom-config"
                                        checked={aiVisionOcrUseCustomConfig}
                                        onCheckedChange={(checked) => updateSettings({ aiVisionOcrUseCustomConfig: checked })}
                                    />
                                </div>
                                {!aiVisionOcrUseCustomConfig && (
                                    <p className="text-[11px] text-muted-foreground">
                                        {locale === "zh"
                                            ? "当前复用主设置中的 Provider / API Key / Base URL / 模型。"
                                            : "Currently reuses main Provider / API key / Base URL / model settings."}
                                    </p>
                                )}
                                {aiVisionOcrUseCustomConfig && (
                                    <>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="ocr-provider-select" className="text-xs">
                                                {locale === "zh" ? "OCR Provider" : "OCR provider"}
                                            </Label>
                                            <Select
                                                value={aiVisionOcrProvider}
                                                onValueChange={(value: "gemini" | "openai") =>
                                                    updateSettings({ aiVisionOcrProvider: value })
                                                }
                                            >
                                                <SelectTrigger id="ocr-provider-select" className="h-8">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="gemini">Google Gemini</SelectItem>
                                                    <SelectItem value="openai">OpenAI / 兼容接口</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        {aiVisionOcrProvider === "openai" && (
                                            <div className="space-y-1.5">
                                                <Label htmlFor="ocr-provider-preset" className="text-xs">
                                                    {locale === "zh" ? "OCR 兼容服务商预设" : "OCR provider preset"}
                                                </Label>
                                                <Select
                                                    value={aiVisionOcrOpenaiPresetId}
                                                    onValueChange={(value) => {
                                                        if (value === "custom") {
                                                            return
                                                        }
                                                        const preset = getOpenAICompatibleProviderPreset(value)
                                                        if (!preset) {
                                                            return
                                                        }
                                                        updateSettings({
                                                            aiVisionOcrBaseUrl: preset.baseUrl,
                                                            aiVisionOcrModel: (settings.aiVisionOcrModel || "").trim() || preset.modelHint,
                                                        })
                                                    }}
                                                >
                                                    <SelectTrigger id="ocr-provider-preset" className="h-8">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {OPENAI_COMPATIBLE_PROVIDER_PRESETS.map((preset) => (
                                                            <SelectItem key={preset.id} value={preset.id}>
                                                                {preset.label}
                                                            </SelectItem>
                                                        ))}
                                                        <SelectItem value="custom">
                                                            {locale === "zh" ? "自定义" : "Custom"}
                                                        </SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}
                                        <div className="space-y-1.5">
                                            <Label htmlFor="ocr-base-url" className="text-xs">Base URL</Label>
                                            <Input
                                                id="ocr-base-url"
                                                value={settings.aiVisionOcrBaseUrl || ""}
                                                onChange={(e) => updateSettings({ aiVisionOcrBaseUrl: e.target.value })}
                                                placeholder={
                                                    aiVisionOcrProvider === "openai"
                                                        ? "https://api.openai.com/v1"
                                                        : "https://generativelanguage.googleapis.com"
                                                }
                                                className="h-8 text-xs"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="ocr-api-key" className="text-xs">OCR API Key</Label>
                                            <Input
                                                id="ocr-api-key"
                                                type="password"
                                                value={settings.aiVisionOcrApiKey || ""}
                                                onChange={(e) => updateSettings({ aiVisionOcrApiKey: e.target.value })}
                                                placeholder={locale === "zh" ? "输入 OCR 专用 API Key" : "Enter OCR API key"}
                                                className="h-8 text-xs"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="ocr-model" className="text-xs">
                                                {locale === "zh" ? "OCR 模型" : "OCR model"}
                                            </Label>
                                            <Input
                                                id="ocr-model"
                                                value={settings.aiVisionOcrModel || ""}
                                                onChange={(e) => updateSettings({ aiVisionOcrModel: e.target.value })}
                                                placeholder={
                                                    aiVisionOcrProvider === "openai"
                                                        ? "claude-3.5-sonnet / gpt-4o-mini / ... "
                                                        : "gemini-2.5-flash / ..."
                                                }
                                                className="h-8 text-xs"
                                            />
                                        </div>
                                        <p className="text-[11px] text-muted-foreground">
                                            {locale === "zh"
                                                ? "用于 AI 视觉 OCR（文本识别）；生图仍使用主模型设置。"
                                                : "Used for AI vision OCR only; image generation still uses main model settings."}
                                        </p>
                                    </>
                                )}
                            </div>
                        )}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                                <Label className="text-xs">
                                    {locale === "zh" ? "仅翻译源语言" : "Translate from only"}
                                </Label>
                                <Button
                                    type="button"
                                    variant={(settings.sourceLanguageAllowlist ?? []).length === 0 ? "default" : "outline"}
                                    size="sm"
                                    className="h-7 px-2 text-[11px]"
                                    onClick={() => updateSettings({ sourceLanguageAllowlist: [] })}
                                >
                                    {locale === "zh" ? "自动" : "Auto"}
                                </Button>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {SOURCE_LANGUAGE_FILTER_OPTIONS.map((item) => {
                                    const selected = (settings.sourceLanguageAllowlist ?? []).includes(item.code)
                                    return (
                                        <Button
                                            key={item.code}
                                            type="button"
                                            variant={selected ? "default" : "outline"}
                                            size="sm"
                                            className="h-7 px-2 text-[11px]"
                                            title={item.fullLabel}
                                            onClick={() => toggleSourceLanguageAllowlist(item.code)}
                                        >
                                            {item.shortLabel}
                                        </Button>
                                    )
                                })}
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                                {locale === "zh"
                                    ? "用于限制 OCR 只识别指定语种，减少误把噪声当成其他语言。"
                                    : "Limit OCR to selected source languages to reduce noisy mis-detections."}
                            </p>
                        </div>
                        <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-2.5">
                            <div className="flex items-center justify-between gap-2">
                                <Label htmlFor="enable-angle-filter" className="text-xs">
                                    {locale === "zh" ? "过滤倾斜文本" : "Filter angled text"}
                                </Label>
                                <Switch
                                    id="enable-angle-filter"
                                    checked={settings.enableAngleFilter ?? false}
                                    onCheckedChange={(checked) => updateSettings({ enableAngleFilter: checked })}
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <Label htmlFor="angle-threshold" className="text-[11px] text-muted-foreground whitespace-nowrap">
                                    {locale === "zh" ? "角度阈值 ±" : "Angle ±"}
                                </Label>
                                <Input
                                    id="angle-threshold"
                                    type="number"
                                    min={0}
                                    max={45}
                                    step="0.1"
                                    className="h-8"
                                    value={String(settings.angleThreshold ?? 1)}
                                    onChange={(event) => {
                                        const raw = Number(event.target.value)
                                        const nextValue = Number.isFinite(raw) ? Math.max(0, Math.min(45, raw)) : 1
                                        updateSettings({ angleThreshold: nextValue })
                                    }}
                                />
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                                {locale === "zh"
                                    ? "启用后仅保留 angle 在阈值范围内的文本块（常用于排除拟声词）。"
                                    : "When enabled, keeps only blocks whose angle is within threshold (useful to skip SFX)."}
                            </p>
                        </div>
                        <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-2.5">
                            <div className="flex items-center justify-between gap-2">
                                <Label htmlFor="suppress-furigana" className="text-xs">
                                    {locale === "zh" ? "注音假名过滤" : "Suppress furigana"}
                                </Label>
                                <Switch
                                    id="suppress-furigana"
                                    checked={settings.suppressFurigana ?? false}
                                    onCheckedChange={(checked) => updateSettings({ suppressFurigana: checked })}
                                />
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                                {locale === "zh"
                                    ? "尝试过滤小尺寸假名注音块，减少漏擦与脏边（复杂页面建议按需开关）。"
                                    : "Heuristically removes tiny furigana blocks to reduce unclean renders on complex pages."}
                            </p>
                        </div>
                        <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-2.5">
                            <div className="flex items-center justify-between gap-2">
                                <Label htmlFor="auto-text-color-adapt" className="text-xs">
                                    {locale === "zh" ? "自动适配文字颜色" : "Auto text color adaptation"}
                                </Label>
                                <Switch
                                    id="auto-text-color-adapt"
                                    checked={settings.autoTextColorAdapt ?? true}
                                    onCheckedChange={(checked) => updateSettings({ autoTextColorAdapt: checked })}
                                />
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                                {locale === "zh"
                                    ? "根据原文颜色自动做颜色锚点与后处理，避免角色台词统一变黑。"
                                    : "Uses source color anchors and post-correction to avoid turning all text black."}
                            </p>
                        </div>
                        <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-2.5">
                            <div className="flex items-center justify-between gap-2">
                                <Label htmlFor="bulk-text-translate-ocr" className="text-xs">
                                    {locale === "zh" ? "OCR 文本批量翻译（单次调用）" : "Bulk OCR text translation (single call)"}
                                </Label>
                                <Switch
                                    id="bulk-text-translate-ocr"
                                    checked={settings.bulkTextTranslateOcr ?? false}
                                    onCheckedChange={(checked) => updateSettings({ bulkTextTranslateOcr: checked })}
                                />
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                                {locale === "zh"
                                    ? "预翻译后将多个文本块打包一次请求翻译，降低调用次数并增强上下文一致性。"
                                    : "After OCR, send multiple blocks in one translation request for better consistency and fewer calls."}
                            </p>
                        </div>
                        <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-2.5">
                            <div className="flex items-center justify-between gap-2">
                                <Label htmlFor="strip-reasoning-content" className="text-xs">
                                    {locale === "zh" ? "剥离深度思考内容" : "Strip reasoning content"}
                                </Label>
                                <Switch
                                    id="strip-reasoning-content"
                                    checked={settings.stripReasoningContent ?? true}
                                    onCheckedChange={(checked) => updateSettings({ stripReasoningContent: checked })}
                                />
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                                {locale === "zh"
                                    ? "自动移除模型输出中的 <think>/<analysis> 等推理片段，只保留最终译文。"
                                    : "Removes model reasoning sections like <think>/<analysis> and keeps only final translation text."}
                            </p>
                        </div>
                        <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-2.5">
                            <div className="flex items-center justify-between gap-2">
                                <Label htmlFor="single-retranslate-deep-mode" className="text-xs">
                                    {locale === "zh" ? "单句重翻译深度模式" : "Single-line retranslate deep mode"}
                                </Label>
                                <Switch
                                    id="single-retranslate-deep-mode"
                                    checked={settings.singleRetranslateDeepMode ?? false}
                                    onCheckedChange={(checked) => updateSettings({ singleRetranslateDeepMode: checked })}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="single-retranslate-context-window" className="text-xs">
                                    {locale === "zh" ? "单句重翻译上下文窗口（前后条数）" : "Single-line context window (neighbor count)"}
                                </Label>
                                <Input
                                    id="single-retranslate-context-window"
                                    type="number"
                                    min={0}
                                    max={8}
                                    step={1}
                                    className="h-8"
                                    value={String(settings.singleRetranslateContextWindow ?? 2)}
                                    onChange={(event) => {
                                        const raw = Number(event.target.value)
                                        const nextValue = Number.isFinite(raw) ? Math.max(0, Math.min(8, Math.floor(raw))) : 2
                                        updateSettings({ singleRetranslateContextWindow: nextValue })
                                    }}
                                />
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                                {locale === "zh"
                                    ? "用于“带上下文重翻译”按钮：可携带邻近台词上下文，深度模式会更重视语气与语境。"
                                    : "Used by the 'Context Retranslate' quick button: include nearby lines as context; deep mode emphasizes tone and discourse coherence."}
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
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
                            <div className="space-y-1.5">
                                <Label htmlFor="chapter-bulk-translate" className="text-xs">
                                    {locale === "zh" ? "章节批量上下文" : "Chapter bulk context"}
                                </Label>
                                <div className="h-9 rounded-md border border-input bg-background px-2.5 flex items-center justify-between">
                                    <span className="text-[11px] text-muted-foreground">
                                        {locale === "zh" ? "批量生成时统一术语" : "Keep terms consistent in batch"}
                                    </span>
                                    <Switch
                                        id="chapter-bulk-translate"
                                        checked={settings.chapterBulkTranslate ?? false}
                                        onCheckedChange={(checked) => updateSettings({ chapterBulkTranslate: checked })}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="h-9 rounded-md border border-input bg-background px-2.5 flex items-center justify-between">
                            <span className="text-[11px] text-muted-foreground">
                                {locale === "zh" ? "慢速回退重试（防截断）" : "Slow fallback retry (anti-clipping)"}
                            </span>
                            <Switch
                                id="enable-slow-generation-fallbacks"
                                checked={settings.enableSlowGenerationFallbacks ?? false}
                                onCheckedChange={(checked) => updateSettings({ enableSlowGenerationFallbacks: checked })}
                            />
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                            {locale === "zh"
                                ? "关闭后可减少 Gemini 超时与等待；开启后会在疑似截断时额外发起重试。"
                                : "Keep this off to reduce Gemini timeout/latency. Turn on only when clipping is severe and extra retries are acceptable."}
                        </p>
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
                        <div className="space-y-1.5">
                            <Label htmlFor="preferred-output-font" className="text-xs">
                                {locale === "zh" ? "翻译字体（可选）" : "Preferred output font (optional)"}
                            </Label>
                            <Input
                                id="preferred-output-font"
                                value={settings.preferredOutputFontFamily ?? ""}
                                onChange={(event) => updateSettings({ preferredOutputFontFamily: event.target.value })}
                                placeholder={locale === "zh" ? "例如：PingFang SC / 思源黑体" : "e.g. PingFang SC / Noto Sans"}
                                className="h-9"
                            />
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
                                <div className="h-9 rounded-md border border-input bg-background px-2.5 flex items-center justify-between">
                                    <span className="text-[11px] text-muted-foreground">
                                        {locale === "zh" ? "分步模式（OCR->翻译）" : "Stage mode (OCR->Translate)"}
                                    </span>
                                    <Switch
                                        id="enable-staged-pipeline"
                                        checked={settings.enableStagedPipeline ?? false}
                                        onCheckedChange={(checked) => updateSettings({ enableStagedPipeline: checked })}
                                    />
                                </div>
                                {settings.enableStagedPipeline ? (
                                    <>
                                        <div className="grid grid-cols-2 gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="w-full"
                                                onClick={() => void handleAutoDetectAllImages()}
                                                disabled={isBatchAutoDetecting || isBatchTranslatingDetected || !canRunAutoDetect || !images.length}
                                            >
                                                {isBatchAutoDetecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                {locale === "zh" ? "阶段1：全部OCR" : "Stage 1: OCR all"}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="w-full"
                                                onClick={() => void handleTranslateDetectedForAllImages()}
                                                disabled={isBatchAutoDetecting || isBatchTranslatingDetected || (!settings.useServerApi && !settings.apiKey) || !images.length}
                                            >
                                                {isBatchTranslatingDetected && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                {locale === "zh" ? "阶段2：全部翻译" : "Stage 2: Translate all"}
                                            </Button>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground">
                                            {locale === "zh"
                                                ? "分步模式：先跑全部 OCR，再跑全部翻译，避免识别/翻译模型来回切换。"
                                                : "Stage mode: run OCR for all pages first, then translate all OCR texts to avoid frequent model switching."}
                                        </p>
                                        {batchStageProgressText && (
                                            <p className="text-[11px] text-muted-foreground">
                                                {batchStageProgressText}
                                            </p>
                                        )}
                                    </>
                                ) : (
                                    <p className="text-[11px] text-muted-foreground">
                                        {locale === "zh"
                                            ? "已关闭分步模式。默认直接按当前流程处理。"
                                            : "Stage mode is off. Current direct workflow is used by default."}
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
                                            onClick={handleExportPlainText}
                                            disabled={!currentImage || detectedBlocks.length === 0}
                                        >
                                            {locale === "zh" ? "导出纯文本" : "Export TXT"}
                                        </Button>
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
                                    <div className="grid grid-cols-2 gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="h-8 text-xs"
                                            onClick={() => handleExportSourceText("current")}
                                            disabled={!currentImage || detectedBlocks.length === 0}
                                        >
                                            {locale === "zh" ? "导出原文（当前）" : "Export Source (Current)"}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="h-8 text-xs"
                                            onClick={() => handleExportSourceText("all")}
                                            disabled={!images.some((img) => (img.detectedTextBlocks || []).length > 0)}
                                        >
                                            {locale === "zh" ? "导出原文（全部）" : "Export Source (All)"}
                                        </Button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="h-8 text-xs"
                                            onClick={() => handleExportOcrSourceJson("current")}
                                            disabled={!currentImage || detectedBlocks.length === 0}
                                        >
                                            {locale === "zh" ? "导出 OCR JSON（当前）" : "Export OCR JSON (Current)"}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="h-8 text-xs"
                                            onClick={() => handleExportOcrSourceJson("all")}
                                            disabled={!images.some((img) => (img.detectedTextBlocks || []).length > 0)}
                                        >
                                            {locale === "zh" ? "导出 OCR JSON（全部）" : "Export OCR JSON (All)"}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="h-8 text-xs col-span-2"
                                            onClick={() => ocrJsonImportInputRef.current?.click()}
                                            disabled={!images.length}
                                        >
                                            {locale === "zh" ? "导入翻译 JSON 回填" : "Import translated JSON"}
                                        </Button>
                                        <input
                                            ref={ocrJsonImportInputRef}
                                            type="file"
                                            accept=".json"
                                            className="hidden"
                                            aria-label={locale === "zh" ? "导入翻译 JSON" : "Import translated JSON"}
                                            onChange={(event) => {
                                                const file = event.target.files?.[0]
                                                if (!file) return
                                                void handleImportOcrTranslatedJson(file)
                                                event.currentTarget.value = ""
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
                                                    <div className="mb-2 flex items-center justify-between gap-2">
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
                                                        <div className="flex items-center gap-1">
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-7 px-2 text-[11px]"
                                                                onClick={(event) => void handleRetranslateDetectedBlock(
                                                                    index,
                                                                    "current_only",
                                                                    { forceDeepMode: event.altKey }
                                                                )}
                                                                disabled={retranslatingBlockSet.has(index) || !(block.sourceText || "").trim()}
                                                                title={
                                                                    locale === "zh"
                                                                        ? "仅重翻译当前句，不带邻近上下文。按住 Alt 点击可仅本次启用深度模式。"
                                                                        : "Retranslate current sentence only without neighboring context. Hold Alt while clicking to enable one-off deep mode."
                                                                }
                                                            >
                                                                {retranslatingBlockSet.has(index) ? (
                                                                    <>
                                                                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                                                        {locale === "zh" ? "处理中" : "Running"}
                                                                    </>
                                                                ) : (
                                                                    locale === "zh" ? "仅当前句" : "Current only"
                                                                )}
                                                            </Button>
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-7 px-2 text-[11px]"
                                                                onClick={() => void handleRetranslateDetectedBlock(index, "with_context")}
                                                                disabled={retranslatingBlockSet.has(index) || !(block.sourceText || "").trim()}
                                                                title={locale === "zh" ? "带上下文窗口进行重翻译（推荐）" : "Retranslate with nearby context window (recommended)"}
                                                            >
                                                                {retranslatingBlockSet.has(index) ? (
                                                                    <>
                                                                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                                                        {locale === "zh" ? "处理中" : "Running"}
                                                                    </>
                                                                ) : (
                                                                    locale === "zh" ? "带上下文" : "With context"
                                                                )}
                                                            </Button>
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-7 px-2 text-[11px]"
                                                                onClick={() => openScreenshotTranslateDialog(index)}
                                                                title={locale === "zh" ? "上传句子截图，调用 OpenAI 视觉翻译并回填当前文本块" : "Upload sentence screenshot, run OpenAI vision translation and apply"}
                                                            >
                                                                <ImagePlus className="mr-1 h-3 w-3" />
                                                                {locale === "zh" ? "截图句翻" : "Img sentence"}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                    <div className="grid gap-2 md:grid-cols-2">
                                                        <div className="space-y-1">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <Label className="text-[10px] text-muted-foreground">
                                                                    {locale === "zh" ? "原文（可编辑）" : "Source (editable)"}
                                                                </Label>
                                                                <div className="flex items-center gap-1">
                                                                    <Button
                                                                        type="button"
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-6 px-2 text-[10px]"
                                                                        disabled={convertingBlockTextKey === `source-s2t-${index}`}
                                                                        onClick={() => void convertDetectedBlockText(index, "source", "s2t")}
                                                                    >
                                                                        {locale === "zh" ? "简→繁" : "S→T"}
                                                                    </Button>
                                                                    <Button
                                                                        type="button"
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-6 px-2 text-[10px]"
                                                                        disabled={convertingBlockTextKey === `source-t2s-${index}`}
                                                                        onClick={() => void convertDetectedBlockText(index, "source", "t2s")}
                                                                    >
                                                                        {locale === "zh" ? "繁→简" : "T→S"}
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                            <Textarea
                                                                value={block.sourceText || ""}
                                                                onChange={(e) => handleDetectedSourceEdit(index, e.target.value)}
                                                                placeholder={locale === "zh" ? "输入或修正原文" : "Edit source text"}
                                                                className="min-h-[64px] text-xs"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <Label className="text-[10px] text-muted-foreground">
                                                                    {locale === "zh" ? "译文（富文本 WYSIWYG）" : "Translation (WYSIWYG)"}
                                                                </Label>
                                                                <div className="flex items-center gap-1">
                                                                    <Button
                                                                        type="button"
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-6 px-2 text-[10px]"
                                                                        disabled={convertingBlockTextKey === `translated-s2t-${index}`}
                                                                        onClick={() => void convertDetectedBlockText(index, "translated", "s2t")}
                                                                    >
                                                                        {locale === "zh" ? "简→繁" : "S→T"}
                                                                    </Button>
                                                                    <Button
                                                                        type="button"
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-6 px-2 text-[10px]"
                                                                        disabled={convertingBlockTextKey === `translated-t2s-${index}`}
                                                                        onClick={() => void convertDetectedBlockText(index, "translated", "t2s")}
                                                                    >
                                                                        {locale === "zh" ? "繁→简" : "T→S"}
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                            <RichTextEditor
                                                                value={block.richTextHtml || block.translatedText || ""}
                                                                locale={locale}
                                                                placeholder={locale === "zh" ? "输入修正译文" : "Edit translated text"}
                                                                onChange={(html) => handleDetectedTextEdit(index, html)}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <Label className="text-[10px] text-muted-foreground">
                                                            {locale === "zh" ? "旋转角度" : "Rotation angle"}
                                                        </Label>
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-6 px-2 text-[10px]"
                                                            onClick={() => handleDetectedAngleNudge(index, -0.5)}
                                                        >
                                                            -0.5°
                                                        </Button>
                                                        <Input
                                                            type="number"
                                                            className="h-6 w-24 text-[10px]"
                                                            value={String(
                                                                Number.isFinite(Number(block.style?.angle))
                                                                    ? Number(block.style?.angle)
                                                                    : 0
                                                            )}
                                                            min={-180}
                                                            max={180}
                                                            step={0.5}
                                                            onChange={(event) => {
                                                                const value = Number(event.target.value)
                                                                handleDetectedAngleEdit(index, value)
                                                            }}
                                                        />
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-6 px-2 text-[10px]"
                                                            onClick={() => handleDetectedAngleNudge(index, 0.5)}
                                                        >
                                                            +0.5°
                                                        </Button>
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
                                    <div className="space-y-1.5 rounded-md border border-border/50 bg-background/60 px-2.5 py-2">
                                        <Label htmlFor="repair-engine-select" className="text-xs">
                                            {locale === "zh" ? "修补引擎" : "Repair engine"}
                                        </Label>
                                        <Select
                                            value={repairEngine}
                                            onValueChange={(value: "ai" | "lama") => updateSettings({ repairEngine: value })}
                                            disabled={!isPatchEditorEnabled}
                                        >
                                            <SelectTrigger id="repair-engine-select" className="h-8">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="ai">
                                                    {locale === "zh" ? "AI 重绘（当前模型）" : "AI repaint (current model)"}
                                                </SelectItem>
                                                <SelectItem value="lama">
                                                    {locale === "zh" ? "LAMA 修复服务（后端）" : "LAMA inpaint service (backend)"}
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
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

                            <div className="space-y-3 rounded-lg border border-border/60 bg-muted/40 p-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="space-y-0.5">
                                        <Label htmlFor="hq-mode-enable" className="cursor-pointer">
                                            {locale === "zh" ? "高质量翻译模式 (Beta)" : "High-quality Translation (Beta)"}
                                        </Label>
                                        <p className="text-xs text-muted-foreground">
                                            {locale === "zh"
                                                ? "结合多图上下文提高一致性；会增加处理时间和配额消耗。"
                                                : "Uses multi-page context for better consistency, with higher time and token cost."}
                                        </p>
                                    </div>
                                    <Switch
                                        id="hq-mode-enable"
                                        checked={settings.highQualityMode ?? false}
                                        onCheckedChange={(checked) => updateSettings({ highQualityMode: checked })}
                                    />
                                </div>

                                {settings.highQualityMode && (
                                    <>
                                        <Separator />
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="space-y-1.5">
                                                <Label htmlFor="hq-batch-size" className="text-xs">
                                                    {locale === "zh" ? "每批图片数" : "Batch size"}
                                                </Label>
                                                <Input
                                                    id="hq-batch-size"
                                                    type="number"
                                                    min={1}
                                                    max={20}
                                                    className="h-9"
                                                    value={String(settings.highQualityBatchSize ?? 4)}
                                                    onChange={(e) => {
                                                        const raw = Number(e.target.value)
                                                        const nextValue = Number.isFinite(raw) ? Math.max(1, Math.min(20, Math.round(raw))) : 4
                                                        updateSettings({ highQualityBatchSize: nextValue })
                                                    }}
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label htmlFor="hq-reset-batches" className="text-xs">
                                                    {locale === "zh" ? "记忆重置批次" : "Session reset batches"}
                                                </Label>
                                                <Input
                                                    id="hq-reset-batches"
                                                    type="number"
                                                    min={1}
                                                    max={50}
                                                    className="h-9"
                                                    value={String(settings.highQualitySessionResetBatches ?? 3)}
                                                    onChange={(e) => {
                                                        const raw = Number(e.target.value)
                                                        const nextValue = Number.isFinite(raw) ? Math.max(1, Math.min(50, Math.round(raw))) : 3
                                                        updateSettings({ highQualitySessionResetBatches: nextValue })
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label htmlFor="hq-rpm-limit" className="text-xs">
                                                {locale === "zh" ? "RPM 限制（0=不限制）" : "RPM limit (0=off)"}
                                            </Label>
                                            <Input
                                                id="hq-rpm-limit"
                                                type="number"
                                                min={0}
                                                max={300}
                                                className="h-9"
                                                value={String(settings.highQualityRpmLimit ?? 0)}
                                                onChange={(e) => {
                                                    const raw = Number(e.target.value)
                                                    const nextValue = Number.isFinite(raw) ? Math.max(0, Math.min(300, Math.round(raw))) : 0
                                                    updateSettings({ highQualityRpmLimit: nextValue })
                                                }}
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="flex items-center justify-between rounded-md border border-border/50 bg-background/60 px-2.5 py-2">
                                                <Label htmlFor="hq-low-reasoning" className="text-xs cursor-pointer">
                                                    {locale === "zh" ? "低推理模式" : "Low reasoning mode"}
                                                </Label>
                                                <Switch
                                                    id="hq-low-reasoning"
                                                    checked={settings.highQualityLowReasoning ?? false}
                                                    onCheckedChange={(checked) => updateSettings({ highQualityLowReasoning: checked })}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between rounded-md border border-border/50 bg-background/60 px-2.5 py-2">
                                                <Label htmlFor="hq-force-json" className="text-xs cursor-pointer">
                                                    {locale === "zh" ? "强制 JSON 上下文" : "Force JSON context"}
                                                </Label>
                                                <Switch
                                                    id="hq-force-json"
                                                    checked={settings.highQualityForceJson ?? true}
                                                    onCheckedChange={(checked) => updateSettings({ highQualityForceJson: checked })}
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label htmlFor="hq-context-prompt" className="text-xs">
                                                {locale === "zh" ? "上下文提示词（可选）" : "Context prompt (optional)"}
                                            </Label>
                                            <Textarea
                                                id="hq-context-prompt"
                                                className="min-h-[84px] resize-none text-xs"
                                                value={settings.highQualityContextPrompt ?? ""}
                                                onChange={(e) => updateSettings({ highQualityContextPrompt: e.target.value })}
                                                placeholder={
                                                    locale === "zh"
                                                        ? "例如：保持角色口吻一致，专有名词不漂移，拟声词尽量短促。"
                                                        : "e.g. Keep character voice consistent, preserve terms, keep SFX concise."
                                                }
                                            />
                                        </div>
                                    </>
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

                                    {/* Base URL */}
                                    {settings.provider === "openai" ? (
                                        <>
                                            <div className="space-y-2">
                                                <Label htmlFor="editor-provider-preset">
                                                    {locale === "zh" ? "兼容服务商预设" : "Compatible provider preset"}
                                                </Label>
                                                <Select
                                                    value={openaiProviderPresetId}
                                                    onValueChange={(value) => {
                                                        if (value === "custom") {
                                                            return
                                                        }
                                                        const preset = getOpenAICompatibleProviderPreset(value)
                                                        if (!preset) {
                                                            return
                                                        }
                                                        updateSettings({
                                                            baseUrl: preset.baseUrl,
                                                            model: (settings.model || "").trim() || preset.modelHint,
                                                        })
                                                        toast.success(
                                                            locale === "zh"
                                                                ? `已切换到 ${preset.label} 预设`
                                                                : `Switched to ${preset.label} preset`
                                                        )
                                                    }}
                                                >
                                                    <SelectTrigger id="editor-provider-preset">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {OPENAI_COMPATIBLE_PROVIDER_PRESETS.map((preset) => (
                                                            <SelectItem key={preset.id} value={preset.id}>
                                                                {preset.label}
                                                            </SelectItem>
                                                        ))}
                                                        <SelectItem value="custom">
                                                            {locale === "zh" ? "自定义" : "Custom"}
                                                        </SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <p className="text-xs text-muted-foreground">
                                                    {locale === "zh"
                                                        ? "内置：OpenAI / SiliconFlow / DeepSeek / 火山引擎 / Ollama / Sakura。"
                                                        : "Built-in presets: OpenAI / SiliconFlow / DeepSeek / Volcengine / Ollama / Sakura."}
                                                </p>
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="editor-base-url">{t.editor.settings.baseUrl}</Label>
                                                <Input
                                                    id="editor-base-url"
                                                    value={settings.baseUrl}
                                                    onChange={(e) => updateSettings({ baseUrl: e.target.value })}
                                                    placeholder={t.editor.settings.baseUrlPlaceholder}
                                                />
                                            </div>
                                        </>
                                    ) : (
                                        <div className="space-y-2">
                                            <Label htmlFor="editor-base-url">{t.editor.settings.baseUrl}</Label>
                                            <Input
                                                id="editor-base-url"
                                                value={settings.baseUrl}
                                                onChange={(e) => updateSettings({ baseUrl: e.target.value })}
                                                placeholder="https://generativelanguage.googleapis.com"
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                {locale === "zh"
                                                    ? "可选：填写支持 Gemini 官方格式的中转地址；留空将使用官方默认地址。"
                                                    : "Optional: set a Gemini-official-format relay base URL. Leave empty to use the official default endpoint."}
                                            </p>
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

                                    <div className="space-y-2">
                                        <Label htmlFor="editor-export-naming-mode">
                                            {locale === "zh" ? "导出命名" : "Export naming"}
                                        </Label>
                                        <Select
                                            value={settings.exportNamingMode ?? "original"}
                                            onValueChange={(value: "original" | "sequence") =>
                                                updateSettings({ exportNamingMode: value })
                                            }
                                        >
                                            <SelectTrigger id="editor-export-naming-mode">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="original">
                                                    {locale === "zh" ? "保留原文件名" : "Keep original filename"}
                                                </SelectItem>
                                                <SelectItem value="sequence">
                                                    {locale === "zh" ? "按序号命名（image+数字）" : "Sequence (image+number)"}
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {(settings.exportNamingMode ?? "original") === "sequence" && (
                                        <div className="space-y-2">
                                            <Label htmlFor="editor-export-sequence-start">
                                                {locale === "zh" ? "起始编号" : "Start number"}
                                            </Label>
                                            <Input
                                                id="editor-export-sequence-start"
                                                type="number"
                                                min={0}
                                                step={1}
                                                value={String(settings.exportSequenceStart ?? 1)}
                                                onChange={(event) => {
                                                    const raw = Number(event.target.value)
                                                    const nextValue = Number.isFinite(raw)
                                                        ? Math.max(0, Math.floor(raw))
                                                        : 1
                                                    updateSettings({ exportSequenceStart: nextValue })
                                                }}
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

            <Dialog
                open={screenshotTranslateOpen}
                onOpenChange={(open) => {
                    if (open) {
                        setScreenshotTranslateOpen(true)
                        return
                    }
                    closeScreenshotTranslateDialog()
                }}
            >
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>
                            {locale === "zh" ? "截图单句翻译" : "Screenshot Sentence Translation"}
                        </DialogTitle>
                        <DialogDescription>
                            {locale === "zh"
                                ? "上传包含完整句子的截图，使用视觉模型翻译并回填到当前文本块。"
                                : "Upload a screenshot containing a full sentence, then translate and apply to current text block."}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <input
                            ref={screenshotTranslateInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            aria-label={locale === "zh" ? "上传截图" : "Upload screenshot"}
                            onChange={(event) => {
                                const file = event.target.files?.[0] || null
                                void handleScreenshotTranslateUpload(file)
                                event.currentTarget.value = ""
                            }}
                        />
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            onClick={() => screenshotTranslateInputRef.current?.click()}
                        >
                            <ImagePlus className="mr-2 h-4 w-4" />
                            {screenshotTranslateImageData
                                ? (locale === "zh" ? "更换截图" : "Replace screenshot")
                                : (locale === "zh" ? "上传截图" : "Upload screenshot")}
                        </Button>

                        {screenshotTranslateImageData && (
                            <div className="rounded-md border border-border/60 bg-muted/20 p-2">
                                <p className="mb-2 text-xs text-muted-foreground truncate">
                                    {screenshotTranslateImageName || (locale === "zh" ? "截图预览" : "Screenshot preview")}
                                </p>
                                <div className="overflow-hidden rounded border border-border/50 bg-background">
                                    <Image
                                        src={screenshotTranslateImageData}
                                        alt={locale === "zh" ? "截图预览" : "Screenshot preview"}
                                        width={960}
                                        height={540}
                                        className="h-auto max-h-60 w-full object-contain"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <Label htmlFor="screenshot-translate-extra-prompt" className="text-xs">
                                {locale === "zh" ? "补充提示（可选）" : "Extra instruction (optional)"}
                            </Label>
                            <Textarea
                                id="screenshot-translate-extra-prompt"
                                value={screenshotTranslateExtraPrompt}
                                onChange={(event) => setScreenshotTranslateExtraPrompt(event.target.value)}
                                placeholder={locale === "zh" ? "例如：保留口语语气，避免过度书面化。" : "e.g. keep colloquial tone and avoid over-formal wording."}
                                rows={3}
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={closeScreenshotTranslateDialog}
                            disabled={isScreenshotTranslating}
                        >
                            {locale === "zh" ? "取消" : "Cancel"}
                        </Button>
                        <Button
                            type="button"
                            onClick={() => void handleApplyScreenshotTranslate()}
                            disabled={!screenshotTranslateImageData || isScreenshotTranslating || screenshotTranslateBlockIndex === null}
                        >
                            {isScreenshotTranslating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {locale === "zh" ? "翻译并回填" : "Translate & Apply"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

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
                                <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-2">
                                    <div className="flex items-center gap-2">
                                        <div className="relative flex-1">
                                            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                            <Input
                                                value={sidecarPreviewKeyword}
                                                onChange={(e) => setSidecarPreviewKeyword(e.target.value)}
                                                placeholder={locale === "zh" ? "搜索台词或文件名" : "Search dialogue or file name"}
                                                className="h-8 pl-7 text-xs"
                                                aria-label={locale === "zh" ? "搜索预览详情" : "Search preview details"}
                                            />
                                        </div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-8 px-2 text-xs"
                                            onClick={() => jumpSidecarPreviewMatch("prev")}
                                            disabled={!sidecarPreviewMatchedIndices.length}
                                        >
                                            {locale === "zh" ? "上一个" : "Prev"}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-8 px-2 text-xs"
                                            onClick={() => jumpSidecarPreviewMatch("next")}
                                            disabled={!sidecarPreviewMatchedIndices.length}
                                        >
                                            {locale === "zh" ? "下一个" : "Next"}
                                        </Button>
                                    </div>
                                    {normalizedSidecarPreviewKeyword && (
                                        <p className="text-[11px] text-muted-foreground">
                                            {sidecarPreviewMatchedIndices.length > 0
                                                ? (
                                                    locale === "zh"
                                                        ? `命中 ${sidecarPreviewMatchedIndices.length} 页，当前 ${Math.min(sidecarPreviewMatchCursor + 1, sidecarPreviewMatchedIndices.length)}/${sidecarPreviewMatchedIndices.length}`
                                                        : `${sidecarPreviewMatchedIndices.length} page(s) matched, current ${Math.min(sidecarPreviewMatchCursor + 1, sidecarPreviewMatchedIndices.length)}/${sidecarPreviewMatchedIndices.length}`
                                                )
                                                : (
                                                    locale === "zh"
                                                        ? "未命中，尝试更换关键词。"
                                                        : "No match. Try another keyword."
                                                )}
                                        </p>
                                    )}
                                </div>
                                <ScrollArea className="max-h-44 rounded-md border border-border/60 bg-background/60">
                                    <div className="divide-y divide-border/40">
                                        {sidecarImportPlan.previewDetails.map((detail, index) => (
                                            <div
                                                key={`${detail.fileName}-${index}`}
                                                id={`sidecar-preview-row-${index}`}
                                                className={cn(
                                                    "px-3 py-2 transition-colors",
                                                    sidecarPreviewMatchedIndexSet.has(index) && "bg-amber-100/40 dark:bg-amber-500/10",
                                                    currentMatchedDetailIndex === index && "ring-1 ring-amber-500/60"
                                                )}
                                            >
                                                <button
                                                    type="button"
                                                    className="flex w-full items-start justify-between gap-3 text-left"
                                                    onClick={() => toggleSidecarPreviewRow(index)}
                                                >
                                                    <p className="min-w-0 flex-1 truncate text-xs font-medium" title={detail.fileName}>
                                                        {highlightSidecarText(detail.fileName, sidecarPreviewKeyword)}
                                                    </p>
                                                    <p className="shrink-0 text-[11px] text-muted-foreground">
                                                        {locale === "zh"
                                                            ? `${detail.blockCount} 块 / ${detail.selectionCount} 选区${detail.hasPrompt ? " / 提示词" : ""}`
                                                            : `${detail.blockCount} blocks / ${detail.selectionCount} selections${detail.hasPrompt ? " / prompt" : ""}`}
                                                    </p>
                                                </button>
                                                {sidecarPreviewExpandedRows.includes(index) && (
                                                    <div className="mt-2 space-y-1 rounded-md border border-border/50 bg-muted/30 p-2">
                                                        {detail.previewTexts.length ? (
                                                            detail.previewTexts.map((text, textIndex) => (
                                                                <div key={`${detail.fileName}-${index}-${textIndex}`} className="space-y-0.5">
                                                                    <p className="text-[11px] leading-snug">
                                                                        <span className="text-muted-foreground">
                                                                            {locale === "zh" ? "原文" : "Src"}:
                                                                        </span>{" "}
                                                                        {highlightSidecarText(text.sourceText || "-", sidecarPreviewKeyword)}
                                                                    </p>
                                                                    <p className="text-[11px] leading-snug">
                                                                        <span className="text-muted-foreground">
                                                                            {locale === "zh" ? "译文" : "Tr"}:
                                                                        </span>{" "}
                                                                        {highlightSidecarText(text.translatedText || "-", sidecarPreviewKeyword)}
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
                                                )}
                                            </div>
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
