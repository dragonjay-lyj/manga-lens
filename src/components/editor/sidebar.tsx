"use client"

import { useRef, useCallback, useEffect, useState } from "react"
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
    File,
    FolderOpen,
    Clipboard,
    X,
    ChevronDown,
    Settings,
    Coins,
    Languages,
    Loader2,
} from "lucide-react"
import { getMessages } from "@/lib/i18n"
import { detectTextBlocks, GEMINI_MODELS, OPENAI_MODELS } from "@/lib/ai/ai-service"
import { imageToDataUrl, loadImage } from "@/lib/utils/image-utils"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

export function EditorSidebar() {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const folderInputRef = useRef<HTMLInputElement>(null)
    const [isAutoDetecting, setIsAutoDetecting] = useState(false)

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
    useEffect(() => {
        const fetchCoins = async () => {
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
        }
        fetchCoins()
    }, [setCoins, setCoinsLoading])

    // 处理文件上传
    const handleFileUpload = useCallback((files: FileList | null) => {
        if (!files) return

        const imageFiles = Array.from(files).filter((file) =>
            file.type.startsWith("image/")
        )

        if (imageFiles.length > 0) {
            addImages(imageFiles)
        }
    }, [addImages])

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
    const useMaskMode = settings.useMaskMode ?? true
    const enablePretranslate = settings.enablePretranslate ?? false
    const canRunAutoDetect = Boolean(settings.apiKey)
    const detectedBlocks = currentImage?.detectedTextBlocks || []

    const handleAutoDetectText = useCallback(async () => {
        if (!currentImage) {
            toast.error(locale === "zh" ? "请先选择图片" : "Please select an image first")
            return
        }
        if (!canRunAutoDetect) {
            toast.error(locale === "zh" ? "自动检测需要填写 API Key" : "Auto-detection requires API key")
            return
        }

        setIsAutoDetecting(true)
        try {
            const image = await loadImage(currentImage.originalUrl)
            const imageData = imageToDataUrl(image)

            const result = await detectTextBlocks({
                imageData,
                config: {
                    provider: settings.provider,
                    apiKey: settings.apiKey,
                    baseUrl: settings.baseUrl,
                    model: settings.model,
                },
                targetLanguage: "简体中文",
            })

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
            setDetectedTextBlocks(currentImage.id, result.blocks)
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
        settings.apiKey,
        settings.baseUrl,
        settings.model,
        settings.provider,
        updateSelections,
    ])

    return (
        <div className="w-80 border-r border-border glass-card flex flex-col h-full overflow-hidden">
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

                        {/* 隐藏的文件输入 */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            aria-label={locale === "zh" ? "上传图片文件" : "Upload image files"}
                            className="hidden"
                            onChange={(e) => handleFileUpload(e.target.files)}
                        />
                        <input
                            ref={folderInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            aria-label={locale === "zh" ? "上传图片文件夹" : "Upload image folder"}
                            // @ts-expect-error webkitdirectory is not in types
                            webkitdirectory="true"
                            className="hidden"
                            onChange={(e) => handleFileUpload(e.target.files)}
                        />
                    </div>

                    {/* 图片列表 */}
                    {images.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-sm font-medium">
                                {t.editor.sidebar.files} ({images.length})
                            </p>
                            <div className="grid grid-cols-3 gap-2">
                                {images.map((img) => (
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
                            {locale === "zh" ? "自动检测文本并生成选区" : "Auto-detect text to selections"}
                        </Button>
                        {!canRunAutoDetect && (
                            <p className="text-xs text-muted-foreground">
                                {locale === "zh" ? "自动检测需要先填写 API Key" : "Auto-detection needs API key"}
                            </p>
                        )}

                        {(detectedBlocks.length > 0 || currentImage?.detectedTextUpdatedAt) && (
                            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-medium">
                                        {locale === "zh" ? "预翻译结果" : "Pre-translation Results"} ({detectedBlocks.length})
                                    </p>
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
                                {currentImage?.detectedTextUpdatedAt && (
                                    <p className="text-[11px] text-muted-foreground">
                                        {locale === "zh" ? "更新时间" : "Updated"}:{" "}
                                        {new Date(currentImage.detectedTextUpdatedAt).toLocaleString()}
                                    </p>
                                )}

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
                                                    <p className="text-[11px] leading-snug">
                                                        <span className="text-muted-foreground">{locale === "zh" ? "原文" : "Src"}:</span>{" "}
                                                        {block.sourceText || "-"}
                                                    </p>
                                                    <p className="text-[11px] leading-snug">
                                                        <span className="text-muted-foreground">{locale === "zh" ? "译文" : "Tr"}:</span>{" "}
                                                        {block.translatedText || "-"}
                                                    </p>
                                                    <p className="text-[10px] text-muted-foreground">
                                                        bbox: x={block.bbox.x.toFixed(3)}, y={block.bbox.y.toFixed(3)}, w={block.bbox.width.toFixed(3)}, h={block.bbox.height.toFixed(3)}
                                                    </p>
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
                                        {coins < 10 && (
                                            <p className="text-destructive font-medium">
                                                {locale === "zh" ? "余额不足，请充值" : "Insufficient balance"}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-3 p-3 rounded-lg bg-muted/50">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="use-mask-mode" className="text-sm cursor-pointer">
                                        {locale === "zh" ? "全图遮罩模式（推荐）" : "Full-image mask mode (recommended)"}
                                    </Label>
                                    <Switch
                                        id="use-mask-mode"
                                        checked={useMaskMode}
                                        onCheckedChange={(checked) => updateSettings({ useMaskMode: checked })}
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {locale === "zh"
                                        ? "只保留选区内容，整图一次请求，减少调用次数并保留布局上下文。"
                                        : "Keep selected areas only and send once for better context with fewer calls."}
                                </p>

                                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                                    <Label htmlFor="enable-pretranslate" className="text-sm cursor-pointer">
                                        {locale === "zh" ? "预翻译（视觉模型）" : "Pre-translate with vision model"}
                                    </Label>
                                    <Switch
                                        id="enable-pretranslate"
                                        checked={enablePretranslate}
                                        onCheckedChange={(checked) => updateSettings({ enablePretranslate: checked })}
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {locale === "zh"
                                        ? "生成前先识别文字与位置并翻译为中文，再作为上下文增强重绘。"
                                        : "Run OCR+translation before generation and inject it as layout-aware context."}
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
                </div>
            </ScrollArea>
        </div>
    )
}
